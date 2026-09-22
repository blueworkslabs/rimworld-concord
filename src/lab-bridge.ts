import { readFile, writeFile, rename, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import type { Activity, DecisionPause, ActionRequest, GameBridge, GameState, Receipt } from './protocol.js';
const exec=promisify(execFile);

/** Local trusted staging transport. Caller must own the process lock (scripts/run-lab.sh). */
export class LabBridge implements GameBridge {
  constructor(readonly root=process.env.RIMWORLD_LAB_ROOT ?? '') {
    if(!root || !root.startsWith('/')) throw Error('Set RIMWORLD_LAB_ROOT to an absolute isolated lab directory');
  }
  private queue:Promise<unknown>=Promise.resolve();
  private request(payload:Record<string,unknown>):Promise<{state:GameState;receipt:Receipt}> {
    const result=this.queue.then(()=>this.exchange(payload));
    this.queue=result.catch(()=>{}); return result;
  }
  async setDecisionPause(pause:DecisionPause) { await this.request({op:'decision-pause',...pause}); }
  async setActivity(activity:Activity) { await this.request({op:'activity',...activity}); }
  private async exchange(payload:Record<string,unknown>):Promise<{state:GameState;receipt:Receipt}> {
    const request=join(this.root,'concord/request.json');
    try { await access(request); throw Error('Previous domain command pending: inspect before retry'); }
    catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e; }
    const id=String(payload.id??randomUUID());
    await writeFile(request+'.tmp',JSON.stringify({...payload,id}),{mode:0o600});
    await rename(request+'.tmp',request);
    const end=Date.now()+10000;
    while(Date.now()<end) {
      try {
        const response=JSON.parse(await readFile(join(this.root,'concord/response.json'),'utf8'));
        if(response.id===id) {
          if(!response.ok) throw Error(response.error);
          return response;
        }
      } catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e; }
      await delay(30);
    }
    throw Error('Bridge timeout; command may have executed: reconcile before retry');
  }
  async state():Promise<GameState> {return (await this.request({op:'state'})).state;}
  async move(r:ActionRequest):Promise<Receipt> {
    return (await this.request({op:r.action.kind,...r.action,actionId:r.id,epoch:r.epoch,actor:r.actor,untilTick:r.untilTick,mapId:r.mapId??-1})).receipt;
  }
  async cancel(r:{epoch:string;actor:string;id:string}) {return (await this.request({op:'cancel',epoch:r.epoch,actor:r.actor,actionId:r.id})).receipt;}
  async admin(op:string,name?:string) {
    const {stdout}=await exec('python3',[join(this.root,'bin/lab.py'),'command',op,...name?[name]:[]],{timeout:130000});
    return JSON.parse(stdout);
  }
  async hash(name:string) {
    if(!/^lab-concord-[a-zA-Z0-9-]{1,40}$/.test(name)) throw Error('Invalid checkpoint name');
    return createHash('sha256').update(await readFile(join(this.root,'profile/Saves',name+'.rws'))).digest('hex');
  }
  async verify(name:string,hash:string) {if(await this.hash(name)!==hash) throw Error('Checkpoint hash mismatch');}
  async save(name:string) {
    // Never overwrite an existing paired or orphaned game save.
    try {await access(join(this.root,'profile/Saves',name+'.rws')); throw Error('Save already exists');}
    catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;}
    await this.admin('save',name); return {sha256:await this.hash(name)};
  }
  async load(name:string) {
    await this.admin('load',name);
    const end=Date.now()+120000;
    while(Date.now()<end) {
      const response=await this.admin('state');
      if(response.state.loaded && !response.state.loading) return;
      await delay(200);
    }
    throw Error('Load timed out');
  }
}
