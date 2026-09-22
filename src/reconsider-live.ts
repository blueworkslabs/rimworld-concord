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
import {RECONSIDER_TRIAL as WORK_TRIAL,rescueAfterWithdrawal,reconsiderSummary as workSummary} from './reconsider-trial.js';
if(process.env.CONCORD_RECONSIDER_LOCKED!=='1')throw Error('Use scripts/run-reconsider-lab.sh game|cold to acquire the staging lock');
const policy=process.env.CONCORD_TRIAL_POLICY??'reconsider-v1';
if(!['reconsider-v1','interruption-v1','intent-v1','alternative-v1'].includes(policy))throw Error('Unknown trial policy');
const prefix=policy==='alternative-v1'?'alternative-live':policy==='intent-v1'?'intent-live':policy==='interruption-v1'?'interrupt-live':'reconsider-live';
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
  assert.deepEqual(c.inspect().characters,saved.domain.characters);assert.deepEqual(c.inspect().proposals,saved.domain.proposals);assert.deepEqual(c.inspect().outcomes,saved.domain.outcomes);assert.deepEqual(c.inspect().requests,saved.domain.requests);assert.notEqual(c.inspect().epoch,saved.domain.epoch);
  const restored=await b.state();assert.equal(restored.pawns.find(p=>p.id===saved.target)?.currentBed,saved.patientBed);
  assert.deepEqual(restored.events?.filter(e=>e.pawn===saved.pawn&&e.kind==='casualty'&&e.subject===saved.target)??[],saved.sightings);
  receipt.persistedSightings=saved.sightings.length;receipt.coldRestore=true;receipt.summary=workSummary(c.inspect());receipt.requests=c.core().requests();
 }else{
  const fixture=JSON.parse(await readFile(root+'/.runtime/reconsider-fixture.json','utf8'));await b.load(fixture.name);await b.admin('pause');
  const db=root+'/.runtime/'+prefix+'-'+runId+'.db';store=new Store(db);c=new Coordinator(store,b);await c.open();
  const initial=await b.state(),pawn=fixture.actor,target=fixture.target,actor=initial.pawns.find(p=>p.id===pawn)!;
  assert(initial.pawns.find(p=>p.id===target)?.downed,'Patient must really be downed');
  assert(!actor.casualties?.observations.some(o=>o.target===target),'No prior local patient observation');
  const option=(await c.core().haulingOptions(pawn))?.options.find(a=>a.thing===fixture.action.thing&&a.x===fixture.action.x&&a.z===fixture.action.z&&a.trips>=3);assert(option,'Grounded three-trip offer');
  receipt.initial={actor,target,authoredFixture:fixture,casualties:actor.casualties};
  const haulId=await offer(pawn,{...option,trips:3,maxTicks:3600},'Would you carry up to three ten-unit trips of these supplies to this storage cell? You may refuse, counter or later reconsider.');
  await b.admin('run');const start=await b.state(),began=Date.now(),duration=scripted?30000:WORK_TRIAL.observationMs;
  let samples=0,pausedSamples=0,thoughtSamples=0,ticksDuringThought=0,priorTick=start.ticks,wasThinking=false;
  let discovery:any,reflection:any,rescueChecked=false,rescueDone=false;
  pump=new AttentionPump(c,{name:decision.name,reflect:async(view,signal)=>{
   assert(view.events.some(e=>e.kind==='casualty'&&e.subject===target),'Only target-discovery reflection is enabled in this focused trial');
   reflection={intention:view.intention,view,startedAt:Date.now()};receipt.reflection=reflection;
   const output=await decision.reflect(view,signal);reflection.output=output;reflection.finishedAt=Date.now();return output;
  }},appraisal,{cooldownTicks:600,timeoutMs:90000},{maxConcurrent:1,maxNativeTurns:WORK_TRIAL.maxNativeTurns,maxModelTurns:WORK_TRIAL.maxModelTurns,pawns:[pawn]});
  deadlineTimer=setTimeout(()=>{void shutdown.stop().catch(e=>{receipt.shutdownError=String(e);});},duration);
  while(!shutdown.stopped&&Date.now()-began<duration&&connected){
   await c.reconcile();
   const state=await b.state(),event=state.events?.find(e=>e.pawn===pawn&&e.kind==='casualty'&&e.subject===target);
   if(!discovery&&event){discovery={event,at:Date.now(),actor:state.pawns.find(p=>p.id===pawn),intention:c.inspect().proposals[haulId]};receipt.discovery=discovery;}
   // Keep existing attention queued until the actual local sighting. This is a focused
   // stimulus trial, not a general-purpose autonomous attention benchmark.
   if(discovery&&!shutdown.later&&(pump.status().modelStarted>0||c.inspect().proposals[haulId]?.standing?.status==='running'))await pump.poll();
   if(!rescueChecked&&pump.status().modelStarted>0&&pump.status().pending===0){
    rescueChecked=true;
    const applied=pump.results.some(r=>r.status==='continued')&&store.events().some(e=>e.event.kind==='attention-withdrawn'&&e.event.actor===pawn);
    const eligible=rescueAfterWithdrawal(c.inspect(),pawn,haulId,reflection,applied);
    receipt.rescueEligibility={eligible,applied};
    const request=policy==='alternative-v1'?c.core().requests().find(r=>r.pawn===pawn&&r.agreementId===haulId&&r.status==='pending'):undefined;
    if(request)receipt.alternativeRequest={id:request.id,agreementId:request.agreementId,target:request.target};
    if(eligible||request){
     shutdown.later=(async()=>{
      const rescue=(await c!.core().rescueOptions(pawn))?.options.find(a=>a.target===(request?.target??target));
      if(!rescue){if(request)await c!.core().declineRequest(request.id,'No currently observed usable rescue option; existing work unchanged');offers.push({pawn,status:'no-current-rescue-option',requestId:request?.id});return;}
      await offer(pawn,rescue,request?'In response to your request: would you replace your current hauling agreement with this specific rescue? Acceptance ends that agreement after confirmed cancellation; refusal or counter keeps it. This is not treatment.':'You ended your supply agreement. Would you carry this observed downed colonist to this specific medical bed? This is a new optional agreement, not treatment; you may refuse or counter.',request?.id);
     })().catch(e=>{receipt.laterError=String(e);void shutdown.stop().catch(e=>{receipt.shutdownError=String(e);});}).finally(()=>{rescueDone=true;});
    }
   }
   if(shutdown.stopped)break;
   await c.advanceIntentions();
   const thinking=pendingThoughts.size>0;samples++;if(state.paused)pausedSamples++;if(thinking)thoughtSamples++;
   if(thinking&&wasThinking)ticksDuringThought+=Math.max(0,state.ticks-priorTick);priorTick=state.ticks;wasThinking=thinking;
   if(samples%20===0)await record();
   // Predetermined early finish after the branch settles; never seek a different answer.
   const ch=c.inspect().characters[pawn]!;
   if(Date.now()-began>=15000&&!ch.intention&&!ch.commitment&&!pump.status().pending&&(!shutdown.later||rescueDone))break;
   await delay(100);
  }
  await shutdown.stop();clearTimeout(deadlineTimer);
  await b.admin('pause');await c.reconcile();
  const {operatorStops,errors}=await stopTrialWork(c);if(errors.length)throw Error('Game work cleanup incomplete: '+errors.join('; '));
  await c.reconcile();const finish=await b.state();
  receipt.observation={wallMs:Date.now()-began,ticks:finish.ticks-start.ticks,samples,pausedSamples,thoughtSamples,ticksDuringThought,attention:pump.results,decisions,reflections,appraisals,operatorStops,rescueOfferStarted:Object.values(c.inspect().proposals).some(p=>p.action.kind==='rescue'),laterReplyStarted:!!shutdown.later,connected,pump:pump.status()};
  receipt.summary=workSummary(c.inspect());receipt.requests=c.core().requests();
  receipt.finalPatient=finish.pawns.find(p=>p.id===target);
  const sightings=finish.events?.filter(e=>e.pawn===pawn&&e.kind==='casualty'&&e.subject===target)??[];
  assert(sightings.length<=1,'No repeated alert for the same continuously downed patient');
  const checkpoint='lab-concord-reconsider-'+Date.now();await c.checkpoint(checkpoint);const domain=c.inspect();await c.restore(checkpoint);
  assert.deepEqual(c.inspect().characters,domain.characters);assert.deepEqual(c.inspect().proposals,domain.proposals);assert.deepEqual(c.inspect().outcomes,domain.outcomes);assert.deepEqual(c.inspect().requests,domain.requests);
  const restored=await b.state();assert.deepEqual(restored.events?.filter(e=>e.pawn===pawn&&e.kind==='casualty'&&e.subject===target)??[],sightings);
  const patientBed=finish.pawns.find(p=>p.id===target)?.currentBed;assert.equal(restored.pawns.find(p=>p.id===target)?.currentBed,patientBed);
  receipt.persistedSightings=sightings.length;
  await writeFile(root+'/.runtime/'+prefix+'-latest.json',JSON.stringify({runId,policy,mode:scripted?'scripted':'live',db,checkpoint,domain,pawn,target,patientBed,sightings}));
  receipt.interruptionAudit=store.events().filter(e=>['decision-invalidated','decision-interrupted','experience-deferred','decision-error'].includes(e.event.kind)).map(e=>e.event);
  receipt.pairedRestore=true;receipt.limits=WORK_TRIAL;receipt.limitations='Authored anesthesia/supplies/bed geometry; no personality or relationship overrides. Patient already downed outside initial local view; discovery, not a new injury. Scripted core. Initial consent paused, discovery/reflection/rescue negotiation continuous. One discovery-triggered model attention turn; preexisting events queue until sighting. Routine and model attention bounded separately. Rescue follows settled pawn withdrawal or a pawn-requested replacement with fresh consent and confirmed old-job cancellation. Requesting alone changes no work. At most one same-kind counter revision per offer. End when branch settles after 15s or two minutes; no rerolls, no inference continuation after cap. Not a causal character-comparison experiment.';
  if(!connected)throw Error('Host disconnected; partial result retained');
  if(receipt.laterError)throw Error('Later offer round failed; evidence retained');
 }
 receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{clearTimeout(deadlineTimer);try{await shutdown.stop();}catch(e){receipt.passed=false;receipt.shutdownError=String(e);process.exitCode=1;}try{await b.admin('pause');}catch{}
 if(c&&!cold){const cleanup=await stopTrialWork(c);receipt.finalCleanup=cleanup;if(cleanup.errors.length){receipt.passed=false;process.exitCode=1;}}
 input.close();await record();store?.close();await writeFile(root+'/.runtime/'+prefix+'-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));send({type:'receipt',receipt});}
