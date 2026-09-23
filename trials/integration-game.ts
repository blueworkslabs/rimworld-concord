/** Finite integration checkpoint: speech, optional private interpretation, work and native needs. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
import {DecisionChannel} from '../src/decision-channel.js';
import {socialContact} from '../src/social.js';
import {stopTrialWork,retireUndecided,workSummary,laterOfferEligible} from '../src/work-trial.js';
import {NeedsRunGuard,needsOutput,smallerHaul} from './needs-policy.js';
import {socialCleanup} from './social-cleanup.js';
import {retainedDomain,noReflectionEffects} from './retention-policy.js';
import {IntegrationWindow,preservePartial} from './integration-policy.js';
if(process.env.CONCORD_INTEGRATION_LOCKED!=='1')throw Error('Use scripts/run-integration-lab.sh game|cold');
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold'),scripted=process.argv.includes('--scripted');
const runId=process.env.CONCORD_TRIAL_ID,policy=process.env.CONCORD_TRIAL_POLICY;
if(!runId||!/^[0-9a-f-]{36}$/.test(runId)||policy!=='integration-v1')throw Error('Trial identity required');
const receipt:any={passed:false,runId,policy,mode:scripted?'scripted':'live',views:[],samples:[],frames:[],screenshots:[],offers:[],reflections:[]};
let c:Coordinator|undefined,s:Store|undefined,attempts=0,connected=true,exchangeId:string|undefined,db:string|undefined;
let window:IntegrationWindow|undefined,windowTimer:ReturnType<typeof setTimeout>|undefined;
const guard=new NeedsRunGuard();
const send=needsOutput(process.stdout,()=>{connected=false;guard.stop();channel.close();});
const channel=new DecisionChannel(raw=>{const m=raw as any;guard.check();if(m.type==='decision-request'){
 if(cold||++attempts>12||window?.ended())throw Error('Integration admission closed');
 receipt.views.push({mode:m.mode,view:m.view,at:Date.now()});
 m.notAfter=window?.deadline()??null;
 }send(m);});
let drained:(()=>void)|undefined;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>32000)throw Error('Response too large');const m=JSON.parse(line);if(m.type==='drained'&&m.id===runId){drained?.();return;}channel.receive(m);}catch{connected=false;guard.stop();channel.close();}});
input.on('close',()=>{connected=false;guard.stop();channel.close();});
const timer=setTimeout(()=>{guard.stop();channel.close();},900000);
async function finish(){channel.close();if(!connected)throw Error('Host disconnected');await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Drain timeout')),15000);drained=()=>{clearTimeout(t);resolve();};send({type:'drain',id:runId});});receipt.hostDrained=true;}
const allowed=()=>{guard.check();return attempts<12&&!window?.ended();};
async function negotiate(id:string,pawn:string){
 if(!allowed()){await retireUndecided(c!,id,'Trial admission ended; no retry');return;}
 try{await c!.pawn(pawn).decide(id,channel,45000);}
 catch(e){receipt.offers.push({id,pawn,error:String(e)});await retireUndecided(c!,id,'Decision unavailable; no retry');}
 guard.check();receipt.offers.push({id,pawn,proposal:c!.inspect().proposals[id]});
}
async function offer(pawn:string,later:boolean){
 if(!allowed())return;
 if(later&&!laterOfferEligible(c!.inspect(),pawn)){receipt.offers.push({pawn,skipped:'later-ineligible'});return;}
 const h=await c!.core().haulingOptions(pawn);if(!allowed())return;
 const option=h?.options.find(o=>o.trips>=(later?1:2)&&h.supplies?.some(s=>s.thing===o.thing&&s.label.toLowerCase().includes('wood')));
 if(!option){receipt.offers.push({pawn,skipped:'no-grounded-wood'});return;}
 const action={...option,trips:later?1:2,maxTicks:3600};
 const proposal=await c!.core().propose(pawn,action,later?
  'Your earlier hauling agreement is complete. Would you take one new ten-unit load of this observed wood? This is optional new work, not an extension.':
  'Would you take up to two ten-unit loads of this nearby wood to the observed storage cell? This separate offer is optional; you may refuse or suggest a smaller scope. Conversation alone commits you to nothing.');
 await negotiate(proposal.id,pawn);
 const p=c!.inspect().proposals[proposal.id]!;
 if(p.status==='countered'&&p.decision?.kind==='counter'&&smallerHaul(p.decision.action,action)&&allowed()){
  let revised;try{revised=await c!.core().revise(p.id,'Your smaller scope is offered back exactly. Do you accept this specific work?');}
  catch(e){receipt.offers.push({id:p.id,skipped:'counter-no-longer-grounded',error:String(e)});return;}
  await negotiate(revised.id,pawn);
 }
}
async function capture(label:string,screenshot=false){
 guard.check();const state=await b.state();receipt.frames.push({label,ticks:state.ticks,paused:state.paused,report:state.crewLog});
 await writeFile(root+'/.runtime/integration-public-'+runId+'.json',JSON.stringify({runId,frames:receipt.frames}));
 if(screenshot){const name='integration-'+runId+'-'+label+'.png';await promisify(execFile)('python3',[b.root+'/bin/lab.py','screenshot',name]);receipt.screenshots.push({label,name});}
}
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/integration-latest.json','utf8'));assert.equal(saved.runId,runId);assert.equal(saved.mode,receipt.mode);assert.equal(saved.policy,policy);receipt.verifiesFailedRun=saved.failed??false;
  guard.check();s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);guard.check();retainedDomain(c.inspect(),saved.domain);assert.deepEqual(c.inspect().exchanges,saved.domain.exchanges);
  receipt.coldRestore=true;receipt.report=(await b.state()).crewLog;
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/needs-fixture.json','utf8'));
  guard.check();await b.load(f.name);guard.check();await b.admin('pause');guard.check();
  db=root+'/.runtime/integration-'+runId+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();guard.check();
  const [initiator,recipient]=f.actors.map((a:any)=>a.id) as [string,string];
  receipt.initial=await b.state();socialContact(receipt.initial,initiator,recipient);assert(receipt.initial.pawns.every((p:any)=>!p.downed));
  // Capture real native experience; no fabricated reflection stimulus or authored live speech.
  guard.check();await b.admin('run');guard.check();const captureEnd=Date.now()+10000;
  while(Date.now()<captureEnd){guard.check();await c.observe();if(c.inspect().characters[initiator]?.experiences?.some(e=>e.route!=='native'))break;await delay(100);}
  await b.admin('pause');guard.check();await c.observe();
  const beforeTalk=c.inspect(),worldBefore=await b.state();
  exchangeId=randomUUID();await c.openSocial(exchangeId,initiator,recipient);
  receipt.opening=await c.socialTurn(initiator,exchangeId,channel,45000);guard.check();
  if(c.inspect().exchanges![exchangeId]!.status==='reply')receipt.reply=await c.socialTurn(recipient,exchangeId,channel,45000);
  guard.check();await c.closeSocial(exchangeId);receipt.exchange=c.inspect().exchanges![exchangeId];
  assert.deepEqual(c.inspect().proposals,beforeTalk.proposals);assert.deepEqual((await b.state()).actions,worldBefore.actions);
  for(const actor of f.actors){
   guard.check();const before=c.inspect(),world=await b.state();
   const result=await c.attend(actor.id,channel,{name:'scripted-admission-once',async assess(){return {reflectionScore:1};}},{cooldownTicks:0,timeoutMs:45000});
   guard.check();noReflectionEffects(before,c.inspect(),world,await b.state(),actor.id);receipt.reflections.push(result);
  }
  for(const id of Object.keys(c.inspect().characters))if(id!==initiator&&id!==recipient){assert.equal(c.inspect().characters[id]!.messages,undefined);assert.equal(c.inspect().characters[id]!.outlook,undefined);}
  const talkCheckpoint='lab-concord-int-talk-'+Date.now();await c.checkpoint(talkCheckpoint);const talk=c.inspect();await c.restore(talkCheckpoint);guard.check();retainedDomain(c.inspect(),talk);assert.deepEqual(c.inspect().exchanges,talk.exchanges);receipt.talkRestore=true;
  for(const actor of f.actors){guard.check();await offer(actor.id,false);}
  // Unmodified player panel. The UI remains open while native activity continues.
  await promisify(execFile)('python3',[b.root+'/bin/lab.py','click','1158','782']);
  await capture('before',true);const initialTick=(await b.state()).ticks;
  guard.check();await b.admin('run');guard.check();window=new IntegrationWindow(scripted?45000:300000);
  windowTimer=setTimeout(()=>channel.close(),window.durationMs);
  await delay(200);let laterDone=false,nextCapture=0,mid=false;
  while(!window.ended()){
   guard.check();await c.reconcile();guard.check();if(window.ended())break;await c.advanceIntentions(()=>!guard.stopped&&!window!.ended());guard.check();if(window.ended())break;await c.observe();guard.check();
   const state=await b.state();guard.sample(state.paused,state.ticks,initialTick);
   receipt.samples.push({elapsedMs:window.elapsed(),ticks:state.ticks,paused:state.paused,pawns:state.pawns.map(p=>({id:p.id,job:p.job,facts:p.facts}))});
   if(!laterDone&&window.laterDue()){
    laterDone=true;for(const actor of f.actors){if(!allowed())break;await offer(actor.id,true);}
   }
   if(window.elapsed()>=nextCapture){await capture('t'+Math.floor(window.elapsed()/1000));nextCapture+=15000;}
   if(!mid&&window.laterDue()){mid=true;await capture('midpoint',true);}
   await delay(400);
  }
  clearTimeout(windowTimer);guard.check();await finish();await b.admin('pause');await c.reconcile();guard.check();
  receipt.beforeCleanup=c.inspect();receipt.final=await b.state();receipt.observationMs=window.elapsed();receipt.laterDone=laterDone;
  receipt.cleanup=await stopTrialWork(c);guard.check();assert.equal(receipt.cleanup.errors.length,0);
  receipt.summary=workSummary(c.inspect());await capture('final',true);receipt.report=(await b.state()).crewLog;
  if(scripted){assert.equal(receipt.opening.status,'delivered');assert.equal(receipt.reply.status,'delivered');assert(receipt.summary.completedTrips>=1);assert(Object.values(c.inspect().proposals).some(p=>p.pawn===initiator&&p.status==='refused'));assert(Object.values(c.inspect().proposals).some(p=>p.status==='countered'));assert.equal(receipt.reflections[0].status,'continued');}
  const checkpoint='lab-concord-int-final-'+Date.now();await c.checkpoint(checkpoint);guard.check();const domain=c.inspect();await c.restore(checkpoint);guard.check();retainedDomain(c.inspect(),domain);assert.deepEqual(c.inspect().exchanges,domain.exchanges);receipt.pairedRestore=true;
  await writeFile(root+'/.runtime/integration-latest.json',JSON.stringify({runId,policy,mode:receipt.mode,db,checkpoint,domain}));
 }
 guard.check();receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{
 clearTimeout(timer);clearTimeout(windowTimer);if(!receipt.hostDrained)try{await finish();}catch(e){receipt.passed=false;receipt.drainError=String(e);process.exitCode=1;}
 receipt.finalCleanup=await socialCleanup(()=>b.admin('pause'),async()=>{if(c&&!cold&&exchangeId)await c.closeSocial(exchangeId);},async()=>c&&!cold?stopTrialWork(c):{errors:[]});
 if(receipt.finalCleanup.errors.length){receipt.passed=false;process.exitCode=1;}
 if(!cold&&c&&db)try{receipt.partialSaved=await preservePartial(receipt.passed,receipt.finalCleanup.errors,async()=>{
  const checkpoint='lab-concord-int-part-'+Date.now();await c!.checkpoint(checkpoint);
  await writeFile(root+'/.runtime/integration-latest.json',JSON.stringify({runId,policy,mode:receipt.mode,db,checkpoint,domain:c!.inspect(),failed:true}));
 });}catch(e){receipt.partialSaveError=String(e);receipt.passed=false;process.exitCode=1;}
 receipt.attempts=attempts;input.close();s?.close();await writeFile(root+'/.runtime/integration-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));send({type:'receipt',receipt});
}
