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
test('hauling query is physical-only, cloned; counters still require fresh acceptance',async()=>{
 const {c,p,data}=await setup();const view=await c.core().haulingOptions('A');assert(view);assert.deepEqual(Object.keys(view).sort(),['epoch','mapId','options','status','supplies','tick']);view.options[0]!.count=1;assert.equal(data.pawns[0]!.hauling!.options[0]!.count,10);
 await c.pawn('A').decide(p.id,scripted({kind:'counter',reason:'Only one trip',action:{...haul,trips:1}}));assert.equal(data.actions.length,0);
 const reply=await c.core().revise(p.id,'One trip then');assert.equal(data.actions.length,0);await c.pawn('A').decide(reply.id,accept);assert.equal(data.actions.length,1);
});