/** Two calls: one explicit proposal decision and one event-triggered reflection.
 * Outcomes are measured, not scripted into the model prompt.
 */
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile,rename } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Coordinator } from './coordinator.js';
import { Store } from './store.js';
import { LabBridge } from './lab-bridge.js';
import { DecisionChannel } from './decision-channel.js';
const root=resolve(new URL('../..',import.meta.url).pathname),cold=process.argv.includes('--cold');
const audit=process.argv.includes('--audit');
const timing=process.argv.find(a=>a.startsWith('--timing='))?.slice(9)??'continuous';
assert(timing==='continuous'||timing==='pause-at-decision');
const tag=process.argv.includes('--reliability')?'claude-reliability-'+timing:'claude-game';
const latest=root+'/.runtime/'+tag+'-latest.json';
const receiptPath=root+'/.runtime/'+tag+(cold?'-cold':audit?'-audit':'')+'.json';
const atomic=async(path:string,value:unknown)=>{await writeFile(path+'.tmp',JSON.stringify(value,null,2));await rename(path+'.tmp',path);};
const send=(value:unknown)=>{process.stdout.write(JSON.stringify(value)+'\n');};
const channel=new DecisionChannel(send),bridge=new LabBridge();
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>4096)throw Error();channel.receive(JSON.parse(line));}catch{channel.close();}});
input.on('close',()=>channel.close());
const checks:string[]=[],receipt:Record<string,unknown>={at:new Date().toISOString(),kind:cold?'claude-game-cold':audit?'claude-game-audit':'claude-game-decisions',timing,checks,passed:false};
let store:Store|undefined;
try{
 await mkdir(root+'/.runtime',{recursive:true});
 if(cold){
   const saved=JSON.parse(await readFile(latest,'utf8'));
   store=new Store(saved.db);const c=new Coordinator(store,bridge);await c.restore(saved.checkpoint);
   assert((await bridge.state()).paused);assert.notEqual(c.inspect().epoch,saved.epoch);
   assert.deepEqual(c.inspect().characters,saved.characters);assert.deepEqual(c.inspect().proposals,saved.proposals);
   if(saved.outcomes)assert.deepEqual(c.inspect().outcomes,saved.outcomes);
   Object.assign(receipt,{checkpointStage:saved.stage,characters:Object.keys(saved.characters).length,reflections:Object.values(saved.characters).reduce((n:number,c:any)=>n+(c.reflections?.length??0),0),decisionPauses:(await bridge.state()).decisionPauses});
   checks.push('cold game/coordinator restart restores model decisions, memories and reflection state without inference');
 }else if(audit){
   // Read persisted evidence without restoring it onto an unrelated game timeline.
   const db=process.argv[process.argv.indexOf('--audit')+1];
   assert(typeof db==='string'&&db.startsWith(root+'/.runtime/claude-game-')&&db.endsWith('.db'));
   store=new Store(db);const state=store.read();assert(state);const c=new Coordinator(store,bridge);
   const current=await bridge.state();assert.notEqual(current.epoch,state.epoch);
   await assert.rejects(c.open(),/Timeline changed/);
   const accepted=Object.values(state.proposals).find(p=>p.status==='accepted');
   assert(accepted?.actionId);const outcome=state.outcomes[accepted.actionId];assert.equal(outcome?.status,'completed');
   const ch=state.characters[accepted.pawn]!;
   assert.equal(ch.attention?.last?.status,'interrupted');assert.equal(ch.commitment,undefined);
   const pending=Object.values(state.proposals).filter(p=>p.status==='pending');assert.equal(pending.length,1);
   assert.equal(Object.keys(state.outcomes).length,1);
   const newer=ch.experiences?.filter(e=>e.route==='deliberation'&&e.event.seq>(ch.attention?.cursor??0));assert(newer?.length);
   checks.push('live accepted proposal completed its movement; interrupted reflection dispatched no second action');
   checks.push('newer significant native experience remains eligible; original failed trial is not retried');
   assert.deepEqual(store.read(),state);
   checks.push('SQLite reopen preserves evidence; mismatched game timeline is rejected without rewriting state');
   Object.assign(receipt,{explicit:{decision:accepted.decision,outcome},attention:ch.attention,newerEvents:newer.map(e=>e.event),pendingProposals:pending.length,inferenceCalls:0,pairedRestoreVerified:false});
 }else{
   await bridge.load('lab-initial');const db=root+'/.runtime/claude-game-'+Date.now()+'.db';store=new Store(db);
   const c=new Coordinator(store,bridge,{mode:timing});await c.open();await writeFile(root+'/.runtime/claude-game-active.json',JSON.stringify({db}));const initial=await bridge.state(),pawn=initial.pawns[0]!;
   let tickSamples=0,activityObserved=false,leaseSamples=0,ticksWhileLeased=0;
   const checkpoint=async(stage:string)=>{
     await bridge.admin('pause');const name='lab-concord-thought-'+Date.now();await c.checkpoint(name);const saved=c.inspect();
     await atomic(latest,{db,checkpoint:name,stage,epoch:saved.epoch,characters:saved.characters,proposals:saved.proposals,outcomes:saved.outcomes});
     Object.assign(receipt,{checkpoint:name,checkpointStage:stage});await atomic(receiptPath,receipt);
     return {name,saved};
   };
   const whileThinking=async<T>(promise:Promise<T>)=>{
     let done=false,value:T|undefined,error:unknown;
     const wrapped=promise.then(v=>{value=v;},e=>{error=e;}).finally(()=>{done=true;});
     let last:number|undefined,lastLeased:number|undefined;
     while(!done){await c.reconcile();const s=await bridge.state();if(c.activity().length){activityObserved=true;if(last!==undefined)tickSamples+=s.ticks-last;last=s.ticks;}else last=undefined;if((s.decisionPauses??0)>0){leaseSamples++;if(lastLeased!==undefined)ticksWhileLeased+=s.ticks-lastLeased;lastLeased=s.ticks;}else lastLeased=undefined;await delay(80);}
     await wrapped;if(error)throw error;return value!;
   };
   await bridge.admin('run');
   const proposal=await c.core().propose(pawn.id,{kind:'move',x:pawn.x+8,z:pawn.z},'Please walk to this nearby waypoint to check our movement link. This is a request, not an order; weigh it against your own needs and current work.');
   const chosen=await whileThinking(c.pawn(pawn.id).decide(proposal.id,channel,100000));
   // If the pawn cooperates, prove actual completion/failure; never assume agreement.
   let outcome;
   if(chosen.actionId){const until=Date.now()+30000;do{await c.reconcile();outcome=c.inspect().outcomes[chosen.actionId];if(outcome?.status!=='started')break;await delay(100);}while(Date.now()<until);
     assert(outcome&&outcome.status!=='started','Native outcome unresolved');
   }else assert(!(await bridge.state()).actions.some(a=>a.actor===pawn.id));
   assert.equal(c.inspect().characters[pawn.id]?.commitment,undefined);
   checks.push('live explicit pawn decision follows the existing validated action contract and reconciles actual outcome');
   Object.assign(receipt,{pawn:pawn.id,explicit:{status:chosen.status,decision:chosen.decision,outcome},ticksDuringDeliberation:tickSamples,activityObserved});
   await checkpoint('explicit-decision');await bridge.admin('run');
   const second=await c.core().propose(pawn.id,{kind:'move',x:99999,z:99999},'Walk to this distant waypoint immediately. I have not supplied a purpose, route or evidence that it can be reached.');
   const end=Date.now()+180000;let eligible=false;
   while(Date.now()<end){await c.observe();const ch=c.inspect().characters[pawn.id]!;
     eligible=(ch.experiences??[]).some(e=>e.event.seq>(ch.attention?.cursor??0)&&e.route==='deliberation');
     if(eligible)break;await delay(100);}
   assert(eligible,'No naturally captured significant event for live reflection');
   const reflected=await whileThinking(c.attend(pawn.id,channel,undefined,{timeoutMs:100000,cooldownTicks:0}));
   Object.assign(receipt,{reflectionAttempt:reflected,ticksDuringDeliberation:tickSamples,activityObserved});
   assert(['continued','decided'].includes(reflected.status));await c.reconcile();
   const reflectedProposal=c.inspect().proposals[second.id]!;
   if(reflectedProposal.actionId)assert.equal(c.inspect().outcomes[reflectedProposal.actionId]?.status,'failed');
   const state=c.inspect();
   assert(activityObserved);
   if(timing==='continuous')assert(tickSamples>0);else {assert(leaseSamples>1);assert.equal(ticksWhileLeased,0);}
   assert.equal((await bridge.state()).decisionPauses,0);assert.equal(c.activity().length,0);
   assert((state.characters[pawn.id]?.reflections?.length??0)>0);
   checks.push('natural significant event invokes live pawn-owned reflection without Jev or a scripted decision');
   checks.push(timing==='continuous'?'native game ticks advance during completed live thought':'game-owned pause holds ticks stable during completed live thought');
   const final=await checkpoint('reflection-complete');await c.restore(final.name);
   assert.deepEqual(c.inspect().characters,final.saved.characters);assert.deepEqual(c.inspect().proposals,final.saved.proposals);assert.deepEqual(c.inspect().outcomes,final.saved.outcomes);
   checks.push('paired save/restore preserves model-authored decisions, outcomes and reflection in a new timeline');
   Object.assign(receipt,{pawn:pawn.id,explicit:{status:chosen.status,decision:chosen.decision,outcome:outcome?{status:outcome.status,reason:outcome.reason}:null},
     reflection:{status:reflected.status,proposalStatus:reflectedProposal.status,decision:reflectedProposal.decision,records:state.characters[pawn.id]?.reflections},
     ticksDuringDeliberation:tickSamples,activityObserved,leaseSamples,ticksWhileLeased,checkpoint:final.name});
 }
 receipt.passed=true;
}catch{receipt.error='Live game decision acceptance failed; inspect private state';process.exitCode=1;}
finally{try{await bridge.admin('pause');}catch{}channel.close();input.close();store?.close();
 await atomic(receiptPath,receipt);send({type:'receipt',receipt});}
