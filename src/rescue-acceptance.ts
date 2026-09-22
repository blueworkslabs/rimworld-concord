/** Scripted disposable-game acceptance, never enables inference. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from './coordinator.js';
import {Store} from './store.js';
import {LabBridge} from './lab-bridge.js';
import {scripted} from './backends.js';
import type {Rescue} from './protocol.js';
if(process.env.CONCORD_RESCUE_LOCKED!=='1')throw Error('Use scripts/run-rescue-lab.sh game|cold to acquire the staging lock');
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold');
const checks:string[]=[],receipt:Record<string,unknown>={at:new Date().toISOString(),phase:cold?'cold':'game',passed:false,inferenceCalls:0,checks};
let store:Store|undefined;
const accept=scripted({kind:'accept',reason:'Scripted consent to one exact rescue'});
async function finish(c:Coordinator,id:string,patient:string,bed:string){
 await b.admin('run');const end=Date.now()+30000;
 while(Date.now()<end){await delay(80);await c.reconcile();if(c.inspect().outcomes[id]?.status!=='started')break;}
 await b.admin('pause');await c.reconcile();const result=c.inspect().outcomes[id]!;
 assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(result.delivered,1);
 const state=await b.state();assert.equal(state.pawns.find(p=>p.id===patient)?.currentBed,bed);
 assert(!state.pawns.some(p=>p.carrying===patient));return result;
}
try {
 await mkdir(root+'/.runtime',{recursive:true});
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/rescue-latest.json','utf8'));
  store=new Store(saved.db);const c=new Coordinator(store,b);await c.restore(saved.checkpoint);
  assert.deepEqual(c.inspect().characters,saved.characters);assert.deepEqual(c.inspect().proposals,saved.proposals);assert.deepEqual(c.inspect().outcomes,saved.outcomes);
  assert.notEqual((await b.state()).epoch,saved.epoch);
  assert.equal((await b.state()).pawns.find(p=>p.id===saved.target)?.currentBed,saved.bed);
  await c.advanceIntentions();assert.equal(Object.keys(c.inspect().outcomes).length,Object.keys(saved.outcomes).length);
  checks.push('cold restore preserves exact completed rescue, patient in agreed bed and no repeat work');
 }else{
  const fixture=JSON.parse(await readFile(root+'/.runtime/rescue-fixture.json','utf8'));
  const db=root+'/.runtime/rescue-'+Date.now()+'.db';
  await b.load(fixture.name);await b.admin('pause');store=new Store(db);const c=new Coordinator(store,b);await c.open();
  const initial=await b.state(),pawn=initial.pawns.find(p=>p.id===fixture.rescuer)!;
  assert(initial.pawns.find(p=>p.id===fixture.target)?.downed,'Fixture patient must really be downed');
  const options=(await c.core().rescueOptions(pawn.id))!;assert(options.options.length>=2,'Need two observed beds');
  const action=options.options[0]!,alternative=options.options.find(a=>a.bed!==action.bed)!;assert(alternative);
  receipt.options=options;
  const baseline='lab-concord-rescue-base-'+Date.now();await c.checkpoint(baseline);
  const offer=await c.core().propose(pawn.id,action,'Optional rescue');const before=(await b.state()).actions.length;
  const other=initial.pawns.find(p=>p.id!==pawn.id&&p.rescueReady)!;assert(other);
  await assert.rejects(c.core().propose(other.id,action,'Competing rescue'),/held/);
  assert.equal((await b.state()).actions.length,before);checks.push('queries and competing pending offers create no native job');
  await c.pawn(pawn.id).decide(offer.id,scripted({kind:'refuse',reason:'Scripted refusal'}));assert.equal((await b.state()).actions.length,before);
  checks.push('refusal creates no rescue job');
  const counter=await c.core().propose(pawn.id,action,'Choose a bed');
  await c.pawn(pawn.id).decide(counter.id,scripted({kind:'counter',reason:'The other observed bed',action:alternative}));
  const revised=await c.core().revise(counter.id,'The other bed, if you agree');assert.equal((await b.state()).actions.length,before);
  await c.pawn(pawn.id).decide(revised.id,accept);let p=c.inspect().proposals[revised.id]!;
  const duplicate=await b.move({id:p.actionId!,epoch:initial.epoch,actor:pawn.id,action:alternative,mapId:p.rescueMap,untilTick:p.standing!.deadline});
  assert.equal(duplicate.id,p.actionId);receipt.delivery=await finish(c,p.actionId!,alternative.target,alternative.bed);
  await c.advanceIntentions();assert.equal((await b.state()).actions.length,before+1);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'completed');
  checks.push('counter then fresh consent delivers casualty to exact alternate bed once; no automatic second rescue');
  const checkpoint='lab-concord-rescue-done-'+Date.now();await c.checkpoint(checkpoint);const saved=c.inspect();
  await c.restore(baseline);
  const withdrawing=await c.core().propose(pawn.id,action,'Rescue with voluntary withdrawal');await c.pawn(pawn.id).decide(withdrawing.id,accept);
  await b.admin('run');let carried=false;const end=Date.now()+15000;
  while(Date.now()<end){const state=await b.state();if(state.pawns.find(p=>p.id===pawn.id)?.carrying===action.target){carried=true;break;}if(state.actions.some(a=>a.id===c.inspect().proposals[withdrawing.id]!.actionId&&a.status!=='started'))break;await delay(40);}
  await b.admin('pause');assert(carried,'Must observe actual carrying before withdrawal');
  await c.pawn(pawn.id).withdraw('Scripted withdrawal while carrying');await c.reconcile();await c.advanceIntentions();
  const stopped=await b.state();assert.equal(c.inspect().outcomes[c.inspect().proposals[withdrawing.id]!.actionId!]!.status,'interrupted');
  assert(!stopped.pawns.find(p=>p.id===pawn.id)!.carrying);assert(stopped.pawns.some(p=>p.id===action.target));
  assert.equal(stopped.pawns.find(p=>p.id===action.target)!.currentBed,'');
  checks.push('withdrawal while carrying drops casualty back into world, records interruption and does not reroute or retry');
  await c.restore(baseline);const boundary=await b.state();
  const invalids:[string,Rescue,number][]=[['wrong map',action,options.mapId+100],['wrong bed identity',{...action,bed:'unknown'},options.mapId],['standing patient',{...action,target:other.id},options.mapId],['wrong bed cell',{...action,x:action.x+1},options.mapId]];
  for(const [label,a,mapId] of invalids){const r=await b.move({id:randomUUID(),epoch:boundary.epoch,actor:pawn.id,action:a,mapId,untilTick:boundary.ticks+1800});assert.equal(r.status,'failed',label);}
  checks.push('native rejects wrong map, wrong bed identity/cell and patient not downed');
  const expiredId=randomUUID();assert.equal((await b.move({id:expiredId,epoch:boundary.epoch,actor:pawn.id,action,mapId:options.mapId,untilTick:boundary.ticks+1})).status,'started');
  await b.admin('run');await delay(750);await b.admin('pause');const expired=(await b.state()).actions.find(a=>a.id===expiredId)!;
  assert.notEqual(expired.status,'started');assert.notEqual(expired.status,'completed');assert.equal(expired.delivered,0);
  checks.push('native expiry stops rescue without coordinator polling or false delivery');
  const id=randomUUID();await b.cancel({id,epoch:boundary.epoch,actor:pawn.id,kind:'rescue'});
  await assert.rejects(b.move({id,epoch:boundary.epoch,actor:pawn.id,action,mapId:options.mapId,untilTick:boundary.ticks+1800}),/collision/);
  checks.push('rescue cancellation tombstone blocks delayed dispatch');
  await c.restore(checkpoint);assert.deepEqual(c.inspect().characters,saved.characters);assert.deepEqual(c.inspect().outcomes,saved.outcomes);
  assert.equal((await b.state()).pawns.find(p=>p.id===alternative.target)?.currentBed,alternative.bed);
  await writeFile(root+'/.runtime/rescue-latest.json',JSON.stringify({db,checkpoint,epoch:(await b.state()).epoch,target:alternative.target,bed:alternative.bed,characters:saved.characters,proposals:saved.proposals,outcomes:saved.outcomes}));
  checks.push('paired restore preserves completed rescue and physical patient placement');
  receipt.limitation='Disposable anesthesia/medical-sleeping-spot fixture, scripted choices, no treatment or naturally triggered emergency; quiescent saves only.';
 }
 receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally {try{await b.admin('pause');}catch{}store?.close();await writeFile(root+'/.runtime/rescue-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));}
