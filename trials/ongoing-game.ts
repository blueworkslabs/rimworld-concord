/** Explicit operator observation window; no model turn ceiling and no inference pauses. */
import {ongoingProtocol} from './ongoing-protocol.js';
import {startSceneRecording} from './scene-recording.js';
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


import {retainedDomain} from './retention-policy.js';
import {randomUUID} from 'node:crypto';
import {nativeSceneCrew,nativeOfferCoverage,assertNativeLedger,assertNativeRestore} from './native-haul-live.js';
import {IntentView,invariantFindings,progress as intentProgress,NativeHaulConfig} from '../src/native-intents.js';
if(process.env.CONCORD_ONGOING_LOCKED!=='1')throw Error('Use scripts/run-ongoing-lab.sh game|cold');
const root=new URL('../..',import.meta.url).pathname,cold=process.argv.includes('--cold');
const scripted=process.argv.includes('--scripted'),recorded=process.argv.includes('--recorded'),nativeHaul=process.argv.includes('--native-haul');
const P=ongoingProtocol(recorded,scripted,nativeHaul),policy=P.policy;
if(process.env.CONCORD_TRIAL_POLICY!==policy)throw Error('Protocol mismatch');
const pausedInference=false;let operationDeadline=Date.now()+P.wallMs;const b=new LabBridge(undefined,()=>operationDeadline);
const runId=process.env.CONCORD_TRIAL_ID;
if(!runId||!/^[0-9a-f-]{36}$/.test(runId))throw Error('Trial identity required');
const run=runId;
const receiptPath=root+'/.runtime/ongoing-'+run+'-'+(cold?'cold':'game')+'.json';
await writeFile(receiptPath,JSON.stringify({runId,policy,scripted,recorded,status:'started'}),{flag:'wx'});
let recorder:Awaited<ReturnType<typeof startSceneRecording>>|undefined;
const receipt:any={passed:false,processId:process.pid,runId,policy,mode:(nativeHaul?'native-haul-':'')+(scripted?'scripted-continuous':'live-continuous'),run,recorded,nativeHaul,protocol:P,views:[],rounds:[],samples:[]};
let active:Promise<void>|undefined;
let checkpointRecorded=false;
const guard=new NeedsRunGuard(),controller=new AbortController(),end=operationDeadline;
let c:Coordinator|undefined,s:Store|undefined,db:string|undefined,connected=true,coreAttempts=0,pawnAttempts=0,inferenceDeadline=end;
const stop=()=>{connected=false;guard.stop();controller.abort();channel.close();};
const send=needsOutput(process.stdout,stop);
const channel=new DecisionChannel(raw=>{const m=raw as any;guard.check();if(m.type==='decision-request'){
 if(cold||!['core','core-answer','decision','reflection'].includes(m.mode))throw Error('Core admission closed');
 if(m.mode==='core')coreAttempts++;else pawnAttempts++;
 m.notAfter=inferenceDeadline;receipt.views.push({mode:m.mode,view:m.view,at:Date.now()});
 }send(m);},'gpt-5.6-luna');
let drained:(()=>void)|undefined;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>32000)throw Error('Response too large');const m=JSON.parse(line);if(m.type==='drained'&&m.id===runId){drained?.();return;}channel.receive(m);}catch{stop();}});
input.on('close',stop);process.once('SIGTERM',stop);process.once('SIGINT',stop);const timer=setTimeout(stop,P.wallMs);
async function capture(label:string,openPanel=false){
 try{
  const exec=promisify(execFile),options={timeout:Math.max(1,Math.min(10000,operationDeadline-Date.now()))};
  if(openPanel){await exec('python3',[b.root+'/bin/lab.py','click','1150','783'],options);if(recorded)await exec('xdotool',['mousemove','1000','120'],{...options,env:{...process.env,DISPLAY:':91',XAUTHORITY:'/run/rimworld-lab-display/Xauthority'}});}
  const name='ongoing-'+run+'-'+label+'.png';await exec('python3',[b.root+'/bin/lab.py','screenshot',name],options);(receipt.captures??=[]).push(name);
 }catch(e){(receipt.captureErrors??=[]).push(String(e));}
}
async function finish(){channel.close();if(!connected)throw Error('Host disconnected');await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Drain timeout')),15000);drained=()=>{clearTimeout(t);resolve();};send({type:'drain',id:runId});});receipt.hostDrained=true;}
async function save(failed=false){const checkpoint='lab-concord-followup-'+Date.now();await c!.checkpoint(checkpoint);const domain=c!.inspect();await writeFile(root+'/.runtime/ongoing-'+run+'-latest.json',JSON.stringify({runId,policy,mode:receipt.mode,db,checkpoint,domain,failed,coordinatorProcessId:process.pid}));checkpointRecorded=true;receipt.checkpoint=checkpoint;return {checkpoint,domain};}
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/ongoing-'+run+'-latest.json','utf8'));assert.equal(saved.runId,runId);assert.equal(saved.mode,receipt.mode);assert.equal(saved.policy??'luna-ongoing-v1',policy);receipt.verifiesFailedRun=saved.failed;
  s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);guard.check();retainedDomain(c.inspect(),saved.domain);assert.deepEqual(c.inspect().coreState,saved.domain.coreState);receipt.coldRestore=true;receipt.coreState=c.inspect().coreState;receipt.report=(await b.state()).crewLog;
  // Native-haul cold restore is a new coordinator process: the frozen intent and its ledger view survive.
  if(nativeHaul){assert(saved.coordinatorProcessId&&saved.coordinatorProcessId!==process.pid,'Cold restore requires a different coordinator process');receipt.savedCoordinatorProcessId=saved.coordinatorProcessId;assert.deepEqual(c.inspect().nativeHaul,saved.domain.nativeHaul);assert.deepEqual(c.inspect().intentViews,saved.domain.intentViews);receipt.nativeHaul={coldIntents:assertNativeRestore(await b.state(),saved.domain)};}
 }else{
  // Native haul: the frozen live entry (save, candidate area, quota, expiry) is part of the hashed setup.
  const live=nativeHaul?JSON.parse(await readFile(root+'/.runtime/native-haul-fixture.json','utf8')).live:undefined;
  if(nativeHaul&&(!live||typeof live.save!=='string'||live.variant!=='attribution'))throw Error('Frozen attribution-only native-haul live entry required');
  const f=nativeHaul?{name:live.save}:JSON.parse(await readFile(root+'/.runtime/campfire-fixture.json','utf8'));await b.load(f.name);guard.check();await b.admin('pause');guard.check();
  db=root+'/.runtime/ongoing-'+runId+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();
  await c.initializeCore(nativeHaul?'Loose wood lies around the colony and there is room for a stockpile. You can offer the shared stockpile haul to crew members who can haul, ask, or wait. Alvin, Beatrice and Pedro have equal standing, with no assigned roles or required responses. Respect refusal and deferral. Follow up on actual outcomes; no requirement to keep people busy or finish a particular plan.':
   'Consider the crew’s shared bodily needs and local supplies. You can ask, propose useful work or wait. Campfire construction and cooking are separate optional capabilities; eating raw food is a legitimate alternative. Alvin, Beatrice and Pedro have equal standing, with no assigned roles or required responses. Respect refusal and deferral. Follow up on actual outcomes; no requirement to keep people busy or finish a particular plan.');
  if(nativeHaul){
   // Intent-only: once configured, the core can list and propose nothing but this intent.
   receipt.nativeHaul={crew:nativeSceneCrew(await b.state()),config:await c.configureNativeHaul(NativeHaulConfig.parse({intentId:randomUUID(),area:live.area,quota:live.quota,maxTicks:live.maxTicks,variant:'attribution'}))};
   const v=await c.corePerspective();receipt.nativeHaul.initialOpportunities=v.opportunities;receipt.nativeHaul.notOffered=v.availability.filter(a=>/cannot do hauling/.test(a.status));
   assert(v.opportunities.every(o=>o.action.kind==='haul-zone'),'Native live run must list only the stockpile haul');
   assert.deepEqual(v.opportunities.map(o=>o.pawn).sort(),[...receipt.nativeHaul.crew.eligible].sort(),'Both capable pawns must initially be offerable');
   assert(receipt.nativeHaul.notOffered.some((a:any)=>a.pawn===receipt.nativeHaul.crew.ineligible),'Alvin incapability must be visible');
  }
  receipt.initial=await b.state();assert(receipt.initial.pawns.every((p:any)=>!p.downed));receipt.initialPerspective=await c.corePerspective();
  if(recorded){const exec=promisify(execFile);await exec('xdotool',['mousemove','700','460','click','--repeat','2','--delay','100','4'],{env:{...process.env,DISPLAY:':91',XAUTHORITY:'/run/rimworld-lab-display/Xauthority'},timeout:5000});}
  await capture('initial',true);
  if(recorded){assert(!receipt.captureErrors?.length,'Scene UI setup failed');recorder=await startSceneRecording(root+'/.runtime/scene-'+run,P.nativeMs,scripted,()=>guard.check());receipt.recordingStart={startedUnixMs:recorder.startedUnixMs,readyUnixMs:recorder.readyUnixMs};}
  await c.configureCoreSchedule({maxAttempts:null,cooldownTicks:P.cooldownTicks,windowTicks:null});
  const nativeLimit=P.nativeMs;let nativeElapsed=0,midpointCaptured=false;
  const startTick=(await b.state()).ticks;
  guard.check();(receipt.resumes??=[]).push(await startNative(b));guard.check();let nativeStarted:number|undefined=Date.now();receipt.nativeStartedUnixMs=nativeStarted;
  const nativeRemaining=()=>nativeLimit-nativeElapsed-(nativeStarted===undefined?0:Date.now()-nativeStarted);
  let taskError:unknown,lastRole='pawn';
  // Failures are counted per lane: a success in one lane never resets another lane's streak.
  const streak:Record<string,number>={};receipt.laneFailures={};
  const note=(status:string,lane:string)=>{
   const failed=['failed','interrupted'].includes(status);streak[lane]=failed?(streak[lane]??0)+1:0;
   if(failed)receipt.laneFailures[lane]=(receipt.laneFailures[lane]??0)+1;
   if(streak[lane]!>=3)throw Error(`Repeated ${lane} failures; stopped for diagnosis`);};receipt.attention=[];
  const launch=(task:()=>Promise<void>)=>{active=task().catch(e=>{taskError=e;}).finally(()=>{active=undefined;});};
  while(nativeRemaining()>0){
   if(taskError)throw taskError;
   recorder?.check();guard.check();await c.reconcile();guard.check();
   await c.advanceIntentions(()=>!guard.stopped&&nativeRemaining()>0);guard.check();
   const state=await b.state();if(nativeHaul)assertNativeLedger(state,receipt.nativeHaul.config.intentId);guard.sample(state.paused,state.ticks,startTick);
   receipt.samples.push({unixMs:Date.now(),tick:state.ticks,paused:state.paused,pawns:state.pawns.map(p=>({id:p.id,job:p.job,food:p.facts?.find(f=>f.key==='need'&&f.value==='Food')?.level}))});
   if(!midpointCaptured&&nativeRemaining()<=nativeLimit/2){midpointCaptured=true;await capture('midpoint');}
   const view=await c.corePerspective();guard.check();
   if(nativeRemaining()<=0)break;
   const schedule=c.inspect().coreState!.schedule!;
   if(schedule.blocked)throw Error(schedule.blocked);
   const candidates=scripted?[]:c.attentionCandidates({cooldownTicks:300,timeoutMs:110000},false);
   if(!active&&(candidates.length&&lastRole==='core'||candidates.length&&!coreAdmission(schedule,view).ready)){
    lastRole='pawn';inferenceDeadline=Math.min(end,Date.now()+Math.min(110000,nativeRemaining()));
    launch(async()=>{const result=await c!.attend(candidates[0]!,channel,undefined,{cooldownTicks:300,timeoutMs:Math.max(1,Math.min(110000,Math.floor(nativeRemaining())))},controller.signal);receipt.attention.push(result);note(result.status,'reflection');});
   }else if(!active&&coreAdmission(schedule,view).ready){
    lastRole='core';inferenceDeadline=Math.min(end,Date.now()+Math.min(110000,nativeRemaining()));
    launch(async()=>{
     const decisionMs=()=>Math.max(1,Math.min(110000,Math.floor(nativeRemaining())));
     const result=await c!.planCoreWhenDue(channel,decisionMs(),controller.signal);guard.check();
     const round:any={index:receipt.rounds.length,result};if(result.status!=='idle')receipt.rounds.push(round);
     if(nativeRemaining()>0&&result.status==='applied'&&result.questionId){inferenceDeadline=Math.min(end,Date.now()+Math.min(110000,nativeRemaining()));round.answer=await c!.answerCoreQuestion(result.questionId,channel,decisionMs(),controller.signal);guard.check();}
     if(nativeRemaining()>0&&result.status==='applied'&&result.proposalId){inferenceDeadline=Math.min(end,Date.now()+Math.min(110000,nativeRemaining()));const p=c!.inspect().proposals[result.proposalId]!;try{await c!.pawn(p.pawn).decide(p.id,channel,decisionMs(),controller.signal);}catch(e){round.pawnError=String(e);await retireUndecided(c!,p.id,'Decision unavailable; no retry');}guard.check();round.proposal=c!.inspect().proposals[p.id];}
     if(result.status!=='idle'){round.after=await c!.corePerspective();note(result.status,'core');if(round.answer)note(round.answer.status,'core-answer');if(round.proposal||round.pawnError)note(round.pawnError?'failed':'applied','decision');}
    });
   }
   await delay(300);
  }
  controller.abort();await active;
  if(taskError)throw taskError;
  await b.admin('pause');guard.check();await c.reconcile();guard.check();
  receipt.nativeElapsedMs=nativeElapsed+(nativeStarted===undefined?0:Math.max(0,Date.now()-nativeStarted));
  if(recorder){recorder.check();await delay(1000);receipt.recording=await recorder.finalize(receipt.nativeElapsedMs);recorder=undefined;}
  await capture('final');
  await finish();guard.check();receipt.beforeCleanup=c.inspect();receipt.final=await b.state();receipt.cleanup=await stopTrialWork(c);assert.equal(receipt.cleanup.errors.length,0);guard.check();receipt.summary=workSummary(c.inspect());receipt.production={campfires:Object.values(c.inspect().outcomes).filter(r=>r.kind==='build'&&r.status==='completed').length,meals:Object.values(c.inspect().outcomes).filter(r=>r.kind==='cook'&&r.status==='completed').reduce((n,r)=>n+(r.delivered??0),0)};
  receipt.inferencePassed=receipt.rounds.some((r:any)=>r.result.status==='applied');
  // Harness pass is not clean cognition: lost experiences and per-lane failures are reported.
  receipt.attentionGaps=c.inspect().diagnostics??{attentionGaps:0,attentionGapKinds:{}};
  receipt.failures=receipt.rounds.filter((r:any)=>!['applied','idle'].includes(r.result.status)||r.pawnError||r.answer&&!['delivered','silent'].includes(r.answer.status));
  if(scripted&&!nativeHaul){assert.equal(receipt.rounds[0]?.answer?.status,'delivered');assert.equal(receipt.rounds[1]?.result?.status,'applied');assert.equal(c.inspect().coreState?.turns[1]?.choice?.action.kind,'wait');assert.equal(Object.keys(c.inspect().proposals).length,0);}
  if(scripted&&!nativeHaul){const care=Object.values(c.inspect().selfCare??{});assert.equal(care.length,1);const result=c.inspect().outcomes[care[0]!.id];assert.equal(result?.status,'completed');assert((result?.delivered??0)>0,'scripted choice must consume food before cleanup');assert.equal(receipt.beforeCleanup.outcomes[care[0]!.id]?.status,'completed');}
  if(scripted&&!nativeHaul){const care=Object.values(c.inspect().selfCare!)[0]!;assert.equal(c.inspect().coreState!.topics.find(t=>t.sourceId===care.id)?.status,'resolved');assert.equal(c.inspect().coreState!.topics.find(t=>t.sourceId==='brief')?.status,'open');}
  if(nativeHaul){
   // Ledger evidence before cleanup: the operator stop comes after this snapshot.
   const intents=(receipt.final.intents??[]).map((i:unknown)=>IntentView.parse(i)),mine=intents.find((i:IntentView)=>i.intentId===receipt.nativeHaul.config.intentId);
   receipt.nativeHaul.final=mine;receipt.nativeHaul.progress=mine?intentProgress(mine):null;receipt.nativeHaul.findings=mine?invariantFindings(mine):['intent never opened'];
   receipt.nativeHaul.proposals=Object.values(receipt.beforeCleanup.proposals).map((p:any)=>({pawn:p.pawn,kind:p.action.kind,status:p.status,standing:p.standing?.status}));
   assert(receipt.nativeHaul.proposals.every((p:any)=>p.kind==='haul-zone'),'Only the stockpile haul may be proposed');
   nativeOfferCoverage(receipt.beforeCleanup,receipt.nativeHaul.crew.eligible);
   if(scripted)assert.deepEqual([...(mine?.accepted??[])].sort(),[...receipt.nativeHaul.crew.eligible].sort(),'Scripted rehearsal must accept both authored offers');
   if(mine)assert.deepEqual(receipt.nativeHaul.findings,[],'Consent violations or quota escapes: stop and diagnose');
  }
  const saved=await save(!receipt.inferencePassed);await c.restore(saved.checkpoint);guard.check();retainedDomain(c.inspect(),saved.domain);assert.deepEqual(c.inspect().coreState,saved.domain.coreState);if(nativeHaul)receipt.nativeHaul.pairedIntents=assertNativeRestore(await b.state(),saved.domain);receipt.pairedRestore=true;receipt.coreState=c.inspect().coreState;receipt.report=(await b.state()).crewLog;
 }
 guard.check();receipt.passed=cold||receipt.inferencePassed===true;if(!receipt.passed)process.exitCode=1;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{
 clearTimeout(timer);controller.abort();channel.close();await active;if(!receipt.hostDrained)try{await finish();}catch(e){receipt.passed=false;receipt.drainError=String(e);process.exitCode=1;}
 if(recorder)try{await recorder.stop();receipt.recordingIncomplete=true;}catch(e){receipt.recordingCleanupError=String(e);receipt.passed=false;process.exitCode=1;}
 receipt.finalCleanup=await socialCleanup(async()=>{operationDeadline=Date.now()+10000;await b.admin('pause');},async()=>{},async()=>{operationDeadline=Date.now()+20000;return c&&!cold?stopTrialWork(c):{errors:[]};});
 if(receipt.finalCleanup.errors.length){receipt.passed=false;process.exitCode=1;}
 if(!cold&&c&&db&&!receipt.passed&&!checkpointRecorded&&!receipt.finalCleanup.errors.length)try{operationDeadline=Date.now()+130000;await save(true);receipt.partialSaved=true;}catch(e){receipt.partialSaveError=String(e);}
 receipt.coreAttempts=coreAttempts;receipt.pawnAttempts=pawnAttempts;input.close();s?.close();await writeFile(receiptPath,JSON.stringify(receipt,null,2));send({type:'receipt',receipt});
}
