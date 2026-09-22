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
import {WORK_TRIAL,laterOfferEligible,workSummary,retireUndecided,WorkShutdown,stopTrialWork,trialCounterSupported} from './work-trial.js';
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold'),scripted=process.argv.includes('--scripted');
const runId=process.env.CONCORD_TRIAL_ID;if(!runId||!/^[0-9a-f-]{36}$/.test(runId))throw Error('Run identity required');
const send=(m:unknown)=>process.stdout.write(JSON.stringify(m)+'\n');
let decisions=0,appraisals=0,reflections=0,store:Store|undefined,pump:AttentionPump|undefined,connected=true;
const pendingThoughts=new Set<string>(),requestLog:unknown[]=[];
const decision=new DecisionChannel(raw=>{const m=raw as any;
 if(m.type==='decision-request'){
  if(cold||decisions>=WORK_TRIAL.decisions||(m.mode==='reflection'&&reflections>=WORK_TRIAL.reflections))throw Error('Trial decision limit');
  decisions++;if(m.mode==='reflection')reflections++;pendingThoughts.add(m.id);
  requestLog.push({id:m.id,mode:m.mode,pawn:m.view.pawn.id,at:Date.now()});
 }else if(m.type==='decision-cancel')pendingThoughts.delete(m.id);send(m);
});
const appraisal=new AppraisalChannel(raw=>{const m=raw as any;if(m.type==='appraisal'){if(cold||appraisals>=WORK_TRIAL.appraisals)throw Error('Trial appraisal limit');appraisals++;}send(m);});
let drainResolve:(()=>void)|undefined,drainReject:((e:Error)=>void)|undefined;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>32000)throw Error();const m=JSON.parse(line);if(m.type==='drained'&&m.id===runId){drainResolve?.();return;}if(m.type==='decision-result'){pendingThoughts.delete(m.id);decision.receive(m);}else appraisal.receive(m);}catch{connected=false;decision.close();appraisal.close();}});
input.on('close',()=>{drainReject?.(Error('Host disconnected before drain'));connected=false;decision.close();appraisal.close();});
const offers:unknown[]=[],receipt:Record<string,unknown>={at:new Date().toISOString(),runId,mode:scripted?'scripted':'live',passed:false,offers};
let c:Coordinator|undefined,deadlineTimer:ReturnType<typeof setTimeout>|undefined;
const shutdown=new WorkShutdown(()=>{decision.close();appraisal.close();},async()=>{await pump?.stop();},async()=>{
 if(!connected)throw Error('Host unavailable for cleanup confirmation');
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Host drain timeout')),15000);
  drainResolve=()=>{clearTimeout(timer);resolve();};drainReject=e=>{clearTimeout(timer);reject(e);};
  send({type:'drain',id:runId});
 });
 receipt.hostDrained=true;
});
async function record(){await writeFile(root+'/.runtime/work-live-partial.json',JSON.stringify({runId,offers,requests:requestLog,domain:c?.inspect()}));}
async function negotiate(id:string,pawn:string){
 if(shutdown.stopped||decisions>=WORK_TRIAL.decisions){offers.push({id,pawn,status:'allowance-ended'});await retireUndecided(c!,id,'Trial limit; no automatic retry');return;}
 const began=Date.now();try{const p=await c!.pawn(pawn).decide(id,decision,90000);offers.push({id,pawn,decision:p.decision,elapsedMs:Date.now()-began});}
 catch{offers.push({id,pawn,status:'unavailable-no-retry',elapsedMs:Date.now()-began});await retireUndecided(c!,id,'Decision attempt failed; no automatic retry');}
 await record();
}
async function offerRound(pawns:string[],later=false){
 for(const pawn of pawns){
  if(shutdown.stopped||!connected||decisions>=WORK_TRIAL.decisions)break;
  if(later&&!laterOfferEligible(c!.inspect(),pawn)){offers.push({pawn,status:'later-round-ineligible'});continue;}
  const option=(await c!.core().haulingOptions(pawn))?.options.find(a=>a.trips>=2);
  if(!option){offers.push({pawn,status:'no-two-trip-observed-option'});continue;}
  let id:string;try{id=(await c!.core().propose(pawn,{...option,trips:2,maxTicks:1800},later?
   'Your previous supply agreement is complete. Would you take up to two more ten-unit trips from this observed stack to this cell? This is a new optional offer, not an extension.':
   'Would you haul up to two ten-unit trips from this observed stack to the agreed storage cell? Quantities are in your supplies observation. Refuse or counter freely; stop for needs or reconsideration.')).id;}
  catch{offers.push({pawn,status:'offer-preflight-unavailable'});continue;}
  await negotiate(id,pawn);
  const p=c!.inspect().proposals[id]!;
  if(p.status==='countered'&&!trialCounterSupported(p)){offers.push({pawn,id,status:'counter-outside-hauling-trial-retained'});continue;}
  if(!shutdown.stopped&&trialCounterSupported(p)&&decisions<WORK_TRIAL.decisions){
   let revised;try{revised=await c!.core().revise(id,'The core offers your exact alternative back. Fresh consent is yours; refusal remains valid.');}
   catch{offers.push({pawn,id,status:'counter-no-longer-grounded'});continue;}
   await negotiate(revised.id,pawn);
  }
 }
}
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/work-live-latest.json','utf8'));assert.equal(saved.runId,runId);assert.equal(saved.mode,scripted?'scripted':'live');
  store=new Store(saved.db);c=new Coordinator(store,b);await c.restore(saved.checkpoint);
  assert.deepEqual(c.inspect().characters,saved.domain.characters);assert.deepEqual(c.inspect().proposals,saved.domain.proposals);assert.deepEqual(c.inspect().outcomes,saved.domain.outcomes);assert.notEqual(c.inspect().epoch,saved.domain.epoch);
  receipt.coldRestore=true;receipt.summary=workSummary(c.inspect());
 }else{
  const fixture=JSON.parse(await readFile(root+'/.runtime/haul-fixture.json','utf8'));await b.load(fixture.name);await b.admin('pause');
  const db=root+'/.runtime/work-live-'+runId+'.db';store=new Store(db);c=new Coordinator(store,b);await c.open();
  const initial=await b.state(),pawns=initial.pawns.map(p=>p.id);assert.equal(pawns.length,3);
  assert(initial.pawns.every(p=>p.hauling?.options.some(a=>a.trips>=2&&a.count===10)),'Three-pawn supply fixture preflight failed before inference');
  receipt.initial=pawns.map(id=>({pawn:id,hauling:initial.pawns.find(p=>p.id===id)!.hauling,facts:initial.pawns.find(p=>p.id===id)!.facts?.filter(f=>f.key==='need')}));
  await offerRound(pawns);await b.admin('run');
  const start=await b.state(),began=Date.now(),duration=scripted?15000:WORK_TRIAL.observationMs,second=scripted?5000:WORK_TRIAL.secondRoundMs;
  let samples=0,pausedSamples=0,thoughtSamples=0,ticksDuringThought=0,priorTick=start.ticks,wasThinking=false,laterDone=false;
  pump=new AttentionPump(c,{name:decision.name,reflect:(view,signal)=>{
   if(reflections>=WORK_TRIAL.reflections||decisions>=WORK_TRIAL.decisions)throw Error('Reflection allowance ended');return decision.reflect(view,signal);
  }},appraisal,{cooldownTicks:600,timeoutMs:90000},{maxConcurrent:1,maxTurns:WORK_TRIAL.maxTurns});
  deadlineTimer=setTimeout(()=>{void shutdown.stop().catch(e=>{receipt.shutdownError=String(e);});},duration);
  while(!shutdown.stopped&&Date.now()-began<duration&&connected){
   await c.advanceIntentions();
   if(shutdown.stopped)break;
   if(!shutdown.later&&Date.now()-began>=second&&pump.status().pending===0){
    shutdown.later=offerRound(pawns,true).catch(e=>{receipt.laterError=String(e);void shutdown.stop().catch(e=>{receipt.shutdownError=String(e);});}).finally(()=>{laterDone=true;});
   }
   // Never overlap explicit negotiations with the single decision channel.
   if((!shutdown.later||laterDone)&&decisions<WORK_TRIAL.decisions&&reflections<WORK_TRIAL.reflections&&appraisals<WORK_TRIAL.appraisals)await pump.poll();
   const state=await b.state(),thinking=pendingThoughts.size>0;
   samples++;if(state.paused)pausedSamples++;if(thinking)thoughtSamples++;if(thinking&&wasThinking)ticksDuringThought+=Math.max(0,state.ticks-priorTick);
   priorTick=state.ticks;wasThinking=thinking;
   if(samples%20===0)await record();await delay(250);
  }
  await shutdown.stop();clearTimeout(deadlineTimer);
  await b.admin('pause');await c.reconcile();
  const {operatorStops,errors}=await stopTrialWork(c);if(errors.length)throw Error('Game work cleanup incomplete: '+errors.join('; '));
  await c.reconcile();const finish=await b.state();
  receipt.observation={wallMs:Date.now()-began,ticks:finish.ticks-start.ticks,samples,pausedSamples,thoughtSamples,ticksDuringThought,attention:pump.results,decisions,reflections,appraisals,operatorStops,laterRoundStarted:!!shutdown.later,connected};
  receipt.summary=workSummary(c.inspect());
  const checkpoint='lab-concord-work-'+Date.now();await c.checkpoint(checkpoint);const domain=c.inspect();await c.restore(checkpoint);
  assert.deepEqual(c.inspect().characters,domain.characters);assert.deepEqual(c.inspect().proposals,domain.proposals);assert.deepEqual(c.inspect().outcomes,domain.outcomes);
  await writeFile(root+'/.runtime/work-live-latest.json',JSON.stringify({runId,mode:scripted?'scripted':'live',db,checkpoint,domain}));
  receipt.pairedRestore=true;receipt.limits=WORK_TRIAL;receipt.limitations='Authored supply fixture; scripted core, native self-perspectives, no personality overrides. Initial offers paused; later round and reflection continuous. Refusals are not reoffered; at most one exact counter revision per round; all failures retained. Operator shutdown distinct from pawn withdrawal. Finite descriptive trial, not a controlled causal comparison or long-run character-quality evaluation.';
  if(!connected)throw Error('Host disconnected; partial result retained');
  if(receipt.laterError)throw Error('Later offer round failed; evidence retained');
 }
 receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{clearTimeout(deadlineTimer);try{await shutdown.stop();}catch(e){receipt.passed=false;receipt.shutdownError=String(e);process.exitCode=1;}try{await b.admin('pause');}catch{}
 if(c&&!cold){const cleanup=await stopTrialWork(c);receipt.finalCleanup=cleanup;if(cleanup.errors.length){receipt.passed=false;process.exitCode=1;}}
 input.close();await record();store?.close();await writeFile(root+'/.runtime/work-live-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));send({type:'receipt',receipt});}
