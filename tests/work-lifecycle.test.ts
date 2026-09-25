// Cross-kind agreement contracts must survive ordered-haul retirement.
// Rescue is the generic single-step fixture. Cooking is used ONLY for contracts
// requiring multiple steps; rescue cannot exercise advanceIntentions dispatch.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {scripted} from '../src/backends.js';
import type {ActionRequest,GameState,Receipt} from '../src/protocol.js';
const rescue={kind:'rescue' as const,target:'X',bed:'bed',x:6,z:7,maxTicks:600};
const cook={kind:'cook' as const,thing:'berries',target:'fire',x:5,z:5,count:10,meals:3,maxTicks:600};
const accept=scripted({kind:'accept',reason:'I agree to this scope'});
async function setup(action:typeof rescue|typeof cook=rescue){
 const data:GameState={world:'w',epoch:'e',ticks:10,loaded:true,paused:false,actions:[],pawns:[{id:'A',name:'Ada',x:1,z:1,job:'',health:1,rescueReady:true,cookReady:true,
  rescue:{epoch:'e',tick:10,mapId:1,status:'available',options:[rescue],observations:[]},
  production:{epoch:'e',tick:10,mapId:1,options:[cook],supplies:[{thing:'berries',label:'Berries',count:50}]}}]};
 data.pawns.push({...structuredClone(data.pawns[0]!),id:'B',name:'Bee'});
 let lost=false,cancelLost=false;const saves=new Map<string,GameState>();
 const game={async state(){return structuredClone(data);},async move(r:ActionRequest){
  const old=data.actions.find(x=>x.id===r.id);if(old)return structuredClone(old);
  const a:Receipt={id:r.id,actor:r.actor,kind:r.action.kind,status:'started',reason:'native',x:r.action.x,z:r.action.z};data.actions.push(a);
  if(lost){lost=false;throw Error('lost');}return structuredClone(a);
 },async cancel(r:{id:string;actor:string}){const a=data.actions.find(x=>x.id===r.id)!;assert.equal(a.actor,r.actor);a.status='interrupted';a.reason='withdrawn';if(cancelLost){cancelLost=false;throw Error('cancel lost');}return structuredClone(a);},
 async save(n:string){saves.set(n,structuredClone(data));return {sha256:'hash'};},async load(n:string){Object.assign(data,structuredClone(saves.get(n)!));data.epoch+='new';for(const pawn of data.pawns){if(pawn.rescue)pawn.rescue.epoch=data.epoch;if(pawn.production)pawn.production.epoch=data.epoch;}},async verify(){}};
 const store=new Store(':memory:'),c=new Coordinator(store,game);await c.open();
 const p=await c.core().propose('A',action,'Optional work');
 return {data,game,store,c,p,lose:()=>{lost=true;},loseCancel:()=>{cancelLost=true;},complete:()=>{data.actions.at(-1)!.status='completed';}};
}
test('one consent covers three meals, persists between meals, never becomes a fourth',async()=>{
 const {c,p,data,complete}=await setup(cook);await c.pawn('A').decide(p.id,accept);
 complete();await c.reconcile();assert.equal(c.inspect().characters.A!.commitment,undefined);assert.equal(c.inspect().characters.A!.intention,p.id);
 await c.checkpoint('lab-concord-work');await c.advanceIntentions();assert.equal(data.actions.length,2);
 await c.restore('lab-concord-work');assert.equal(data.actions.length,1);await c.advanceIntentions();
 complete();await c.advanceIntentions();complete();await c.advanceIntentions();await c.advanceIntentions();
 assert.equal(data.actions.length,3);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'completed');assert.equal(c.inspect().characters.A!.intention,undefined);
});
test('lost dispatch and cancellation replies reconcile without new dispatches or lost withdrawal',async()=>{
 const {c,p,data,lose,loseCancel,game,store}=await setup();lose();await assert.rejects(c.pawn('A').decide(p.id,accept),/lost/);
 await c.reconcile();assert.equal(data.actions.length,1);loseCancel();await assert.rejects(c.pawn('A').withdraw('Changed my mind'),/cancel lost/);
 const resumed=new Coordinator(store,game);await resumed.open();await resumed.reconcile();await resumed.advanceIntentions();assert.equal(data.actions.length,1);assert.equal(resumed.inspect().characters.A!.commitment,undefined);
});
test('breaks, expiry and native interruption stop the intention without automatic retry',async()=>{
 for(const cause of ['needs','expiry','interruption']){
  const {c,p,data}=await setup();await c.pawn('A').decide(p.id,accept);
  if(cause==='needs')data.pawns[0]!.rescueReady=false;else if(cause==='expiry')data.ticks=611;else data.actions[0]!.status='interrupted';
  await c.reconcile();await c.advanceIntentions();assert.equal(data.actions.length,1);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'stopped');
 }
});
test('no other proposal can bypass a standing agreement between meals',async()=>{
 const {c,p,complete,data}=await setup(cook);await c.pawn('A').decide(p.id,accept);complete();await c.reconcile();
 const other=await c.core().propose('A',{kind:'move',x:1,z:2},'Other work');await assert.rejects(c.pawn('A').decide(other.id,accept),/committed/);assert.equal(data.actions.length,1);
});
test('event reflection can withdraw active rescue; no future step follows',async()=>{
 const {c,p,data}=await setup();await c.pawn('A').decide(p.id,accept);
 data.events=[{seq:1,pawn:'A',tick:11,kind:'memory',detail:'Significant'}];data.eventSeq=1;
 const r=await c.attend('A',{name:'scripted',async reflect(view){assert.equal(view.character.intention,p.id);return {kind:'withdraw',reason:'I need to reconsider'};}});
 assert.equal(r.status,'continued');await c.advanceIntentions();assert.equal(data.actions.length,1);assert.equal(data.actions[0]!.status,'interrupted');
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

test('operator admission closes during any advancement read without dispatching the next step',async()=>{
 for(const closeOnRead of [1,2,3]){
  const {c,p,data,game,complete,store}=await setup(cook);await c.pawn('A').decide(p.id,accept);complete();
  let permitted=true,reads=0;const original=game.state;
  game.state=async()=>{const state=await original();if(++reads===closeOnRead)permitted=false;return state;};
  await c.advanceIntentions(()=>permitted);
  assert.equal(data.actions.length,1);assert.equal(c.inspect().proposals[p.id]!.standing!.steps.length,1);
  assert.equal(c.inspect().characters.A!.commitment,undefined);store.close();
 }
});

test('idempotent withdrawn rescue replay needs no old observation and does not reacquire its hold',async()=>{
 const {c,p,data,store}=await setup();
 try {
  await c.core().withdrawOffer(p.id,'Stop');delete data.pawns[0]!.rescue;
  const replay=await c.core().propose('A',rescue,'Optional work',p.id as ReturnType<typeof randomUUID>);
  assert.equal(replay.status,'withdrawn');assert.equal(data.actions.length,0);
  await c.core().propose('B',rescue,'Released patient and bed',randomUUID());
 } finally {store.close();}
});
