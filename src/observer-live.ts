/** Finite operator experiment; no model receives admin handles. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from './coordinator.js';
import {Store} from './store.js';
import {LabBridge} from './lab-bridge.js';
import {DecisionChannel} from './decision-channel.js';
import {AppraisalChannel} from './appraisal-channel.js';
import {AttentionPump} from './attention.js';
import {retireUndecided,WorkShutdown,stopTrialWork} from './work-trial.js';
import {OBSERVER_TRIAL as WORK_TRIAL,pendingObserverRequest} from './observer-trial.js';
import {reconsiderSummary as workSummary} from './reconsider-trial.js';
import {laterOfferEligible} from './work-trial.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
if(process.env.CONCORD_OBSERVER_LOCKED!=='1')throw Error('Use scripts/run-observer-lab.sh game|cold');
const policy='observer-v1',prefix='observer-live';
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold'),scripted=process.argv.includes('--scripted');
const runId=process.env.CONCORD_TRIAL_ID;if(!runId||!/^[0-9a-f-]{36}$/.test(runId))throw Error('Run identity required');
const send=(m:unknown)=>process.stdout.write(JSON.stringify(m)+'\n');
let decisions=0,appraisals=0,reflections=0,store:Store|undefined,pump:AttentionPump|undefined,connected=true;
const pendingThoughts=new Set<string>(),requestLog:unknown[]=[];
const decision=new DecisionChannel(raw=>{const m=raw as any;
 if(m.type==='decision-request'){
  if(cold||decisions>=WORK_TRIAL.decisions||(m.mode==='reflection'&&reflections>=WORK_TRIAL.reflections))throw Error('Trial decision limit');
  decisions++;if(m.mode==='reflection')reflections++;pendingThoughts.add(m.id);
  requestLog.push({id:m.id,mode:m.mode,view:m.view,at:Date.now()});
 }else if(m.type==='decision-cancel')pendingThoughts.delete(m.id);send(m);
});
const appraisal=new AppraisalChannel(raw=>{const m=raw as any;if(m.type==='appraisal'){if(cold||appraisals>=WORK_TRIAL.appraisals)throw Error('Trial appraisal limit');appraisals++;}send(m);});
let drainResolve:(()=>void)|undefined,drainReject:((e:Error)=>void)|undefined;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>32000)throw Error();const m=JSON.parse(line);if(m.type==='drained'&&m.id===runId){drainResolve?.();return;}if(m.type==='decision-result'){pendingThoughts.delete(m.id);decision.receive(m);}else appraisal.receive(m);}catch{connected=false;decision.close();appraisal.close();}});
input.on('close',()=>{drainReject?.(Error('Host disconnected before drain'));connected=false;decision.close();appraisal.close();});
const offers:unknown[]=[],receipt:Record<string,unknown>={at:new Date().toISOString(),runId,mode:scripted?'scripted':'live',policy,passed:false,offers};
let c:Coordinator|undefined,deadlineTimer:ReturnType<typeof setTimeout>|undefined;
const shutdown=new WorkShutdown(()=>{decision.close();appraisal.close();},async()=>{await pump?.stop();},async()=>{
 if(!connected)throw Error('Host unavailable for cleanup confirmation');
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Host drain timeout')),15000);
  drainResolve=()=>{clearTimeout(timer);resolve();};drainReject=e=>{clearTimeout(timer);reject(e);};
  send({type:'drain',id:runId});
 });
 receipt.hostDrained=true;
});
async function record(){await writeFile(root+'/.runtime/'+prefix+'-partial.json',JSON.stringify({runId,offers,requests:requestLog,domain:c?.inspect()}));}
async function negotiate(id:string,pawn:string){
 if(shutdown.stopped||decisions>=WORK_TRIAL.decisions){offers.push({id,pawn,status:'allowance-ended'});await retireUndecided(c!,id,'Trial limit; no automatic retry');return;}
 const began=Date.now();try{const p=await c!.pawn(pawn).decide(id,decision,90000);offers.push({id,pawn,decision:p.decision,elapsedMs:Date.now()-began});}
 catch{offers.push({id,pawn,status:'unavailable-no-retry',elapsedMs:Date.now()-began});await retireUndecided(c!,id,'Decision attempt failed; no automatic retry');}
 await record();
}
async function offer(pawn:string,action:any,reason:string,requestId?:string){
 const p=requestId?await c!.core().offerAlternative(requestId,action,reason):await c!.core().propose(pawn,action,reason);await negotiate(p.id,pawn);
 const answered=c!.inspect().proposals[p.id]!;
 if(answered.status==='countered'&&answered.decision?.kind==='counter'){
  if(answered.decision.action.kind!==action.kind||(action.kind==='rescue'&&answered.decision.action.kind==='rescue'&&answered.decision.action.target!==action.target)){offers.push({id:p.id,status:'counter-outside-this-offer-scope-retained'});return p.id;}
  if(!shutdown.stopped&&decisions<WORK_TRIAL.decisions){
   let revised;try{revised=await c!.core().revise(p.id,'Your exact alternative is offered back; fresh consent remains yours.');}
   catch{offers.push({id:p.id,status:'counter-no-longer-grounded'});return p.id;}
   await negotiate(revised.id,pawn);return revised.id;
  }
 }
 return p.id;
}
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/'+prefix+'-latest.json','utf8'));assert.equal(saved.runId,runId);assert.equal(saved.policy??'reconsider-v1',policy);assert.equal(saved.mode,scripted?'scripted':'live');
  store=new Store(saved.db);c=new Coordinator(store,b);await c.restore(saved.checkpoint);
  assert.deepEqual(c.inspect().characters,saved.domain.characters);assert.deepEqual(c.inspect().proposals,saved.domain.proposals);assert.deepEqual(c.inspect().outcomes,saved.domain.outcomes);assert.deepEqual(c.inspect().requests,saved.domain.requests);assert.deepEqual(c.inspect().crew,saved.domain.crew);assert.notEqual(c.inspect().epoch,saved.domain.epoch);
  const restored=await b.state();assert.equal(restored.pawns.find(p=>p.id===saved.target)?.currentBed,saved.patientBed);
  assert.deepEqual(restored.events?.filter(e=>e.pawn===saved.pawn&&e.kind==='casualty'&&e.subject===saved.target)??[],saved.sightings);
  receipt.persistedSightings=saved.sightings.length;receipt.coldRestore=true;receipt.summary=workSummary(c.inspect());receipt.requests=c.core().requests();
 }else{
  const fixture=JSON.parse(await readFile(root+'/.runtime/observer-fixture.json','utf8'));await b.load(fixture.name);await b.admin('pause');
  const db=root+'/.runtime/'+prefix+'-'+runId+'.db';store=new Store(db);c=new Coordinator(store,b);await c.open();
  const initial=await b.state(),pawn=fixture.actor,target=fixture.target,actor=initial.pawns.find(p=>p.id===pawn)!;
  const workers=[pawn,fixture.second];assert.equal(initial.pawns.length,3);assert(workers.every(id=>initial.pawns.find(p=>p.id===id)?.hauling?.options.some(a=>a.trips>=3)),'Both independent hauling opportunities must exist before inference');
  assert(initial.pawns.find(p=>p.id===target)?.downed,'Patient must really be downed');
  assert(!actor.casualties?.observations.some(o=>o.target===target),'No prior local patient observation');
  const option=(await c.core().haulingOptions(pawn))?.options.find(a=>a.thing===fixture.action.thing&&a.x===fixture.action.x&&a.z===fixture.action.z&&a.trips>=3);assert(option,'Grounded three-trip offer');
  receipt.initial={actor,target,authoredFixture:fixture,casualties:actor.casualties};
  const haulId=await offer(pawn,{...option,trips:3,maxTicks:3600},'Would you carry up to three ten-unit trips of these supplies to this storage cell? You may refuse, counter or later reconsider.');
  const other=(await c.core().haulingOptions(fixture.second))?.options.find(a=>a.trips>=3);assert(other);
  await offer(fixture.second,{...other,trips:3,maxTicks:3600},'Would you move up to three ten-unit loads from this separate observed supply stack? Refusal or a counter is valid.');
  await b.admin('run');const start=await b.state(),began=Date.now(),duration=scripted?45000:WORK_TRIAL.observationMs;
  let samples=0,pausedSamples=0,thoughtSamples=0,ticksDuringThought=0,priorTick=start.ticks,wasThinking=false;
  let negotiationDone=true,laterDone=false,nextCapture=0;
  const seenRequests=new Set<string>(),frames:any[]=[],screenshots:string[]=[];
  pump=new AttentionPump(c,{name:decision.name,reflect:(view,signal)=>decision.reflect(view,signal)},appraisal,
   {cooldownTicks:1200,timeoutMs:90000},{maxConcurrent:1,maxNativeTurns:WORK_TRIAL.maxNativeTurns,maxModelTurns:WORK_TRIAL.maxModelTurns});
  deadlineTimer=setTimeout(()=>{void shutdown.stop().catch(e=>{receipt.shutdownError=String(e);});},duration);
  const capture=async()=>{
   const state=await b.state();assert(state.crewLog,'Public log unavailable');
   frames.push({elapsedMs:Date.now()-began,ticks:state.ticks,paused:state.paused,report:state.crewLog});
   // Observer reconstruction uses only these public frames, not private attention reasons.
   await writeFile(root+'/.runtime/'+prefix+'-observer.json',JSON.stringify({runId,frames}));
  };
  // Keep the observer panel open while gameplay continues; launcher owns the lab lock.
  await promisify(execFile)('python3',[b.root+'/bin/lab.py','click','1158','782']);
  while(!shutdown.stopped&&Date.now()-began<duration&&connected){
   await c.reconcile();
   if(negotiationDone&&pump.status().pending===0&&decisions<WORK_TRIAL.decisions){
    const request=pendingObserverRequest(c.inspect(),seenRequests);
    const laterDue=!laterDone&&Date.now()-began>=(scripted?20000:WORK_TRIAL.secondRoundMs);
    if(request||laterDue){
     negotiationDone=false;if(request)seenRequests.add(request.id);else laterDone=true;
     shutdown.later=(async()=>{
      if(request){
       const rescue=(await c!.core().rescueOptions(request.pawn))?.options.find(a=>a.target===request.target);
       if(!rescue){await c!.core().declineRequest(request.id,'No currently observed usable rescue option; existing work unchanged.');return;}
       try{await offer(request.pawn,rescue,'In response to your request: replace the remaining hauling with this specific rescue? Acceptance ends the old agreement after confirmed cancellation; refusal keeps it. Rescue is not treatment.',request.id);}
       catch(e){offers.push({requestId:request.id,status:'replacement-unavailable-no-retry',error:String(e)});if(c!.inspect().requests?.[request.id]?.status==='pending')await c!.core().declineRequest(request.id,'The replacement is no longer available; no automatic retry.');}
      }else for(const id of workers){
       if(shutdown.stopped||decisions>=WORK_TRIAL.decisions)break;
       if(!laterOfferEligible(c!.inspect(),id)){offers.push({pawn:id,status:'later-round-ineligible'});continue;}
       const option=(await c!.core().haulingOptions(id))?.options.find(a=>a.trips>=2);
       if(!option){offers.push({pawn:id,status:'no-later-observed-option'});continue;}
       try{await offer(id,{...option,trips:2,maxTicks:1800},'Your earlier agreement is complete. Would you accept up to two new ten-unit trips from this observed stack? This is optional new work, not an extension.');}
       catch(e){offers.push({pawn:id,status:'later-offer-unavailable-no-retry',error:String(e)});}
      }
     })().catch(e=>{receipt.laterError=String(e);void shutdown.stop().catch(e=>{receipt.shutdownError=String(e);});}).finally(()=>{negotiationDone=true;});
    }
   }
   if(shutdown.stopped)break;
   await c.advanceIntentions();
   if(negotiationDone&&decisions<WORK_TRIAL.decisions&&reflections<WORK_TRIAL.reflections&&appraisals<WORK_TRIAL.appraisals)await pump.poll();
   const state=await b.state(),thinking=pendingThoughts.size>0;samples++;if(state.paused)pausedSamples++;if(thinking)thoughtSamples++;
   if(thinking&&wasThinking)ticksDuringThought+=Math.max(0,state.ticks-priorTick);priorTick=state.ticks;wasThinking=thinking;
   if(Date.now()-began>=nextCapture){await capture();nextCapture+=15000;await record();}
   if((screenshots.length===0&&Date.now()-began>=5000)||(screenshots.length===1&&Date.now()-began>=duration/2)){
    const name='observer-'+runId+'-'+screenshots.length+'.png';await promisify(execFile)('python3',[b.root+'/bin/lab.py','screenshot',name]);screenshots.push(name);
   }
   await delay(250);
  }
  // Do not stop early merely because the scenario settles; quiet stretches are evidence.
  await shutdown.stop();clearTimeout(deadlineTimer);
  await b.admin('pause');await c.reconcile();
  const {operatorStops,errors}=await stopTrialWork(c);if(errors.length)throw Error('Game work cleanup incomplete: '+errors.join('; '));
  await c.reconcile();const finish=await b.state();
  await capture();receipt.publicFrames=frames;receipt.screenshots=screenshots;
  receipt.observation={wallMs:Date.now()-began,ticks:finish.ticks-start.ticks,samples,pausedSamples,thoughtSamples,ticksDuringThought,attention:pump.results,decisions,reflections,appraisals,operatorStops,laterDone,connected,pump:pump.status()};
  receipt.summary=workSummary(c.inspect());receipt.requests=c.core().requests();
  receipt.finalPatient=finish.pawns.find(p=>p.id===target);
  const sightings=finish.events?.filter(e=>e.pawn===pawn&&e.kind==='casualty'&&e.subject===target)??[];
  assert(sightings.length<=1,'No repeated alert for the same continuously downed patient');
  const checkpoint='lab-concord-reconsider-'+Date.now();await c.checkpoint(checkpoint);const domain=c.inspect();await c.restore(checkpoint);
  assert.deepEqual(c.inspect().characters,domain.characters);assert.deepEqual(c.inspect().proposals,domain.proposals);assert.deepEqual(c.inspect().outcomes,domain.outcomes);assert.deepEqual(c.inspect().requests,domain.requests);assert.deepEqual(c.inspect().crew,domain.crew);
  const restored=await b.state();assert.deepEqual(restored.events?.filter(e=>e.pawn===pawn&&e.kind==='casualty'&&e.subject===target)??[],sightings);
  const patientBed=finish.pawns.find(p=>p.id===target)?.currentBed;assert.equal(restored.pawns.find(p=>p.id===target)?.currentBed,patientBed);
  receipt.persistedSightings=sightings.length;
  await writeFile(root+'/.runtime/'+prefix+'-latest.json',JSON.stringify({runId,policy,mode:scripted?'scripted':'live',db,checkpoint,domain,pawn,target,patientBed,sightings}));
  receipt.interruptionAudit=store.events().filter(e=>['decision-invalidated','decision-interrupted','experience-deferred','decision-error'].includes(e.event.kind)).map(e=>e.event);
  receipt.pairedRestore=true;receipt.limits=WORK_TRIAL;receipt.limitations='Authored three-pawn colony: two separate hauling opportunities, one initially downed patient outside the first worker local view; native work priorities disabled, needs/idle/social routines remain native. Core scripted, no personality overrides. Initial consent paused; general bounded attention, requests and one later hauling round continuous. Five-minute observation including quiet stretches; split attention and immutable provider limits. No rerolls. Observer reconstruction uses only public crew log frames and screenshots; technical audit is separate. This is not natural sustained planning or human-user evaluation.';
  if(!connected)throw Error('Host disconnected; partial result retained');
  if(receipt.laterError)throw Error('Later offer round failed; evidence retained');
 }
 receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{clearTimeout(deadlineTimer);try{await shutdown.stop();}catch(e){receipt.passed=false;receipt.shutdownError=String(e);process.exitCode=1;}try{await b.admin('pause');}catch{}
 if(c&&!cold){const cleanup=await stopTrialWork(c);receipt.finalCleanup=cleanup;if(cleanup.errors.length){receipt.passed=false;process.exitCode=1;}}
 input.close();await record();store?.close();await writeFile(root+'/.runtime/'+prefix+'-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));send({type:'receipt',receipt});}
