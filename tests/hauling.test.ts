// Ordered-haul specific throughout (removed with the ordered haul).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {scripted} from '../src/backends.js';
import {Action,type ActionRequest,type GameState,type Receipt} from '../src/protocol.js';
const haul={kind:'haul' as const,thing:'steel',x:4,z:5,count:10,trips:3,maxTicks:600};
const accept=scripted({kind:'accept',reason:'Three trips, then done'});
async function setup(){
 const data:GameState={world:'w',epoch:'e',ticks:10,loaded:true,paused:false,actions:[],pawns:[{id:'A',name:'Ada',x:1,z:1,job:'',health:1,workReady:true,hauling:{epoch:'e',tick:10,mapId:1,status:'available',options:[haul],supplies:[{thing:'steel',label:'Steel',x:4,z:5,sourceCount:75,destinationFree:75}]}}]};
 let lost=false,cancelLost=false;const saves=new Map<string,GameState>();
 const game={async state(){return structuredClone(data);},async move(r:ActionRequest){
  const old=data.actions.find(x=>x.id===r.id);if(old)return structuredClone(old);
  const a:Receipt={id:r.id,actor:r.actor,status:'started',reason:'hauling',x:r.action.x,z:r.action.z};data.actions.push(a);
  if(lost){lost=false;throw Error('lost');}return structuredClone(a);
 },async cancel(r:{id:string;actor:string}){const a=data.actions.find(x=>x.id===r.id)!;assert.equal(a.actor,r.actor);a.status='interrupted';a.reason='withdrawn';if(cancelLost){cancelLost=false;throw Error('cancel lost');}return structuredClone(a);},
 async save(n:string){saves.set(n,structuredClone(data));return {sha256:'hash'};},async load(n:string){Object.assign(data,structuredClone(saves.get(n)!));data.epoch+='new';},async verify(){}};
 const store=new Store(':memory:'),c=new Coordinator(store,game);await c.open();
 const p=await c.core().propose('A',haul,'Optional supply work');
 return {data,game,store,c,p,lose:()=>{lost=true;},loseCancel:()=>{cancelLost=true;},complete:()=>{data.actions.at(-1)!.status='completed';}};
}
test('hauling is bounded and exact; queries and refusal have no effects',async()=>{
 for(const action of [{...haul,trips:4},{...haul,count:26},{...haul,maxTicks:3601},{...haul,actor:'B'}])assert.equal(Action.safeParse(action).success,false);
 const {c,p,data}=await setup();assert.deepEqual(await c.core().haulingOptions('A'),data.pawns[0]!.hauling);
 await c.pawn('A').decide(p.id,scripted({kind:'refuse',reason:'Resting'}));await c.advanceIntentions();assert.equal(data.actions.length,0);
});
test('one consent covers three trips, persists between trips, never becomes a fourth',async()=>{
 const {c,p,data,complete}=await setup();await c.pawn('A').decide(p.id,accept);
 complete();await c.reconcile();assert.equal(c.inspect().characters.A!.commitment,undefined);assert.equal(c.inspect().characters.A!.intention,p.id);
 await c.checkpoint('lab-concord-haul');await c.advanceIntentions();assert.equal(data.actions.length,2);
 await c.restore('lab-concord-haul');assert.equal(data.actions.length,1);await c.advanceIntentions();
 complete();await c.advanceIntentions();complete();await c.advanceIntentions();await c.advanceIntentions();
 assert.equal(data.actions.length,3);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'completed');assert.equal(c.inspect().characters.A!.intention,undefined);
});
test('lost dispatch and cancellation replies reconcile without new trips or lost withdrawal',async()=>{
 const {c,p,data,lose,loseCancel,game,store}=await setup();lose();await assert.rejects(c.pawn('A').decide(p.id,accept),/lost/);
 await c.reconcile();assert.equal(data.actions.length,1);loseCancel();await assert.rejects(c.pawn('A').withdraw('Changed my mind'),/cancel lost/);
 const resumed=new Coordinator(store,game);await resumed.open();await resumed.reconcile();await resumed.advanceIntentions();assert.equal(data.actions.length,1);assert.equal(resumed.inspect().characters.A!.commitment,undefined);
});
test('breaks, expiry and native interruption stop the intention without automatic retry',async()=>{
 for(const cause of ['needs','expiry','interruption']){
  const {c,p,data}=await setup();await c.pawn('A').decide(p.id,accept);
  if(cause==='needs')data.pawns[0]!.workReady=false;else if(cause==='expiry')data.ticks=611;else data.actions[0]!.status='interrupted';
  await c.reconcile();await c.advanceIntentions();assert.equal(data.actions.length,1);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'stopped');
 }
});
test('no other proposal can bypass a standing agreement between trips',async()=>{
 const {c,p,complete,data}=await setup();await c.pawn('A').decide(p.id,accept);complete();await c.reconcile();
 const other=await c.core().propose('A',{kind:'move',x:1,z:2},'Other work');await assert.rejects(c.pawn('A').decide(other.id,accept),/committed/);assert.equal(data.actions.length,1);
});
test('event reflection can withdraw active hauling; no future trip follows',async()=>{
 const {c,p,data}=await setup();await c.pawn('A').decide(p.id,accept);
 data.events=[{seq:1,pawn:'A',tick:11,kind:'memory',detail:'Significant'}];data.eventSeq=1;
 const r=await c.attend('A',{name:'scripted',async reflect(view){assert.equal(view.character.intention,p.id);return {kind:'withdraw',reason:'I need to reconsider'};}});
 assert.equal(r.status,'continued');await c.advanceIntentions();assert.equal(data.actions.length,1);assert.equal(data.actions[0]!.status,'interrupted');
});
test('hauling query is physical-only, cloned; counters still require fresh acceptance',async()=>{
 const {c,p,data}=await setup();const view=await c.core().haulingOptions('A');assert(view);assert.deepEqual(Object.keys(view).sort(),['epoch','mapId','options','status','supplies','tick']);view.options[0]!.count=1;assert.equal(data.pawns[0]!.hauling!.options[0]!.count,10);
 await c.pawn('A').decide(p.id,scripted({kind:'counter',reason:'Only one trip',action:{...haul,trips:1}}));assert.equal(data.actions.length,0);
 const reply=await c.core().revise(p.id,'One trip then');assert.equal(data.actions.length,0);await c.pawn('A').decide(reply.id,accept);assert.equal(data.actions.length,1);
});
test('late reflection cannot withdraw an agreement already ended by its pawn',async()=>{
 const {c,p,data,store}=await setup();await c.pawn('A').decide(p.id,accept);
 data.events=[{seq:1,pawn:'A',tick:11,kind:'memory',detail:'DeepTalk'}];data.eventSeq=1;
 let entered!:()=>void,release!:(v:unknown)=>void;const ready=new Promise<void>(r=>entered=r);
 const thought=c.attend('A',{name:'held',reflect:()=>{entered();return new Promise(r=>release=r);}});await ready;
 await c.pawn('A').withdraw('Separate settled pawn withdrawal');
 release({kind:'withdraw',reason:'Late withdrawal of previous agreement'});assert.equal((await thought).status,'failed');
 assert.equal(c.inspect().proposals[p.id]!.standing!.reason,'Separate settled pawn withdrawal');
 assert.equal(store.events().filter(e=>e.event.kind==='intention-stopped').length,1);assert.equal(data.actions.length,1);
 store.close();
});

test('operator admission closes during either advancement read without dispatching the next trip',async()=>{
 for(const closeOnRead of [1,2]){
  const {c,p,data,game,complete,store}=await setup();await c.pawn('A').decide(p.id,accept);complete();
  let permitted=true,reads=0;const original=game.state;
  game.state=async()=>{const state=await original();if(++reads===closeOnRead)permitted=false;return state;};
  await c.advanceIntentions(()=>permitted);
  assert.equal(data.actions.length,1);assert.equal(c.inspect().proposals[p.id]!.standing!.steps.length,1);
  assert.equal(c.inspect().characters.A!.commitment,undefined);store.close();
 }
});
