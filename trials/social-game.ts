/** Two optional messages, then separate consent. Operator-selected, paused encounter. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NeedsRunGuard,needsOutput} from './needs-policy.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
import {DecisionChannel} from '../src/decision-channel.js';
import {socialContact} from '../src/social.js';
import {stopTrialWork,retireUndecided,workSummary} from '../src/work-trial.js';
if(process.env.CONCORD_SOCIAL_LOCKED!=='1')throw Error('Use scripts/run-social-lab.sh game|cold');
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold'),scripted=process.argv.includes('--scripted');
const runId=process.env.CONCORD_TRIAL_ID;
if(!runId||!/^[0-9a-f-]{36}$/.test(runId)||process.env.CONCORD_TRIAL_POLICY!=='social-v1')throw Error('Trial identity required');
const receipt:any={passed:false,runId,policy:'social-v1',mode:scripted?'scripted':'live',views:[],samples:[]};
let c:Coordinator|undefined,s:Store|undefined,attempts=0,connected=true,exchangeId:string|undefined;
const guard=new NeedsRunGuard();
const send=needsOutput(process.stdout,()=>{connected=false;guard.stop();channel.close();});
const channel=new DecisionChannel(raw=>{const m=raw as any;if(m.type==='decision-request'&&(cold||++attempts>4))throw Error('Social trial limit');send(m);});
let drained:(()=>void)|undefined;const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>32000)throw Error('Response too large');const m=JSON.parse(line);if(m.type==='drained'&&m.id===runId){drained?.();return;}channel.receive(m);}catch{connected=false;guard.stop();channel.close();}});
input.on('close',()=>{connected=false;guard.stop();channel.close();});
const timer=setTimeout(()=>{guard.stop();channel.close();},360000);
async function finish(){channel.close();if(!connected)throw Error('Host disconnected');await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Drain timeout')),15000);drained=()=>{clearTimeout(t);resolve();};send({type:'drain',id:runId});});receipt.hostDrained=true;}
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/social-latest.json','utf8'));assert.equal(saved.runId,runId);assert.equal(saved.mode,receipt.mode);
  guard.check();s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);guard.check();
  for(const key of ['characters','proposals','outcomes','exchanges'] as const)assert.deepEqual(c.inspect()[key],saved.domain[key]);
  assert.deepEqual(c.inspect().crew?.entries,saved.domain.crew?.entries);receipt.coldRestore=true;receipt.report=(await b.state()).crewLog;
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/needs-fixture.json','utf8'));
  guard.check();await b.load(f.name);await b.admin('pause');const db=root+'/.runtime/social-'+runId+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();
  const initiator=f.actors[0].id,recipient=f.actors[1].id;
  receipt.initial=await b.state();socialContact(receipt.initial,initiator,recipient);assert(receipt.initial.pawns.every((p:any)=>!p.downed));
  const baseline='lab-concord-social-before-'+Date.now();await c.checkpoint(baseline);
  guard.check();exchangeId=randomUUID();await c.openSocial(exchangeId,initiator,recipient);
  receipt.opening=await c.socialTurn(initiator,exchangeId,{name:channel.name,async speak(v,signal){receipt.views.push({mode:'social',view:v});return channel.speak(v,signal);}},45000);
  guard.check();
  if(c.inspect().exchanges![exchangeId]!.status==='reply')receipt.reply=await c.socialTurn(recipient,exchangeId,{name:channel.name,async speak(v,signal){receipt.views.push({mode:'social',view:v});return channel.speak(v,signal);}},45000);
  guard.check();await c.closeSocial(exchangeId);receipt.exchange=c.inspect().exchanges![exchangeId];
  assert.equal(Object.keys(c.inspect().proposals).length,0);assert.deepEqual((await b.state()).actions,receipt.initial.actions);
  for(const actor of Object.keys(c.inspect().characters)){
   assert.equal(c.inspect().characters[actor]!.outlook,undefined);
   if(actor!==initiator&&actor!==recipient)assert.equal(c.inspect().characters[actor]!.messages,undefined);
  }
  if(scripted){assert.equal(receipt.opening.status,'delivered');assert.equal(receipt.reply.status,'delivered');assert.equal(receipt.exchange.messages.length,2);}
  const retained='lab-concord-social-talk-'+Date.now();await c.checkpoint(retained);const afterTalk=c.inspect();await c.restore(baseline);guard.check();assert.equal(c.inspect().exchanges,undefined);assert(Object.values(c.inspect().characters).every(ch=>!ch.messages));
  await c.restore(retained);guard.check();assert.deepEqual(c.inspect().characters,afterTalk.characters);assert.deepEqual(c.inspect().exchanges,afterTalk.exchanges);receipt.conversationRewind=true;
  // Both offers are preplanned, not extracted from speech or proof of persuasion.
  for(const actor of f.actors){
   guard.check();const h=await c.core().haulingOptions(actor.id),option=h?.options.find(o=>h.supplies?.some(s=>s.thing===o.thing&&s.label.toLowerCase().includes('wood')));
   if(!option){receipt.skippedOffers??=[];receipt.skippedOffers.push(actor.id);continue;}
   const offer=await c.core().propose(actor.id,{...option,trips:1,maxTicks:3600},'Would you move one ten-unit load of this nearby wood to the observed storage cell? This is an optional separate offer. Nothing said in conversation commits you to this work.');
   try{
    const answer=await c.pawn(actor.id).decide(offer.id,{name:channel.name,async decide(v,signal){receipt.views.push({mode:'decision',view:v});assert.deepEqual(v.character.messages,afterTalk.characters[actor.id]?.messages);return channel.decide(v,signal);}},45000);
    if(scripted)assert.equal(answer.status,actor.id===initiator?'refused':'accepted');
   }catch(e){if(scripted)throw e;receipt.decisionErrors??=[];receipt.decisionErrors.push(String(e));await retireUndecided(c,offer.id,'Decision unavailable; no retry');}
   // Counters and refusals are retained; this trial makes no revised offers.
  }
  guard.check();receipt.preRun=await b.state();guard.check();await b.admin('run');await delay(200);const start=Date.now(),end=start+(scripted?30000:120000);
  while(Date.now()<end){guard.check();await c.reconcile();guard.check();await c.advanceIntentions();guard.check();await c.observe();const state=await b.state();guard.sample(state.paused,state.ticks,receipt.preRun.ticks);receipt.samples.push({elapsedMs:Date.now()-start,ticks:state.ticks,paused:state.paused});await delay(400);}
  guard.check();await b.admin('pause');await c.reconcile();receipt.beforeCleanup=c.inspect();receipt.final=await b.state();
  if(scripted){assert(Object.values(c.inspect().proposals).some(p=>p.pawn===recipient&&p.standing?.status==='completed'));assert(!receipt.final.actions.some((a:any)=>a.actor===initiator));}
  guard.check();receipt.cleanup=await stopTrialWork(c);guard.check();assert.equal(receipt.cleanup.errors.length,0);receipt.summary=workSummary(c.inspect());receipt.report=(await b.state()).crewLog;
  const checkpoint='lab-concord-social-final-'+Date.now();await c.checkpoint(checkpoint);guard.check();const domain=c.inspect();await c.restore(checkpoint);guard.check();
  for(const key of ['characters','proposals','outcomes','exchanges'] as const)assert.deepEqual(c.inspect()[key],domain[key]);
  assert.deepEqual(c.inspect().crew?.entries,domain.crew?.entries);receipt.pairedRestore=true;
  await writeFile(root+'/.runtime/social-latest.json',JSON.stringify({runId,mode:receipt.mode,db,checkpoint,domain}));
 }
 guard.check();receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{
 clearTimeout(timer);try{await finish();}catch(e){receipt.passed=false;receipt.drainError=String(e);process.exitCode=1;}
 try{await b.admin('pause');if(c&&!cold){if(exchangeId)await c.closeSocial(exchangeId);receipt.finalCleanup=await stopTrialWork(c);assert.equal(receipt.finalCleanup.errors.length,0);}}catch(e){receipt.passed=false;receipt.cleanupError=String(e);process.exitCode=1;}
 receipt.attempts=attempts;input.close();s?.close();await writeFile(root+'/.runtime/social-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));send({type:'receipt',receipt});
}
