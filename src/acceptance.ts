import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Coordinator } from './coordinator.js';
import { Store } from './store.js';
import { LabBridge } from './lab-bridge.js';
import { scripted } from './backends.js';
const exec=promisify(execFile);
const root=new URL('../..',import.meta.url).pathname;
await mkdir(root+'/.runtime',{recursive:true});
const bridge=new LabBridge();
const cold=process.argv.includes('--cold');
const checks:string[]=[];
let store:Store|undefined;
const output:Record<string,unknown>={at:new Date().toISOString(),phase:cold?'cold-restore':'game-loop',checks,passed:false};
try {
 if(cold) {
   const previous=JSON.parse(await readFile(root+'/.runtime/latest.json','utf8'));
   store=new Store(previous.db);
   const c=new Coordinator(store,bridge);
   await c.restore(previous.checkpoint);
   const state=await bridge.state();
   assert(state.paused);assert.notEqual(state.epoch,previous.epoch);
   assert.deepEqual(state.pawns.map(p=>p.id).sort(),previous.pawns);
   assert.deepEqual(c.inspect().characters,previous.characters);
   checks.push('cold game + coordinator restore preserves identities, character memories and paused state');
   output.epoch=state.epoch;output.ticks=state.ticks;
 } else {
   await bridge.load('lab-initial');
   const db=root+'/.runtime/trial-'+Date.now()+'.db';store=new Store(db);
   const c=new Coordinator(store,bridge);await c.open();
   const initial=await bridge.state();assert(initial.paused);assert.equal(initial.pawns.length,3);
   const a=initial.pawns[0]!,b=initial.pawns[1]!;
   const refused=await c.core().propose(a.id,{kind:'move',x:a.x+1,z:a.z},'Move supplies');
   await c.pawn(a.id).decide(refused.id,scripted({kind:'refuse',reason:'I need to finish my existing commitment'}));
   assert.equal((await bridge.state()).actions.length,0);
   checks.push('refusal does not dispatch a job');
   await assert.rejects(bridge.move({id:randomUUID(),epoch:initial.epoch,actor:'core',action:{kind:'move',x:a.x,z:a.z}}),/Actor/);
   checks.push('game bridge rejects core as pawn actor');
   let accepted:string|undefined;
   for(const [dx,dz] of [[8,0],[-8,0],[0,8],[0,-8]] as const) {
     const p=await c.core().propose(a.id,{kind:'move',x:a.x+dx,z:a.z+dz},'Please move to the test waypoint');
     const chosen=await c.pawn(a.id).decide(p.id,scripted({kind:'accept',reason:'I choose to take this route'}));
     const result=c.inspect().outcomes[chosen.actionId!]!;
     if(result.status==='started') {accepted=p.id;break;}
   }
   assert(accepted,'No reachable test waypoint');
   const p=c.inspect().proposals[accepted]!;
   const original=(await bridge.state()).actions.length;
   const replay=await bridge.move({id:p.actionId!,epoch:initial.epoch,actor:a.id,action:p.action});
   assert.equal(replay.id,p.actionId);assert.equal((await bridge.state()).actions.length,original);
   await assert.rejects(bridge.move({id:p.actionId!,epoch:initial.epoch,actor:a.id,action:{...p.action,x:p.action.x+1}}),/collision/);
   checks.push('duplicate action is idempotent; changed payload with same ID rejected');
   await bridge.admin('run');
   const end=Date.now()+30000;
   while(Date.now()<end) {await c.reconcile();if(c.inspect().outcomes[p.actionId!]!.status!=='started')break;await delay(150);}
   await bridge.admin('pause');
   assert.equal(c.inspect().outcomes[p.actionId!]!.status,'completed');
   const moved=(await bridge.state()).pawns.find(x=>x.id===a.id)!;
   assert.equal(moved.x,p.action.x);assert.equal(moved.z,p.action.z);
   checks.push('accepted intention completes a real native Goto job');
   const q=await c.core().propose(b.id,{kind:'move',x:b.x,z:b.z},'Consider another task');
   await bridge.admin('run');const before=(await bridge.state()).ticks;
   const slow=c.pawn(b.id).decide(q.id,{name:'delayed-scripted',async decide(){await delay(2000);return {kind:'refuse',reason:'Stay with my current work'};}});
   await delay(300);assert(c.activity().some(x=>x.pawn===b.id));
   const during=(await bridge.state()).ticks;assert(during>before);
   await slow;await bridge.admin('pause');assert.equal(c.activity().length,0);
   checks.push('simulation advances while pawn deliberates; activity state clears afterwards');
   const off=await c.core().propose(b.id,{kind:'move',x:b.x,z:b.z},'Unavailable backend test');
   await assert.rejects(c.pawn(b.id).decide(off.id,{name:'offline',decide:()=>new Promise(()=>{})},100),/cancelled/);
   checks.push('backend timeout leaves proposal pending and performs no forced fallback job');
   const bad=await c.core().propose(b.id,{kind:'move',x:99999,z:99999},'Unreachable destination');
   const badResult=await c.pawn(b.id).decide(bad.id,scripted({kind:'accept',reason:'Try the proposed route'}));
   assert.equal(c.inspect().outcomes[badResult.actionId!]!.status,'failed');
   assert.equal(c.inspect().characters[b.id]!.commitment,undefined);
   checks.push('infeasible destination reports failure and releases the commitment');
   const checkpoint='lab-concord-'+Date.now();
   await c.checkpoint(checkpoint);const saved=c.inspect();
   const future=await c.core().propose(b.id,{kind:'move',x:b.x,z:b.z},'Discarded future');
   await c.pawn(b.id).decide(future.id,scripted({kind:'refuse',reason:'A memory that must vanish on reload'}));
   const late=await c.core().propose(a.id,{kind:'move',x:a.x,z:a.z},'Late response');
   let release!:(r:unknown)=>void;
   const pending=c.pawn(a.id).decide(late.id,{name:'late',decide:()=>new Promise(r=>release=r)});
   const rejected=assert.rejects(pending,/cancelled|Stale/);
   while(!release) await delay(10);
   await c.restore(checkpoint);
   release({kind:'accept',reason:'Old timeline'});await rejected;
   assert.deepEqual(c.inspect().characters,saved.characters);
   assert.equal(c.inspect().proposals[future.id],undefined);
   await assert.rejects(bridge.move({id:randomUUID(),epoch:initial.epoch,actor:a.id,action:p.action}),/Stale/);
   checks.push('paired restore rolls back memories/proposals, cancels pending decision and rejects old epoch');
   assert((await bridge.state()).paused);
   await exec('python3',[bridge.root+'/bin/lab.py','screenshot','concord-accepted.png']);
   await writeFile(root+'/.runtime/latest.json',JSON.stringify({db,checkpoint,epoch:initial.epoch,pawns:initial.pawns.map(p=>p.id).sort(),characters:saved.characters}));
   output.checkpoint=checkpoint;output.events=store.events().length;output.pawn={id:a.id,from:[a.x,a.z],to:[moved.x,moved.z]};
 }
 output.passed=true;
} catch(e) {output.error=String(e);process.exitCode=1;}
finally {
 try {await bridge.admin('pause');}catch{}
 store?.close();await writeFile(root+'/.runtime/'+(cold?'cold':'acceptance')+'.json',JSON.stringify(output,null,2));
 console.log(JSON.stringify(output,null,2));
}
