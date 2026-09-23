/** Finite event-triggered core: explicit paused inference, no periodic planner rounds. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
import {DecisionChannel} from '../src/decision-channel.js';
import {stopTrialWork,retireUndecided,workSummary} from '../src/work-trial.js';
import {NeedsRunGuard,needsOutput} from './needs-policy.js';
import {socialCleanup} from './social-cleanup.js';
import {coreAdmission} from '../src/core-scheduler.js';
import {coreEventsInferencePassed} from './core-events-policy.js';
import {retainedDomain} from './retention-policy.js';
if(process.env.CONCORD_CORE_EVENTS_LOCKED!=='1')throw Error('Use scripts/run-core-events-lab.sh game|cold');
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold'),scripted=process.argv.includes('--scripted');
const runId=process.env.CONCORD_TRIAL_ID;
if(!runId||!/^[0-9a-f-]{36}$/.test(runId)||process.env.CONCORD_TRIAL_POLICY!=='core-events-v1')throw Error('Trial identity required');
const receipt:any={passed:false,runId,policy:'core-events-v1',mode:scripted?'scripted':'live',views:[],rounds:[],samples:[]};
const guard=new NeedsRunGuard(),controller=new AbortController(),end=Date.now()+900000;
let c:Coordinator|undefined,s:Store|undefined,db:string|undefined,connected=true,coreAttempts=0,pawnAttempts=0;
const stop=()=>{connected=false;guard.stop();controller.abort();channel.close();};
const send=needsOutput(process.stdout,stop);
const channel=new DecisionChannel(raw=>{const m=raw as any;guard.check();if(m.type==='decision-request'){
 if(cold||!['core','core-answer','decision'].includes(m.mode))throw Error('Core admission closed');
 if(m.mode==='core'?++coreAttempts>4:++pawnAttempts>5)throw Error('Core trial cap');
 m.notAfter=end;receipt.views.push({mode:m.mode,view:m.view,at:Date.now()});
 }send(m);});
let drained:(()=>void)|undefined;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>32000)throw Error('Response too large');const m=JSON.parse(line);if(m.type==='drained'&&m.id===runId){drained?.();return;}channel.receive(m);}catch{stop();}});
input.on('close',stop);const timer=setTimeout(stop,900000);
async function finish(){channel.close();if(!connected)throw Error('Host disconnected');await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Drain timeout')),15000);drained=()=>{clearTimeout(t);resolve();};send({type:'drain',id:runId});});receipt.hostDrained=true;}
async function save(failed=false){const checkpoint='lab-concord-events-'+Date.now();await c!.checkpoint(checkpoint);const domain=c!.inspect();await writeFile(root+'/.runtime/core-events-latest.json',JSON.stringify({runId,mode:receipt.mode,db,checkpoint,domain,failed}));return {checkpoint,domain};}
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/core-events-latest.json','utf8'));assert.equal(saved.runId,runId);assert.equal(saved.mode,receipt.mode);receipt.verifiesFailedRun=saved.failed;
  s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);guard.check();retainedDomain(c.inspect(),saved.domain);assert.deepEqual(c.inspect().coreState,saved.domain.coreState);receipt.coldRestore=true;receipt.coreState=c.inspect().coreState;receipt.report=(await b.state()).crewLog;
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/needs-fixture.json','utf8'));await b.load(f.name);guard.check();await b.admin('pause');guard.check();
  db=root+'/.runtime/core-events-'+runId+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();
  await c.initializeCore('Coordinate useful nearby hauling with the crew. Ask about a priority if useful, offer only observed work, respect refusal and follow up on your offers. There is no requirement to keep everyone busy. Cooking and construction are not available.');
  receipt.initial=await b.state();assert(receipt.initial.pawns.every((p:any)=>!p.downed));receipt.initialPerspective=await c.corePerspective();
  await c.configureCoreSchedule({maxAttempts:4,cooldownTicks:60,windowTicks:18000});
  const nativeLimit=scripted?40000:120000;let nativeElapsed=0;
  const startTick=(await b.state()).ticks;
  guard.check();await b.admin('run');guard.check();let nativeStarted:number|undefined=Date.now();
  const nativeRemaining=()=>nativeLimit-nativeElapsed-(nativeStarted===undefined?0:Date.now()-nativeStarted);
  while(nativeRemaining()>0){
   guard.check();await c.reconcile();guard.check();
   await c.advanceIntentions(()=>!guard.stopped&&nativeRemaining()>0);guard.check();
   const state=await b.state();guard.sample(state.paused,state.ticks,startTick);
   receipt.samples.push({tick:state.ticks,paused:state.paused});
   const view=await c.corePerspective();guard.check();
   if(nativeRemaining()<=0)break;
   if(coreAdmission(c.inspect().coreState!.schedule!,view).ready){
    await b.admin('pause');nativeElapsed+=Date.now()-nativeStarted!;nativeStarted=undefined;guard.check();
    if(nativeElapsed>=nativeLimit)break;
    const result=await c.planCoreWhenDue(channel,45000,controller.signal);guard.check();
    const round:any={index:receipt.rounds.length,result};if(result.status!=='idle')receipt.rounds.push(round);
    if(result.status==='applied'&&result.questionId){round.answer=await c.answerCoreQuestion(result.questionId,channel,45000,controller.signal);guard.check();}
    if(result.status==='applied'&&result.proposalId){const p=c.inspect().proposals[result.proposalId]!;try{await c.pawn(p.pawn).decide(p.id,channel,45000,controller.signal);}catch(e){round.pawnError=String(e);await retireUndecided(c,p.id,'Decision unavailable; no retry');}guard.check();round.proposal=c.inspect().proposals[p.id];}
    if(result.status!=='idle')round.after=await c.corePerspective();
    guard.check();await b.admin('run');guard.check();nativeStarted=Date.now();
   }else await delay(400);
  }
  await b.admin('pause');guard.check();await c.reconcile();guard.check();
  receipt.nativeElapsedMs=nativeElapsed+(nativeStarted===undefined?0:Math.max(0,Date.now()-nativeStarted));
  await finish();guard.check();receipt.beforeCleanup=c.inspect();receipt.final=await b.state();receipt.cleanup=await stopTrialWork(c);assert.equal(receipt.cleanup.errors.length,0);guard.check();receipt.summary=workSummary(c.inspect());
  if(scripted){assert.equal(receipt.rounds[0].proposal.status,'deferred');assert(receipt.rounds.every((r:any)=>r.result.status==='applied'));assert.equal(receipt.rounds[1].proposal.status,'countered');assert.equal(receipt.rounds[2].proposal.decision.kind,'accept');assert(receipt.summary.completedTrips>=1);}
  receipt.inferencePassed=coreEventsInferencePassed(receipt.rounds);assert(receipt.inferencePassed,'Inference failure preserved; not a passing live trial');
  const saved=await save();await c.restore(saved.checkpoint);guard.check();retainedDomain(c.inspect(),saved.domain);assert.deepEqual(c.inspect().coreState,saved.domain.coreState);receipt.pairedRestore=true;receipt.coreState=c.inspect().coreState;receipt.report=(await b.state()).crewLog;
 }
 guard.check();receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{
 clearTimeout(timer);if(!receipt.hostDrained)try{await finish();}catch(e){receipt.passed=false;receipt.drainError=String(e);process.exitCode=1;}
 receipt.finalCleanup=await socialCleanup(()=>b.admin('pause'),async()=>{},async()=>c&&!cold?stopTrialWork(c):{errors:[]});
 if(receipt.finalCleanup.errors.length){receipt.passed=false;process.exitCode=1;}
 if(!cold&&c&&db&&!receipt.passed&&!receipt.finalCleanup.errors.length)try{await save(true);receipt.partialSaved=true;}catch(e){receipt.partialSaveError=String(e);}
 receipt.coreAttempts=coreAttempts;receipt.pawnAttempts=pawnAttempts;input.close();s?.close();await writeFile(root+'/.runtime/core-events-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));send({type:'receipt',receipt});
}
