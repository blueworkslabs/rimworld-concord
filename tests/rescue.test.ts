import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {scripted} from '../src/backends.js';
import {Action,type ActionRequest,type GameState,type Receipt,type Rescue} from '../src/protocol.js';
const rescue:Rescue={kind:'rescue',target:'C',bed:'bed1',x:4,z:5,maxTicks:600};
const second:Rescue={...rescue,bed:'bed2',x:8};
const accept=scripted({kind:'accept',reason:'I will carry this casualty to that bed'});
async function setup(){
 const data:GameState={world:'w',epoch:'e',ticks:10,loaded:true,paused:false,actions:[],pawns:['A','B','C'].map(id=>({
  id,name:id,x:1,z:1,job:'',health:1,rescueReady:true,workReady:false,facts:[{key:'private',value:id,level:1}],
  rescue:{epoch:'e',tick:10,mapId:1,status:'available',options:structuredClone([rescue,second]),observations:[rescue,second].map(a=>({target:a.target,targetName:'Casualty',bed:a.bed,bedLabel:'Medical bed'}))}}))};
 const saves=new Map<string,GameState>(),requests:ActionRequest[]=[];let lost=false,cancelLost=false;
 const game={async state(){return structuredClone(data);},async move(r:ActionRequest){
  requests.push(r);const prior=data.actions.find(a=>a.id===r.id);if(prior)return structuredClone(prior);
  const a:Receipt={id:r.id,actor:r.actor,status:'started',reason:'Rescue',x:r.action.x,z:r.action.z};data.actions.push(a);
  if(lost){lost=false;throw Error('lost reply');}return structuredClone(a);
 },async cancel(r:{id:string;actor:string;kind?:string}){
  assert.equal(r.kind,'rescue');if(cancelLost)throw Error('uncertain cancellation');
  const a=data.actions.find(a=>a.id===r.id)??{id:r.id,actor:r.actor,status:'interrupted',reason:'tombstone',x:0,z:0};
  a.status='interrupted';if(!data.actions.includes(a))data.actions.push(a);return structuredClone(a);
 },async save(n:string){saves.set(n,structuredClone(data));return {sha256:'hash'};},async verify(){},async load(n:string){
  Object.assign(data,structuredClone(saves.get(n)!));data.epoch+='new';for(const p of data.pawns)p.rescue!.epoch=data.epoch;
 }};
 const store=new Store(':memory:'),c=new Coordinator(store,game);await c.open();
 return {c,data,game,store,requests,lose:()=>{lost=true;},loseCancel:(v:boolean)=>{cancelLost=v;}};
}
test('rescue contract is exact and finite; stale or invented options create no offer',async()=>{
 for(const a of [{...rescue,maxTicks:0},{...rescue,maxTicks:3601},{...rescue,trips:2},{...rescue,actor:'B'}])assert(!Action.safeParse(a).success);
 for(const cause of ['epoch','tick','map','unavailable','target','bed','coordinate']){
  const {c,data}=await setup(),v=data.pawns[0]!.rescue!;let action=rescue;
  if(cause==='epoch')v.epoch='old';if(cause==='tick')v.tick--;if(cause==='map')v.mapId=-1;if(cause==='unavailable')v.status='unavailable';
  if(cause==='target')action={...rescue,target:'unknown'};if(cause==='bed')action={...rescue,bed:'unknown'};if(cause==='coordinate')action={...rescue,x:9};
  await assert.rejects(c.core().propose('A',action,cause));assert.equal(Object.keys(c.inspect().proposals).length,0);assert.equal(data.actions.length,0);
 }
});
test('rescue plans hold casualty and bed, not native jobs; refusal and counters release holds',async()=>{
 const {c,data}=await setup();
 const results=await Promise.allSettled(['A','B'].map(p=>c.core().propose(p,rescue,'Help')));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(data.actions.length,0);
 const p=Object.values(c.inspect().proposals)[0]!;assert.equal((await c.core().rescueOptions('B'))!.options.length,0);
 await c.pawn(p.pawn).decide(p.id,scripted({kind:'counter',reason:'Use the other bed',action:second}));
 assert.equal(data.actions.length,0);const reply=await c.core().revise(p.id,'Other bed');assert.equal(data.actions.length,0);
 await c.pawn(p.pawn).decide(reply.id,scripted({kind:'refuse',reason:'Not now'}));
 assert.equal((await c.core().rescueOptions('B'))!.options.length,2);
 // A different casualty still conflicts with the held bed.
 const a=await c.core().propose('A',rescue,'Help');data.pawns[1]!.rescue!.options=[{...rescue,target:'D'}];
 await assert.rejects(c.core().propose('B',{...rescue,target:'D'},'Same bed'),/held/);
 await c.core().withdrawOffer(a.id,'No longer offered');assert.equal(data.actions.length,0);
});
test('one rescue ends after actual outcome; hauling disability does not stop capable rescue',async()=>{
 const {c,data,requests}=await setup(),p=await c.core().propose('A',rescue,'Help');await c.pawn('A').decide(p.id,accept);
 assert.equal(requests[0]!.mapId,1);assert.equal(requests[0]!.untilTick,610);
 await c.reconcile();assert.equal(c.inspect().proposals[p.id]!.standing!.status,'running');
 await assert.rejects(c.core().withdrawOffer(p.id,'Override'),/Only pending/);
 await assert.rejects(c.checkpoint('lab-concord-active'),/active/);
 data.actions[0]!.status='completed';data.actions[0]!.delivered=1;
 await c.advanceIntentions();await c.advanceIntentions();
 assert.equal(requests.length,1);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'completed');assert.equal(c.inspect().characters.A!.intention,undefined);
 await c.checkpoint('lab-concord-rescue');const saved=c.inspect();await c.restore('lab-concord-rescue');
 assert.deepEqual(c.inspect().proposals,saved.proposals);assert.deepEqual(c.inspect().outcomes,saved.outcomes);
});
test('lost rescue reply reconciles by identity; uncertain withdrawal keeps holds across restart',async()=>{
 const {c,data,game,store,lose,loseCancel,requests}=await setup(),p=await c.core().propose('A',rescue,'Help');
 lose();await assert.rejects(c.pawn('A').decide(p.id,accept),/lost reply/);await c.reconcile();assert.equal(requests.length,1);
 loseCancel(true);await assert.rejects(c.pawn('A').withdraw('Stop'),/uncertain/);
 const reopened=new Coordinator(store,game);await reopened.open();await assert.rejects(reopened.core().propose('B',rescue,'Held'),/held/);
 loseCancel(false);await reopened.reconcile();await reopened.advanceIntentions();assert.equal(data.actions.length,1);
 assert.equal(reopened.inspect().characters.A!.commitment,undefined);await reopened.core().propose('B',rescue,'Released');
});
test('rescue reflection can withdraw active work, and failures or expiry never retry',async()=>{
 for(const cause of ['reflection','needs','expiry','failure']){
  const {c,data,requests}=await setup(),p=await c.core().propose('A',rescue,'Help');await c.pawn('A').decide(p.id,accept);
  if(cause==='reflection'){
   let checked=false;data.events=[{seq:1,pawn:'A',tick:10,kind:'memory',detail:'Significant'}];data.eventSeq=1;
   const result=await c.attend('A',{name:'scripted',async reflect(v){assert.equal(v.intention!.action.kind,'rescue');checked=true;return {kind:'withdraw',reason:'Stop'};}});
   assert(checked);assert.equal(result.status,'continued');
  }
  if(cause==='needs')data.pawns[0]!.rescueReady=false;if(cause==='expiry')data.ticks=610;if(cause==='failure')data.actions[0]!.status='failed';
  await c.advanceIntentions();await c.advanceIntentions();assert.equal(requests.length,1);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'stopped');
 }
});
test('pending rescue persists but a withdrawn pending offer rejects late consent',async()=>{
 const {c,data}=await setup(),p=await c.core().propose('A',rescue,'Help');await c.checkpoint('lab-concord-pending');
 await c.core().withdrawOffer(p.id,'Not needed');await c.restore('lab-concord-pending');await assert.rejects(c.core().propose('B',rescue,'Held'),/held/);
 let reply!:(v:unknown)=>void,ready!:()=>void;const started=new Promise<void>(r=>ready=r);
 const promise=c.pawn('A').decide(p.id,{name:'slow',async decide(){ready();return new Promise(r=>reply=r);}});
 const rejected=assert.rejects(promise);await started;await c.core().withdrawOffer(p.id,'Stop');reply({kind:'accept',reason:'Late'});await rejected;assert.equal(data.actions.length,0);
});
test('rescue projection shares physical labels but no casualty private fields or other plans',async()=>{
 const {c,data}=await setup();Object.assign(data.pawns[1]!.rescue!.observations[0]!,{memories:['PRIVATE']});Object.assign(data.pawns[1]!.rescue!.options[0]!,{privateFacts:['PRIVATE']});
 const view=await c.core().rescueOptions('B');assert.deepEqual(Object.keys(view!.options[0]!).sort(),['bed','kind','maxTicks','target','x','z']);assert.deepEqual(Object.keys(view!.observations[0]!).sort(),['bed','bedLabel','target','targetName']);
 view!.options[0]!.target='changed';assert.equal(data.pawns[1]!.rescue!.options[0]!.target,'C');
 await c.core().propose('A',rescue,'Private plan');data.events=[{seq:1,pawn:'B',tick:10,kind:'memory',detail:'Significant'}];data.eventSeq=1;
 let checked=false;const result=await c.attend('B',{name:'inspect',async reflect(v){
  assert.deepEqual(v.pawn.rescue!.options,[]);assert.deepEqual(v.pawn.rescue!.observations,[]);assert.equal(v.proposals.length,0);assert.equal(v.pawn.facts![0]!.value,'B');checked=true;return {kind:'continue',reason:'Wait'};
 }});assert(checked);assert.equal(result.status,'continued');
});

test('DeepTalk queues during a rescue question, preserves experience and allows fresh supported consent',async()=>{
 const {c,data,store,requests}=await setup();const p=await c.core().propose('A',rescue,'Rescue');let release!:(v:unknown)=>void,entered!:()=>void;
 const ready=new Promise<void>(r=>entered=r);
 const task=c.pawn('A').decide(p.id,{name:'delayed',decide:()=>{entered();return new Promise(r=>release=r);}});await ready;
 data.eventSeq=1;data.events=[{seq:1,tick:10,pawn:'A',kind:'memory',detail:'DeepTalk'}];await c.observe();
 assert.equal(c.activity().length,1);assert.equal(requests.length,0);
 release({kind:'accept',reason:'The rescue still makes sense'});assert.equal((await task).status,'accepted');assert.equal(requests.length,1);
 assert.equal(c.inspect().characters.A!.experiences![0]!.event.detail,'DeepTalk');assert.equal(c.inspect().characters.A!.attention,undefined);
 assert(store.events().some(e=>e.event.kind==='experience-deferred'));store.close();
});
test('loss of the specific offered patient/bed cancels a pending rescue even without a native event',async()=>{
 for(const changed of ['target','bed','map','ready','withdrawn']){
  const {c,data,store,requests}=await setup(),p=await c.core().propose('A',rescue,'Rescue');let release!:(v:unknown)=>void,entered!:()=>void;
  const ready=new Promise<void>(r=>entered=r),task=c.pawn('A').decide(p.id,{name:'slow',decide:()=>{entered();return new Promise(r=>release=r);}});
  const rejected=assert.rejects(task);await ready;
  const own=data.pawns[0]!;
  if(changed==='target')own.rescue!.options=own.rescue!.options.map(o=>({...o,target:'other'}));
  if(changed==='bed')own.rescue!.options=[second];
  if(changed==='map')own.rescue!.mapId++;
  if(changed==='ready')own.rescueReady=false;
  if(changed==='withdrawn')await c.core().withdrawOffer(p.id,'No longer needed');
  await c.observe();await rejected;release({kind:'accept',reason:'Discard this stale consent'});
  assert.equal(requests.length,0);assert.equal(c.activity().length,0);assert(store.events().some(e=>e.event.kind==='decision-invalidated'));store.close();
 }
});
test('unrelated rescue option changes do not invalidate this question; fresh final checks work without polling',async()=>{
 const {c,data,store,requests}=await setup();let p=await c.core().propose('A',rescue,'Rescue');
 const accepted=await c.pawn('A').decide(p.id,{name:'unrelated-bed',async decide(){data.pawns[0]!.rescue!.options=[rescue];return {kind:'refuse',reason:'I decline the valid offer'};}});
 assert.equal(accepted.status,'refused');assert.equal(requests.length,0);
 p=await c.core().propose('A',rescue,'New separate test');
 await assert.rejects(c.pawn('A').decide(p.id,{name:'target-recovered',async decide(){data.pawns[0]!.rescue!.options=[];return {kind:'accept',reason:'Outdated'};}}));
 assert.equal(requests.length,0);assert.equal(c.inspect().proposals[p.id]!.decision,undefined);store.close();
});
test('reflection cannot accept a rescue whose grounding vanished while it thought',async()=>{
 const {c,data,store,requests}=await setup(),p=await c.core().propose('A',rescue,'Rescue');
 data.eventSeq=1;data.events=[{seq:1,tick:10,pawn:'A',kind:'memory',detail:'DeepTalk'}];let ran=false;
 const result=await c.attend('A',{name:'stale-grounding',async reflect(){ran=true;data.pawns[0]!.rescue!.options=[];return {kind:'proposal',proposalId:p.id,decision:{kind:'accept',reason:'Old observation'}};}});
 assert(ran);assert.equal(result.status,'failed');assert.equal(requests.length,0);assert.equal(c.inspect().proposals[p.id]!.decision,undefined);store.close();
});
