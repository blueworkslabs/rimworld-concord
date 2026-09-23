/** Native matched pair. Authored speech, optional model interpretation and fresh consent. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import type {Haul,HaulingView} from '../src/protocol.js';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
import {DecisionChannel} from '../src/decision-channel.js';
import {socialContact} from '../src/social.js';
import {stopTrialWork,retireUndecided,workSummary} from '../src/work-trial.js';
import {NeedsRunGuard,needsOutput} from './needs-policy.js';
import {socialCleanup} from './social-cleanup.js';
import {retentionRequest,retentionMenu,retainedDomain,noReflectionEffects} from './retention-policy.js';
if(process.env.CONCORD_RETENTION_LOCKED!=='1')throw Error('Use scripts/run-retention-lab.sh game|cold');
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold'),scripted=process.argv.includes('--scripted');
const runId=process.env.CONCORD_TRIAL_ID;
if(!runId||!/^[0-9a-f-]{36}$/.test(runId)||process.env.CONCORD_TRIAL_POLICY!=='retention-game-v1')throw Error('Trial identity required');
const receipt:any={passed:false,runId,policy:'retention-game-v1',mode:scripted?'scripted':'live',arms:[]};
let c:Coordinator|undefined,s:Store|undefined,attempts=0,connected=true,exchangeId:string|undefined;
const guard=new NeedsRunGuard();
const send=needsOutput(process.stdout,()=>{connected=false;guard.stop();channel.close();});
const channel=new DecisionChannel(raw=>{const m=raw as any;if(m.type==='decision-request'&&(cold||++attempts>4))throw Error('Retention trial limit');guard.check();send(m);});
let drained:(()=>void)|undefined;
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>32000)throw Error('Response too large');const m=JSON.parse(line);if(m.type==='drained'&&m.id===runId){drained?.();return;}channel.receive(m);}catch{connected=false;guard.stop();channel.close();}});
input.on('close',()=>{connected=false;guard.stop();channel.close();});
const timer=setTimeout(()=>{guard.stop();channel.close();},600000);
async function finish(){channel.close();if(!connected)throw Error('Host disconnected');await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Drain timeout')),15000);drained=()=>{clearTimeout(t);resolve();};send({type:'drain',id:runId});});receipt.hostDrained=true;}
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/retention-latest.json','utf8'));assert.equal(saved.runId,runId);assert.equal(saved.mode,receipt.mode);assert.equal(saved.arms.length,2);
  s=new Store(saved.db);c=new Coordinator(s,b);
  for(const arm of saved.arms){guard.check();await c.restore(arm.checkpoint);guard.check();retainedDomain(c.inspect(),arm.domain);receipt.arms.push({condition:arm.condition,coldRestore:true,report:(await b.state()).crewLog});}
  receipt.coldRestore=true;
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/needs-fixture.json','utf8'));
  guard.check();await b.load(f.name);await b.admin('pause');
  const db=root+'/.runtime/retention-'+runId+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();
  const sender=f.actors[0].id,receiver=f.actors[1].id;
  // Capture a genuine native experience, shared by BOTH arms. Do not inject events or notes.
  await b.admin('run');const limit=Date.now()+10000;
  while(Date.now()<limit){guard.check();await c.observe();if(c.inspect().characters[receiver]?.experiences?.some(e=>e.route!=='native'))break;await delay(100);}
  await b.admin('pause');await c.observe();guard.check();
  assert(c.inspect().characters[receiver]?.experiences?.some(e=>e.route!=='native'),'Shared native attention evidence required');
  socialContact(await b.state(),sender,receiver);
  const baseline='lab-concord-ret-base-'+Date.now();await c.checkpoint(baseline);
  const savedArms:any[]=[];let shared:any,menu:string[]|undefined,offered:any;
  for(const condition of ['control','message']){
   guard.check();await c.restore(baseline);guard.check();exchangeId=undefined;
   const arm:any={condition,samples:[]};receipt.arms.push(arm);
   const world=await b.state();arm.start=world;
   const snapshot={pawn:world.pawns.find(p=>p.id===receiver),character:c.inspect().characters[receiver]};
   // Epoch changes on restore, but physical readings and captured experience must match.
   const comparable=JSON.parse(JSON.stringify(snapshot,(key,value)=>key==='epoch'?undefined:value));
   if(shared)assert.deepEqual(comparable,shared);else shared=comparable;
   if(condition==='message'){
    exchangeId=randomUUID();await c.openSocial(exchangeId,sender,receiver);guard.check();
    const speech=await c.socialTurn(sender,exchangeId,{name:'authored-test-message',async speak(){return {choice:'say',text:retentionRequest};}});assert.equal(speech.status,'delivered');
    guard.check();await c.closeSocial(exchangeId);arm.message=c.inspect().characters[receiver]!.messages!.at(-1);
   }
   const before=c.inspect(),worldBefore=await b.state();let reflectionCalls=0;
   arm.reflection=await c.attend(receiver,{name:channel.name,async reflect(v,signal){
    reflectionCalls++;arm.reflectionView=v;arm.menu=retentionMenu(v);if(menu)assert.deepEqual(arm.menu,menu);else menu=arm.menu;
    return channel.reflect(v,signal);
   }},{name:'scripted-admit-once',async assess(){return {reflectionScore:1};}},{cooldownTicks:0,timeoutMs:45000});
   guard.check();assert.equal(reflectionCalls,1);assert.equal(arm.reflection.status,'continued');assert.deepEqual(arm.menu,['keep_current_activity','revise_private_outlook']);
   arm.outlook=c.inspect().characters[receiver]!.outlook;
   noReflectionEffects(before,c.inspect(),worldBefore,await b.state(),receiver);
   if(scripted){assert.equal(arm.outlook?.revision,1);if(condition==='message')assert.deepEqual(arm.outlook.notes[0].messages,[arm.message]);}
   for(const id of Object.keys(c.inspect().characters))if(id!==sender&&id!==receiver){assert.equal(c.inspect().characters[id]!.messages,undefined);assert.equal(c.inspect().characters[id]!.outlook,undefined);}
   const retained='lab-concord-ret-note-'+Date.now();await c.checkpoint(retained);const after=c.inspect();
   await c.restore(baseline);guard.check();assert.equal(c.inspect().characters[receiver]!.outlook,undefined);assert.equal(c.inspect().characters[receiver]!.messages,undefined);
   await c.restore(retained);guard.check();retainedDomain(c.inspect(),after);arm.noteRestore=true;
   const h:HaulingView|null=await c.core().haulingOptions(receiver);const option:Haul|undefined=h?.options.find(o=>h.supplies?.some(s=>s.thing===o.thing&&s.label.toLowerCase().includes('wood')));assert(option,'Grounded wood option required');
   const action:Haul={...option,trips:1,maxTicks:3600};if(offered)assert.deepEqual(action,offered);else offered=action;
   const proposal=await c.core().propose(receiver,action,'Would you move one ten-unit load of this nearby wood to the observed storage cell? This work is optional.');
   let decisionCalls=0;
   try{
    await c.pawn(receiver).decide(proposal.id,{name:channel.name,async decide(v,signal){decisionCalls++;arm.decisionView=v;return channel.decide(v,signal);}},45000);
   }catch(e){arm.decisionError=String(e);await retireUndecided(c,proposal.id,'Decision unavailable; no retry');}
   guard.check();assert.equal(decisionCalls,1);assert.deepEqual(arm.decisionView.character.outlook,arm.outlook);assert.deepEqual(arm.decisionView.character.messages,after.characters[receiver]!.messages);
   arm.decision=c.inspect().proposals[proposal.id];
   if(scripted)assert.equal(arm.decision.status,condition==='control'?'accepted':'refused');
   const initialTick=(await b.state()).ticks;guard.check();await b.admin('run');await delay(200);const start=Date.now(),end=start+(scripted?15000:60000);
   while(Date.now()<end){guard.check();await c.reconcile();guard.check();await c.advanceIntentions();guard.check();await c.observe();const state=await b.state();guard.sample(state.paused,state.ticks,initialTick);arm.samples.push({elapsedMs:Date.now()-start,ticks:state.ticks,paused:state.paused});await delay(400);}
   guard.check();await b.admin('pause');await c.reconcile();guard.check();arm.beforeCleanup=c.inspect();arm.final=await b.state();
   if(scripted){if(condition==='control')assert.equal(c.inspect().proposals[proposal.id]!.standing?.status,'completed');else assert(!arm.final.actions.some((a:any)=>a.actor===receiver));}
   arm.cleanup=await stopTrialWork(c);guard.check();assert.equal(arm.cleanup.errors.length,0);arm.summary=workSummary(c.inspect());arm.report=(await b.state()).crewLog;
   const checkpoint='lab-concord-ret-final-'+Date.now();await c.checkpoint(checkpoint);guard.check();const domain=c.inspect();await c.restore(checkpoint);guard.check();retainedDomain(c.inspect(),domain);arm.pairedRestore=true;
   savedArms.push({condition,checkpoint,domain});
   // Keep completed-arm saves even if the subsequent arm or final drain fails.
   await writeFile(root+'/.runtime/retention-latest.json',JSON.stringify({runId,mode:receipt.mode,db,arms:savedArms}));
  }
 }
 guard.check();receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{
 clearTimeout(timer);try{await finish();}catch(e){receipt.passed=false;receipt.drainError=String(e);process.exitCode=1;}
 receipt.finalCleanup=await socialCleanup(()=>b.admin('pause'),async()=>{if(c&&!cold&&exchangeId)await c.closeSocial(exchangeId);},async()=>c&&!cold?stopTrialWork(c):{errors:[]});
 if(receipt.finalCleanup.errors.length){receipt.passed=false;process.exitCode=1;}
 receipt.attempts=attempts;input.close();s?.close();await writeFile(root+'/.runtime/retention-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));send({type:'receipt',receipt});
}
