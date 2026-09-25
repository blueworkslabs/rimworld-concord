// Ordered-haul specific throughout (removed with the ordered haul).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {scripted} from '../src/backends.js';
import type {ActionRequest,GameState,Haul,Receipt} from '../src/protocol.js';
const haul:Haul={kind:'haul',thing:'steel',x:4,z:5,count:10,trips:3,maxTicks:600};
const other:Haul={...haul,thing:'wood',x:8};
const accept=scripted({kind:'accept',reason:'Agreed bounded work'});
async function setup(){
 const data:GameState={world:'w',epoch:'e',ticks:10,loaded:true,paused:false,actions:[],pawns:['A','B','C'].map(id=>({id,name:id,x:1,z:1,job:'',health:1,workReady:true,
  facts:[{key:'private',value:'Only '+id,level:1}],hauling:{epoch:'e',tick:10,mapId:1,status:'available',options:[haul,other,{...haul,x:8},{...other,x:4}],supplies:[
   {thing:'steel',label:'Steel',x:4,z:5,sourceCount:75,destinationFree:75},{thing:'wood',label:'Wood',x:8,z:5,sourceCount:75,destinationFree:75},
   {thing:'steel',label:'Steel',x:8,z:5,sourceCount:75,destinationFree:75},{thing:'wood',label:'Wood',x:4,z:5,sourceCount:75,destinationFree:75}]}}))};
 const saves=new Map<string,GameState>(),requests:ActionRequest[]=[];let cancelLost=false;
 const game={async state(){return structuredClone(data);},async move(r:ActionRequest){requests.push(r);const a:Receipt={id:r.id,actor:r.actor,status:'started',reason:'Haul',x:r.action.x,z:r.action.z};data.actions.push(a);return structuredClone(a);},
  async cancel(r:{id:string}){if(cancelLost)throw Error('uncertain cancellation');const a=data.actions.find(a=>a.id===r.id)!;a.status='interrupted';return structuredClone(a);},
  async save(n:string){saves.set(n,structuredClone(data));return {sha256:'hash'};},async verify(){},async load(n:string){Object.assign(data,structuredClone(saves.get(n)!));data.epoch+='new';for(const p of data.pawns)p.hauling!.epoch=data.epoch;}};
 const store=new Store(':memory:'),c=new Coordinator(store,game);await c.open();
 return {c,store,game,data,requests,loseCancel:(v:boolean)=>{cancelLost=v;}};
}
test('concurrent competing offers serialize without native jobs; distinct work remains available',async()=>{
 const {c,data}=await setup();const results=await Promise.allSettled(['A','B'].map(p=>c.core().propose(p,haul,'Supplies')));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.equal(data.actions.length,0);await assert.rejects(c.core().propose('C',{...haul,x:8},'Same source'),/held/);
 await assert.rejects(c.core().propose('C',{...other,x:4},'Same cell'),/held/);
 const view=await c.core().haulingOptions('C');assert.deepEqual(view!.options,[other]);assert.equal(view!.supplies!.length,1);
 await c.core().propose('C',other,'Distinct resources');assert.equal(data.actions.length,0);
});
test('physical quantity, capacity, map and freshness are checked before offers; legacy view fails closed',async()=>{
 for(const cause of ['source','capacity','epoch','tick','map','legacy','unknown','count']){
  const {c,data}=await setup(),v=data.pawns[0]!.hauling!;let action=haul;
  if(cause==='source')v.supplies![0]!.sourceCount=29;
  if(cause==='capacity')v.supplies![0]!.destinationFree=29;
  if(cause==='epoch')v.epoch='past';if(cause==='tick')v.tick--;
  if(cause==='map')delete v.mapId;if(cause==='legacy')delete v.supplies;
  if(cause==='unknown')action={...haul,thing:'invented'};if(cause==='count')action={...haul,count:11};
  await assert.rejects(c.core().propose('A',action,cause));assert.equal(Object.keys(c.inspect().proposals).length,0);assert.equal(data.actions.length,0);
 }
});
test('refusal, counter and pending withdrawal release holds; accepting still needs a fresh offer',async()=>{
 for(const choice of ['refuse','counter','withdraw']){
  const {c,data}=await setup(),p=await c.core().propose('A',haul,'Supplies');
  if(choice==='withdraw')await c.core().withdrawOffer(p.id,'Core no longer proposes this');
  else await c.pawn('A').decide(p.id,scripted(choice==='counter'?{kind:'counter',reason:'One trip',action:{...haul,trips:1}}:{kind:'refuse',reason:'No'}));
  assert.equal(data.actions.length,0);const b=await c.core().propose('B',haul,'Released resource');
  if(choice==='counter'){
   await assert.rejects(c.core().revise(p.id,'Now occupied'),/held/);
   await c.core().withdrawOffer(b.id,'Release');const revision=await c.core().revise(p.id,'One trip');assert.equal(data.actions.length,0);
   await c.pawn('A').decide(revision.id,accept);assert.equal(data.actions.length,1);
  }
 }
});
test('accepted holds survive between trips and restore; core cannot withdraw accepted work',async()=>{
 const {c,data,game,store,requests}=await setup(),p=await c.core().propose('A',haul,'Supplies');await c.pawn('A').decide(p.id,accept);
 assert.equal(requests[0]!.mapId,1);await assert.rejects(c.core().withdrawOffer(p.id,'Override'),/Only pending/);
 data.actions[0]!.status='completed';await c.reconcile();await c.checkpoint('lab-concord-holds');
 await assert.rejects(c.core().propose('B',haul,'Conflict'),/held/);await c.pawn('A').withdraw('Done for now');
 await c.core().propose('B',haul,'New timeline offer');await c.restore('lab-concord-holds');
 assert.equal(Object.keys(c.inspect().proposals).length,1);await assert.rejects(c.core().propose('B',haul,'Restored hold'),/held/);
 const reopened=new Coordinator(store,game);await reopened.open();await assert.rejects(reopened.core().propose('B',haul,'Reopened hold'),/held/);
 await reopened.pawn('A').withdraw('Stop');await reopened.core().propose('B',haul,'Released');
});
test('uncertain cancellation keeps the hold until native cancellation reconciles',async()=>{
 const {c,loseCancel}=await setup(),p=await c.core().propose('A',haul,'Supplies');await c.pawn('A').decide(p.id,accept);loseCancel(true);
 await assert.rejects(c.pawn('A').withdraw('Stop'),/uncertain/);await assert.rejects(c.core().propose('B',haul,'Still held'),/held/);
 loseCancel(false);await c.reconcile();await c.core().propose('B',haul,'Now released');
});
test('withdrawal invalidates an in-flight decision, without granting the core cancellation of accepted jobs',async()=>{
 const {c,data}=await setup(),p=await c.core().propose('A',haul,'Supplies');let answer!:(v:unknown)=>void,ready!:()=>void;
 const waiting=new Promise<void>(r=>ready=r);
 const result=c.pawn('A').decide(p.id,{name:'delayed',async decide(){ready();return new Promise(r=>answer=r);}});
 const rejected=assert.rejects(result);await waiting;await c.core().withdrawOffer(p.id,'Offer expired');answer({kind:'accept',reason:'Late'});await rejected;
 assert.equal(data.actions.length,0);assert.equal(c.inspect().proposals[p.id]!.status,'withdrawn');await c.core().propose('B',haul,'Freed');
});
test('idempotent offer replay does not reacquire a released hold or need the old physical observation',async()=>{
 const {c,data}=await setup(),id=randomUUID(),p=await c.core().propose('A',haul,'Supplies',id);
 await c.core().withdrawOffer(p.id,'Stop');delete data.pawns[0]!.hauling;
 const replay=await c.core().propose('A',haul,'Supplies',id);assert.equal(replay.status,'withdrawn');assert.equal(data.actions.length,0);
});
test('pawn decisions and reflection see filtered physical options, never another pawn private reasons',async()=>{
 const {c,data}=await setup();await c.core().propose('A',haul,'Private planning explanation');
 const p=await c.core().propose('B',other,'Independent work');let decisionChecked=false,reflectionChecked=false;
 await c.pawn('B').decide(p.id,{name:'inspect',async decide(view){assert.deepEqual(view.pawn.hauling!.options,[other]);assert(!JSON.stringify(view).includes('Private planning explanation'));decisionChecked=true;return {kind:'refuse',reason:'No'};}});
 data.events=[{seq:1,pawn:'B',tick:10,kind:'memory',detail:'Significant'}];data.eventSeq=1;
 const result=await c.attend('B',{name:'inspect',async reflect(view){assert.deepEqual(view.pawn.hauling!.options,[other]);assert(!JSON.stringify(view).includes('Only A'));reflectionChecked=true;return {kind:'continue',reason:'Wait'};}});
 assert.equal(result.status,'continued');assert(decisionChecked&&reflectionChecked);
 const view=await c.core().haulingOptions('B');view!.supplies![0]!.sourceCount=0;assert.equal(data.pawns[1]!.hauling!.supplies![1]!.sourceCount,75);
});
test('equal coordinates on different maps do not conflict, but a source identity still does',async()=>{
 const {c,data}=await setup();await c.core().propose('A',haul,'Map one');data.pawns[1]!.hauling!.mapId=2;
 await c.core().propose('B',{...other,x:4},'Map two');assert.equal(data.actions.length,0);
 await assert.rejects(c.core().propose('C',haul,'Same source'),/held/);
});
