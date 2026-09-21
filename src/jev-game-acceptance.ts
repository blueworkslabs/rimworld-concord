/** Operator-only real-game runner: live appraisal, scripted continuation, no proposals.
 * Launched under the coordinator lock by the protected-host SSH driver.
 */
import assert from 'node:assert/strict';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { Coordinator } from './coordinator.js';
import { Store } from './store.js';
import { LabBridge } from './lab-bridge.js';
import { AttentionPump } from './attention.js';
import { AppraisalChannel } from './appraisal-channel.js';

const root=new URL('../..',import.meta.url).pathname;
const send=(m:unknown)=>{process.stdout.write(JSON.stringify(m)+'\n');};
const channel=new AppraisalChannel(send);
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try {if(line.length>4096)throw Error();channel.receive(JSON.parse(line));}catch{channel.close();}});
input.on('close',()=>channel.close());
const bridge=new LabBridge();
const checks:string[]=[];
const receipt:Record<string,unknown>={at:new Date().toISOString(),kind:'jev-live-game-appraisal',passed:false,checks};
let store:Store|undefined,pump:AttentionPump|undefined;
try {
 await mkdir(root+'/.runtime',{recursive:true});
 if(process.argv.includes('--cold')) {
   const saved=JSON.parse(await readFile(root+'/.runtime/jev-game-latest.json','utf8'));
   store=new Store(saved.db);const c=new Coordinator(store,bridge);await c.restore(saved.checkpoint);
   assert((await bridge.state()).paused);assert.notEqual(c.inspect().epoch,saved.epoch);
   assert.deepEqual(c.inspect().characters,saved.characters);
   checks.push('cold restore preserves live-appraised character attention with a new timeline');
 } else {
   await bridge.load('lab-initial');
   const db=root+'/.runtime/jev-game-'+Date.now()+'.db';store=new Store(db);
   const c=new Coordinator(store,bridge);await c.open();
   let attempts=0,completed=0,reflections=0,pending=false,firstTick:number|undefined,ticksDuringAppraisal=0;
   const appraisals:Array<{pawn:string;throughSeq:number;kinds:string[];reflectionScore:number}>=[];
   pump=new AttentionPump(c,{name:'scripted-native-continuation',async reflect(){
     reflections++;return {kind:'continue',reason:'Scripted test continuation; no model-authored action'};
   }},{name:channel.name,async assess(view,signal){
     assert(attempts<2,'Live trial request cap');attempts++;pending=true;firstTick=undefined;
     assert(view.event.pawn===view.pawn.id&&view.character.id===view.pawn.id);
     assert(view.events?.every(e=>e.pawn===view.pawn.id));
     try {
       const result=await channel.assess(view,signal);
       appraisals.push({pawn:view.pawn.id,throughSeq:view.event.seq,kinds:[...new Set(view.events!.map(e=>e.kind))],reflectionScore:result.reflectionScore});
       completed++;return result;
     } finally {pending=false;firstTick=undefined;}
   }},{cooldownTicks:120,timeoutMs:30000},{maxConcurrent:1,maxTurns:30});
   await bridge.admin('run');
   const until=Date.now()+180000;
   while(Date.now()<until) {
     // Once two requests are claimed, reconcile only: never start a third model turn.
     if(attempts<2)await pump.poll();else await c.reconcile();
     const game=await bridge.state();
     if(pending) {if(firstTick!==undefined)ticksDuringAppraisal+=game.ticks-firstTick;firstTick=game.ticks;}
     if(attempts>=2&&pump.status().pending===0)break;
     await delay(60);
   }
   await pump.stop();await bridge.admin('pause');await c.reconcile();
   assert.equal(completed,2,'Two successful live appraisals required');
   assert(pump.results.every(r=>r.status!=='failed'&&r.status!=='interrupted'));
   assert(ticksDuringAppraisal>0,'Game must tick during actual appraisal');
   const state=c.inspect();
   assert.equal((await bridge.state()).actions.length,0);assert.equal(Object.keys(state.proposals).length,0);
   checks.push('two naturally captured pawn-owned event batches pass through live Jev appraisal');
   checks.push('native simulation advances during actual network appraisal; no proposals or jobs dispatched');
   const audit=store.events().map(e=>e.event);
   const routing=appraisals.map(a=>{
     const expected=a.reflectionScore<0.5?'attention-appraised':'attention-reflected';
     assert(audit.some(e=>e.actor===a.pawn&&e.kind===expected&&(e.data as {throughSeq?:number}).throughSeq===a.throughSeq));
     return {...a,route:a.reflectionScore<0.5?'native':'scripted-deliberation'};
   });
   checks.push('coordinator follows each measured score; escalation uses scripted continuation only');
   const checkpoint='lab-concord-jev-'+Date.now();await c.checkpoint(checkpoint);const saved=c.inspect();
   await c.restore(checkpoint);assert.deepEqual(c.inspect().characters,saved.characters);
   checks.push('paired restore preserves live attention cursors and character state without another call');
   await writeFile(root+'/.runtime/jev-game-latest.json',JSON.stringify({db,checkpoint,epoch:c.inspect().epoch,characters:saved.characters}));
   Object.assign(receipt,{appraisals:routing,attempts,reflections,ticksDuringAppraisal,checkpoint,
     attentionResults:pump.results.map(r=>({status:r.status,throughSeq:r.throughSeq}))});
 }
 receipt.passed=true;
}catch {receipt.error='Real-game Jev acceptance failed; inspect private runner state';process.exitCode=1;}
finally {
 await pump?.stop();try{await bridge.admin('pause');}catch{}
 channel.close();input.close();store?.close();
 await writeFile(root+'/.runtime/jev-game'+(process.argv.includes('--cold')?'-cold':'')+'.json',JSON.stringify(receipt,null,2));
 send({type:'receipt',receipt});
}
