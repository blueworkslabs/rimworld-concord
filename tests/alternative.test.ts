import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {scripted} from '../src/backends.js';
import type {GameState,ActionRequest,Receipt} from '../src/protocol.js';
const haul={kind:'haul' as const,thing:'steel',x:4,z:5,count:10,trips:3,maxTicks:600};
const rescue={kind:'rescue' as const,target:'B',bed:'bed',x:6,z:7,maxTicks:600};
const yes=scripted({kind:'accept',reason:'I consent'});
async function setup(trips=3){
 const data:GameState={world:'w',epoch:'e',ticks:10,loaded:true,paused:false,actions:[],pawns:[{id:'A',name:'Ada',x:1,z:1,job:'Concord_Haul',health:1,workReady:true,rescueReady:true,
 hauling:{epoch:'e',tick:10,mapId:1,status:'available',options:[haul],supplies:[{thing:'steel',label:'Steel',x:4,z:5,sourceCount:75,destinationFree:75}]},
 rescue:{epoch:'e',tick:10,mapId:1,status:'available',options:[rescue],observations:[]},
 casualties:{epoch:'e',tick:10,mapId:1,radius:12,observations:[{target:'B',name:'Bee',x:3,z:3}],visibleSubjects:[{target:'B',downed:true,inBed:false}]}}]};
 const calls:string[]=[],saves=new Map<string,GameState>();let cancelMode='ok';
 const game={async state(){return structuredClone(data);},async move(r:ActionRequest){calls.push('move:'+r.action.kind);const receipt:Receipt={id:r.id,actor:r.actor,status:'started',reason:'native',x:r.action.x,z:r.action.z};data.actions.push(receipt);return structuredClone(receipt);},async cancel(r:{id:string;actor:string}){
  calls.push('cancel');if(cancelMode==='slow')await new Promise(r=>setTimeout(r,100));const a=data.actions.find(a=>a.id===r.id)!;
  if(cancelMode==='wrong')return {...a,id:'wrong',status:'interrupted' as const};
  if(cancelMode==='started')return structuredClone(a);
  a.status=cancelMode==='completed'?'completed':'interrupted';if(cancelMode==='lost')throw Error('lost cancellation reply');
  if(cancelMode==='recovered')data.pawns[0]!.casualties!.visibleSubjects![0]!.downed=false;
  return structuredClone(a);
 },async save(n:string){saves.set(n,structuredClone(data));return {sha256:'hash'};},async verify(){},async load(n:string){Object.assign(data,structuredClone(saves.get(n)!));data.epoch+='new';for(const p of data.pawns){p.hauling!.epoch=data.epoch;p.rescue!.epoch=data.epoch;p.casualties!.epoch=data.epoch;}}};
 const store=new Store(':memory:'),c=new Coordinator(store,game);await c.open();const p=await c.core().propose('A',{...haul,trips},'Haul');await c.pawn('A').decide(p.id,yes);
 const ask=async(target='B')=>{data.eventSeq=(data.eventSeq??0)+1;data.events=[{seq:data.eventSeq,pawn:'A',tick:10,kind:'casualty',detail:'Locally down',subject:'B'}];return c.attend('A',{name:'ask',async reflect(){return {kind:'request_rescue',agreementId:p.id,target,reason:'Could we discuss helping Bee?'};}});};
 return {data,c,store,game,p,calls,ask,cancel:(m:string)=>{cancelMode=m;}};
}
test('request and core decline neither stop work nor confer consent; duplicate request blocked',async()=>{
 const {c,p,data,calls,ask,store}=await setup();assert.equal((await ask()).status,'continued');
 const r=c.core().requests()[0]!;assert.equal(c.inspect().characters.A!.intention,p.id);assert.deepEqual(calls,['move:haul']);assert.equal(data.actions.length,1);
 await c.core().declineRequest(r.id,'Keep current work for now');assert.equal(c.core().requests()[0]!.status,'declined');
 assert.equal((await ask()).status,'failed');assert.equal(c.core().requests().length,1);assert.deepEqual(calls,['move:haul']);store.close();
});
test('a requested replacement cannot be invented by core or change the requested casualty',async()=>{
 const {c,ask,store}=await setup();await assert.rejects(c.core().propose('A',rescue,'Bypass request'));
 assert.equal((await ask('unknown')).status,'failed');assert.equal(c.core().requests().length,0);
 assert.equal((await ask()).status,'continued');const r=c.core().requests()[0]!;
 await assert.rejects(c.core().offerAlternative(r.id,{...rescue,target:'C'},'Other casualty'));
 const offer=await c.core().offerAlternative(r.id,rescue,'Optional replacement');assert.equal(offer.replacesAgreementId,r.agreementId);assert.equal(offer.requestId,r.id);
 await assert.rejects(c.core().offerAlternative(r.id,rescue,'Repeated'));store.close();
});
test('refusal or counter preserves hauling; exact revised rescue still needs fresh consent',async()=>{
 for(const kind of ['refuse','counter'] as const){
  const {c,p,ask,calls,store}=await setup();await ask();const r=c.core().requests()[0]!,offer=await c.core().offerAlternative(r.id,rescue,'Replace?');
  const reply=await c.pawn('A').decide(offer.id,scripted(kind==='refuse'?{kind,reason:'Keep hauling'}:{kind,reason:'Shorter scope',action:{...rescue,maxTicks:120}}));
  assert.equal(reply.status,kind==='refuse'?'refused':'countered');assert.equal(c.inspect().characters.A!.intention,p.id);assert.deepEqual(calls,['move:haul']);
  if(kind==='counter'){const revised=await c.core().revise(offer.id,'Your scope');assert.equal(revised.replacesAgreementId,p.id);assert.deepEqual(calls,['move:haul']);await c.pawn('A').decide(revised.id,yes);assert.deepEqual(calls,['move:haul','cancel','move:rescue']);}
  store.close();
 }
});
test('replacement acceptance stops old job before starting new one and persists both agreements',async()=>{
 const {c,p,ask,calls,store}=await setup();await ask();const r=c.core().requests()[0]!,offer=await c.core().offerAlternative(r.id,rescue,'Replace?');
 assert.equal(c.inspect().characters.A!.intention,p.id);await c.pawn('A').decide(offer.id,yes);
 assert.deepEqual(calls,['move:haul','cancel','move:rescue']);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'stopped');assert.equal(c.inspect().characters.A!.intention,offer.id);assert.equal(c.core().requests()[0]!.status,'closed');store.close();
});
test('uncertain cancellation or newly recovered patient never starts replacement, including reopen',async()=>{
 for(const failure of ['lost','started','wrong','recovered']){
  const {c,p,ask,calls,cancel,game,store}=await setup();await ask();const r=c.core().requests()[0]!,offer=await c.core().offerAlternative(r.id,rescue,'Replace?');cancel(failure);
  await assert.rejects(c.pawn('A').decide(offer.id,yes));assert(!calls.includes('move:rescue'));const saved=c.inspect().proposals[offer.id]!;
  assert.equal(saved.decision?.kind,'accept');assert.equal(saved.actionId,undefined);assert.equal(saved.standing!.status,'stopped');
  cancel('ok');const reopened=new Coordinator(store,game);await reopened.open();await reopened.reconcile();await reopened.advanceIntentions();
  assert(!calls.includes('move:rescue'));assert.equal(reopened.inspect().proposals[p.id]!.standing!.status,'stopped');store.close();
 }
});
test('request survives quiescent paired restore, and core sees only deliberately communicated fields',async()=>{
 const {c,ask,data,store}=await setup();await ask();const r=c.core().requests()[0]!;data.actions[0]!.status='completed';await c.reconcile();
 await c.checkpoint('lab-concord-request');await c.restore('lab-concord-request');assert.deepEqual(c.core().requests()[0],r);
 const stored=store.read()!;(stored.requests![r.id] as any).privateThought='must not leak';store.commit(stored,{branch:stored.branch,kind:'test',actor:'operator',data:{}});
 await c.open();assert(!('privateThought' in c.core().requests()[0]!));assert.equal((await ask()).status,'failed');store.close();
});
test('late replacement reply after pawn withdrawal cannot change work',async()=>{
 const {c,p,ask,calls,store}=await setup();await ask();const offer=await c.core().offerAlternative(c.core().requests()[0]!.id,rescue,'Replace?');
 let enter!:()=>void,release!:(v:unknown)=>void;const ready=new Promise<void>(r=>enter=r);
 const task=c.pawn('A').decide(offer.id,{name:'held',decide:()=>{enter();return new Promise(r=>release=r);}});const rejected=assert.rejects(task);await ready;
 await c.pawn('A').withdraw('Separate pawn withdrawal');await c.observe();await rejected;release({kind:'accept',reason:'Late'});
 assert.equal(c.inspect().proposals[p.id]!.standing!.reason,'Separate pawn withdrawal');assert.deepEqual(calls,['move:haul','cancel']);store.close();
});

test('timeout during cancellation preserves stop but never dispatches replacement',async()=>{
 const {c,ask,calls,cancel,store}=await setup();await ask();const offer=await c.core().offerAlternative(c.core().requests()[0]!.id,rescue,'Replace?');cancel('slow');
 await assert.rejects(c.pawn('A').decide(offer.id,yes,30));assert.deepEqual(calls,['move:haul','cancel']);assert.equal(c.inspect().proposals[offer.id]!.actionId,undefined);store.close();
});
test('a late old-job receipt cannot clear the replacement commitment',async()=>{
 const {c,ask,data,store}=await setup();await ask();const offer=await c.core().offerAlternative(c.core().requests()[0]!.id,rescue,'Replace?');await c.pawn('A').decide(offer.id,yes);
 data.actions[0]!.reason='Updated old receipt';await c.reconcile();assert.equal(c.inspect().characters.A!.commitment,c.inspect().proposals[offer.id]!.actionId);assert.equal(c.inspect().characters.A!.intention,offer.id);store.close();
});

test('fresh final-trip completion invalidates replacement before cancellation',async()=>{
 const {c,p,ask,data,calls,store}=await setup(1);await ask();const offer=await c.core().offerAlternative(c.core().requests()[0]!.id,rescue,'Replace?');
 let ran=false;await assert.rejects(c.pawn('A').decide(offer.id,{name:'finish',async decide(){ran=true;data.actions[0]!.status='completed';return {kind:'accept',reason:'Help'};}}));
 assert(ran);assert.deepEqual(calls,['move:haul']);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'completed');assert.equal(c.inspect().proposals[offer.id]!.actionId,undefined);store.close();
});
test('completion returned by cancellation records finished haul and never dispatches replacement',async()=>{
 const {c,p,ask,cancel,calls,game,store}=await setup(1);await ask();const offer=await c.core().offerAlternative(c.core().requests()[0]!.id,rescue,'Replace?');cancel('completed');
 await assert.rejects(c.pawn('A').decide(offer.id,yes));assert.deepEqual(calls,['move:haul','cancel']);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'completed');
 const reopened=new Coordinator(store,game);await reopened.open();await reopened.advanceIntentions();assert(!calls.includes('move:rescue'));store.close();
});
test('maximum-length acceptance reason remains intact through bounded stop message',async()=>{
 const {c,ask,calls,store}=await setup();await ask();const offer=await c.core().offerAlternative(c.core().requests()[0]!.id,rescue,'Replace?');const reason='x'.repeat(1000);
 const result=await c.pawn('A').decide(offer.id,scripted({kind:'accept',reason}));assert.equal(result.decision!.reason,reason);assert.deepEqual(calls,['move:haul','cancel','move:rescue']);store.close();
});

test('pending goal gets standalone rescue after fresh final receipt, with old completion retained and no cancellation',async()=>{
 const {c,p,data,calls,ask,store}=await setup(1);assert.equal((await ask()).status,'continued');const r=c.core().requests()[0]!;
 data.actions[0]!.status='completed'; // Deliberately do not reconcile before the core reply.
 const offer=await c.core().offerRequestedRescue(r.id,rescue,'Your haul completed. Rescue is separate optional work.');
 assert.equal(offer.requestId,r.id);assert.equal(offer.replacesAgreementId,undefined);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'completed');
 assert.deepEqual(calls,['move:haul']);let supplied:any;
 const result=await c.pawn('A').decide(offer.id,{name:'fresh',async decide(view){supplied=view;return {kind:'accept',reason:'I accept this new rescue'};}});
 assert.equal(result.status,'accepted');assert(supplied);assert.equal(supplied.agreementProgress.status,'completed');
 assert.deepEqual(calls,['move:haul','move:rescue']);assert.equal(c.core().requests()[0]!.status,'closed');store.close();
});
test('goal reply while original work runs remains a replacement; an issued replacement is never reinterpreted',async()=>{
 const {c,p,data,ask,calls,store}=await setup(1);await ask();const r=c.core().requests()[0]!;
 const offer=await c.core().offerRequestedRescue(r.id,rescue,'Optional replacement');assert.equal(offer.replacesAgreementId,p.id);
 data.actions[0]!.status='completed';await assert.rejects(c.pawn('A').decide(offer.id,yes));
 await assert.rejects(c.core().offerRequestedRescue(r.id,rescue,'Try fresh instead'));assert.deepEqual(calls,['move:haul']);store.close();
});
test('declined or closed goals and stopped origins cannot become new offers',async()=>{
 for(const mode of ['declined','stopped','closed']){
  const {c,data,ask,store,calls}=await setup(1);await ask();const r=c.core().requests()[0]!;
  if(mode==='declined')await c.core().declineRequest(r.id,'Not now');
  if(mode==='stopped')await c.pawn('A').withdraw('I stop this work');
  if(mode==='closed'){const p=await c.core().offerAlternative(r.id,rescue,'Replace?');await c.pawn('A').decide(p.id,scripted({kind:'refuse',reason:'No'}));}
  if(mode!=='stopped')data.actions[0]!.status='completed';
  await assert.rejects(c.core().offerRequestedRescue(r.id,rescue,'Do not revive'));assert(!calls.includes('move:rescue'));store.close();
 }
});
test('completed pending goal survives paired restore; standalone counter needs fresh same-patient consent',async()=>{
 const {c,data,ask,store,calls}=await setup(1);await ask();data.actions[0]!.status='completed';await c.reconcile();
 await c.checkpoint('lab-concord-completed-request');await c.restore('lab-concord-completed-request');
 const r=c.core().requests()[0]!;assert.equal(r.status,'pending');const offer=await c.core().offerRequestedRescue(r.id,rescue,'Separate rescue?');
 await assert.rejects(c.pawn('A').decide(offer.id,scripted({kind:'counter',reason:'Different patient',action:{...rescue,target:'C'}})));
 assert.equal((await c.pawn('A').decide(offer.id,scripted({kind:'counter',reason:'Less time',action:{...rescue,maxTicks:120}}))).status,'countered');
 const revised=await c.core().revise(offer.id,'Your exact proposal');assert.equal(revised.replacesAgreementId,undefined);assert.equal(revised.requestId,r.id);assert.deepEqual(calls,['move:haul']);
 await c.pawn('A').decide(revised.id,yes);assert.deepEqual(calls,['move:haul','move:rescue']);store.close();
});
test('new work or observed recovery prevents a fresh requested offer, without changing the new agreement',async()=>{
 for(const mode of ['busy','recovered']){
  const {c,data,ask,store,calls}=await setup(1);await ask();data.actions[0]!.status='completed';await c.reconcile();
  if(mode==='busy'){const next=await c.core().propose('A',haul,'New haul');await c.pawn('A').decide(next.id,yes);}
  else data.pawns[0]!.casualties!.visibleSubjects![0]!.downed=false;
  await assert.rejects(c.core().offerRequestedRescue(c.core().requests()[0]!.id,rescue,'Stale idea'));
  assert(!calls.includes('cancel'));assert(!calls.includes('move:rescue'));assert.equal(c.core().requests()[0]!.status,'pending');store.close();
 }
});
test('standalone refusal closes only the request and preserves completed work',async()=>{
 const {c,p,data,ask,store,calls}=await setup(1);await ask();data.actions[0]!.status='completed';
 const offer=await c.core().offerRequestedRescue(c.core().requests()[0]!.id,rescue,'Separate rescue?');
 await c.pawn('A').decide(offer.id,scripted({kind:'refuse',reason:'No thanks'}));
 assert.equal(c.inspect().proposals[p.id]!.standing!.status,'completed');assert.equal(c.core().requests()[0]!.status,'closed');assert.deepEqual(calls,['move:haul']);store.close();
});
