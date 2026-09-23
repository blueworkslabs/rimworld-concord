/** Finite event-triggered core: explicit paused inference, no periodic planner rounds. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {startNative} from './native-run.js';
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
import {campfireDecisionMs} from './campfire-policy.js';
import {coreFollowupPolicy,followupInferencePassed} from './core-followup-policy.js';
import {retainedDomain} from './retention-policy.js';
if(process.env.CONCORD_CORE_FOLLOWUP_LOCKED!=='1')throw Error('Use scripts/run-core-followup-lab.sh game|cold');
const root=new URL('../..',import.meta.url).pathname,cold=process.argv.includes('--cold');
const scripted=process.argv.includes('--scripted');
const policy=process.env.CONCORD_TRIAL_POLICY??'',P=coreFollowupPolicy(policy);
const pausedInference=true;let operationDeadline=Date.now()+P.wallMs;const b=new LabBridge(undefined,()=>operationDeadline);
const runId=process.env.CONCORD_TRIAL_ID;
if(!runId||!/^[0-9a-f-]{36}$/.test(runId))throw Error('Trial identity required');
const run=runId;
const receipt:any={passed:false,runId,policy,mode:scripted?'scripted':'live-paused',run,views:[],rounds:[],samples:[]};
const guard=new NeedsRunGuard(),controller=new AbortController(),end=operationDeadline;
let c:Coordinator|undefined,s:Store|undefined,db:string|undefined,connected=true,coreAttempts=0,pawnAttempts=0,inferenceDeadline=end;
const stop=()=>{connected=false;guard.stop();controller.abort();channel.close();};
const send=needsOutput(process.stdout,stop);
const channel=new DecisionChannel(raw=>{const m=raw as any;guard.check();if(m.type==='decision-request'){
 if(cold||!['core','core-answer','decision'].includes(m.mode))throw Error('Core admission closed');
 if(m.mode==='core'?++coreAttempts>P.coreCalls:++pawnAttempts>P.pawnCalls)throw Error('Core trial cap');
 m.notAfter=inferenceDeadline;receipt.views.push({mode:m.mode,view:m.view,at:Date.now()});
 }send(m);});
let drained:(()=>void)|undefined;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>32000)throw Error('Response too large');const m=JSON.parse(line);if(m.type==='drained'&&m.id===runId){drained?.();return;}channel.receive(m);}catch{stop();}});
input.on('close',stop);const timer=setTimeout(stop,P.wallMs);
async function capture(label:string,openPanel=false){
 try{
  const exec=promisify(execFile),options={timeout:Math.max(1,Math.min(10000,operationDeadline-Date.now()))};
  if(openPanel)await exec('python3',[b.root+'/bin/lab.py','click','1150','783'],options);
  const name='core-followup-'+run+'-'+label+'.png';await exec('python3',[b.root+'/bin/lab.py','screenshot',name],options);(receipt.captures??=[]).push(name);
 }catch(e){(receipt.captureErrors??=[]).push(String(e));}
}
async function finish(){channel.close();if(!connected)throw Error('Host disconnected');await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Drain timeout')),15000);drained=()=>{clearTimeout(t);resolve();};send({type:'drain',id:runId});});receipt.hostDrained=true;}
async function save(failed=false){const checkpoint='lab-concord-followup-'+Date.now();await c!.checkpoint(checkpoint);const domain=c!.inspect();await writeFile(root+'/.runtime/core-followup-'+run+'-latest.json',JSON.stringify({runId,mode:receipt.mode,db,checkpoint,domain,failed}));return {checkpoint,domain};}
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/core-followup-'+run+'-latest.json','utf8'));assert.equal(saved.runId,runId);assert.equal(saved.mode,receipt.mode);receipt.verifiesFailedRun=saved.failed;
  s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);guard.check();retainedDomain(c.inspect(),saved.domain);assert.deepEqual(c.inspect().coreState,saved.domain.coreState);receipt.coldRestore=true;receipt.coreState=c.inspect().coreState;receipt.report=(await b.state()).crewLog;
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/campfire-fixture.json','utf8'));await b.load(f.name);guard.check();await b.admin('pause');guard.check();
  db=root+'/.runtime/core-followup-'+runId+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();
  await c.initializeCore('Consider the crew’s shared bodily needs and local supplies. You can ask, propose useful work or wait. Campfire construction and cooking are separate optional capabilities; eating raw food is a legitimate alternative. Alvin, Beatrice and Pedro have equal standing, with no assigned roles or required responses. Respect refusal and deferral. Follow up on actual outcomes; no requirement to keep people busy or finish a particular plan.');
  receipt.initial=await b.state();assert(receipt.initial.pawns.every((p:any)=>!p.downed));receipt.initialPerspective=await c.corePerspective();
  await capture('initial',true);
  await c.configureCoreSchedule({maxAttempts:P.coreCalls,cooldownTicks:P.cooldownTicks,windowTicks:P.windowTicks});
  const nativeLimit=scripted?P.scriptedNativeMs:P.nativeMs;let nativeElapsed=0,midpointCaptured=false;
  const startTick=(await b.state()).ticks;
  guard.check();(receipt.resumes??=[]).push(await startNative(b));guard.check();let nativeStarted:number|undefined=Date.now();
  const nativeRemaining=()=>nativeLimit-nativeElapsed-(nativeStarted===undefined?0:Date.now()-nativeStarted);
  while(nativeRemaining()>0){
   guard.check();await c.reconcile();guard.check();
   await c.advanceIntentions(()=>!guard.stopped&&nativeRemaining()>0);guard.check();
   const state=await b.state();guard.sample(state.paused,state.ticks,startTick);
   receipt.samples.push({tick:state.ticks,paused:state.paused,pawns:state.pawns.map(p=>({id:p.id,job:p.job,food:p.facts?.find(f=>f.key==='need'&&f.value==='Food')?.level}))});
   if(!midpointCaptured&&nativeRemaining()<=nativeLimit/2){midpointCaptured=true;await capture('midpoint');}
   const view=await c.corePerspective();guard.check();
   if(nativeRemaining()<=0)break;
   if(coreAdmission(c.inspect().coreState!.schedule!,view).ready){
    if(pausedInference){await b.admin('pause');nativeElapsed+=Date.now()-nativeStarted!;nativeStarted=undefined;}guard.check();
    if(nativeElapsed>=nativeLimit)break;
    inferenceDeadline=pausedInference?end:Math.min(end,Date.now()+nativeRemaining());
    const decisionMs=()=>campfireDecisionMs(Math.min(end-Date.now(),pausedInference?45000:nativeRemaining()));
    const result=await c.planCoreWhenDue(channel,decisionMs(),controller.signal);guard.check();
    const round:any={index:receipt.rounds.length,result};if(result.status!=='idle')receipt.rounds.push(round);
    if(result.status==='applied'&&result.questionId){round.answer=await c.answerCoreQuestion(result.questionId,channel,decisionMs(),controller.signal);guard.check();}
    if(result.status==='applied'&&result.proposalId){const p=c.inspect().proposals[result.proposalId]!;try{await c.pawn(p.pawn).decide(p.id,channel,decisionMs(),controller.signal);}catch(e){round.pawnError=String(e);await retireUndecided(c,p.id,'Decision unavailable; no retry');}guard.check();round.proposal=c.inspect().proposals[p.id];}
    if(result.status!=='idle')round.after=await c.corePerspective();
    if(pausedInference){guard.check();(receipt.resumes??=[]).push(await startNative(b));guard.check();nativeStarted=Date.now();}
   }else await delay(400);
  }
  await b.admin('pause');guard.check();await c.reconcile();guard.check();
  receipt.nativeElapsedMs=nativeElapsed+(nativeStarted===undefined?0:Math.max(0,Date.now()-nativeStarted));
  await capture('final');
  await finish();guard.check();receipt.beforeCleanup=c.inspect();receipt.final=await b.state();receipt.cleanup=await stopTrialWork(c);assert.equal(receipt.cleanup.errors.length,0);guard.check();receipt.summary=workSummary(c.inspect());receipt.production={campfires:Object.values(c.inspect().outcomes).filter(r=>r.kind==='build'&&r.status==='completed').length,meals:Object.values(c.inspect().outcomes).filter(r=>r.kind==='cook'&&r.status==='completed').reduce((n,r)=>n+(r.delivered??0),0)};
  receipt.inferencePassed=followupInferencePassed(receipt.rounds,P.coreCalls);
  if(scripted){assert.equal(receipt.rounds[0]?.answer?.status,'delivered');assert.equal(receipt.rounds[1]?.result?.status,'applied');assert.equal(c.inspect().coreState?.turns[1]?.choice?.action.kind,'wait');assert.equal(Object.keys(c.inspect().proposals).length,0);}
  const saved=await save(!receipt.inferencePassed);await c.restore(saved.checkpoint);guard.check();retainedDomain(c.inspect(),saved.domain);assert.deepEqual(c.inspect().coreState,saved.domain.coreState);receipt.pairedRestore=true;receipt.coreState=c.inspect().coreState;receipt.report=(await b.state()).crewLog;
 }
 guard.check();receipt.passed=cold||receipt.inferencePassed===true;if(!receipt.passed)process.exitCode=1;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{
 clearTimeout(timer);if(!receipt.hostDrained)try{await finish();}catch(e){receipt.passed=false;receipt.drainError=String(e);process.exitCode=1;}
 receipt.finalCleanup=await socialCleanup(async()=>{operationDeadline=Date.now()+10000;await b.admin('pause');},async()=>{},async()=>{operationDeadline=Date.now()+20000;return c&&!cold?stopTrialWork(c):{errors:[]};});
 if(receipt.finalCleanup.errors.length){receipt.passed=false;process.exitCode=1;}
 if(!cold&&c&&db&&!receipt.passed&&!receipt.pairedRestore&&!receipt.finalCleanup.errors.length)try{operationDeadline=Date.now()+130000;await save(true);receipt.partialSaved=true;}catch(e){receipt.partialSaveError=String(e);}
 receipt.coreAttempts=coreAttempts;receipt.pawnAttempts=pawnAttempts;input.close();s?.close();await writeFile(root+'/.runtime/core-followup-'+run+'-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));send({type:'receipt',receipt});
}
