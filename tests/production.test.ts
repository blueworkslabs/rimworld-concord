import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {Action,type ActionRequest,type GameBridge,type GameState,type Receipt,type Domain} from '../src/protocol.js';
import {sharedStatus} from '../src/shared-status.js';
import {coreWakeSnapshot} from '../src/core-scheduler.js';
import {coreView} from '../src/core-planner.js';
import {crewReport} from '../src/crew-log.js';
import {planProduction} from '../src/production-planning.js';
import {planHaul} from '../src/haul-planning.js';
const build={kind:'build' as const,thing:'wood',x:5,z:5,maxTicks:600};
const cook={kind:'cook' as const,thing:'berries',target:'fire',x:5,z:5,count:10,meals:3,maxTicks:600};
class Game implements GameBridge {
 data:GameState={world:'fire',epoch:'one',ticks:100,paused:true,loaded:true,pawns:['A','B','C'].map(id=>({id,name:id,x:4,z:5,job:'Wait',health:1,workReady:true,buildReady:true,cookReady:true,facts:[{key:'secret',value:'NEVER PUBLIC',level:.6137}]})),actions:[]};
 saved=new Map<string,GameState>();moves:ActionRequest[]=[];kind:'build'|'cook'='build';complete=true;
 async state(){const g=structuredClone(this.data);for(const p of g.pawns){p.linkStatus={source:'shared-link-telemetry',epoch:g.epoch,tick:g.ticks,food:'low',rest:'satisfied'};p.production={epoch:g.epoch,tick:g.ticks,mapId:1,options:[this.kind==='build'?build:cook],supplies:[{thing:'wood',label:'Wood',count:30},{thing:'berries',label:'Berries',count:50}]};p.hauling={epoch:g.epoch,tick:g.ticks,mapId:1,status:'available',options:[{kind:'haul',thing:'wood',x:8,z:8,count:10,trips:1,maxTicks:600}],supplies:[{thing:'wood',label:'Wood',x:8,z:8,sourceCount:30,destinationFree:75}]};}return g;}
 async move(r:ActionRequest):Promise<Receipt>{this.moves.push(r);const out={id:r.id,actor:r.actor,kind:r.action.kind,status:this.complete?'completed' as const:'started' as const,reason:'Native test receipt',x:r.action.x,z:r.action.z,delivered:1};this.data.actions.push(out);return out;}
 async cancel(r:{id:string;actor:string}):Promise<Receipt>{const out=this.data.actions.find(a=>a.id===r.id)!;if(out.status==='started')out.status='interrupted';return out;}
 async save(n:string){this.saved.set(n,structuredClone(this.data));return {sha256:'hash'};}async verify(){}async load(n:string){this.data=structuredClone(this.saved.get(n)!);this.data.epoch=randomUUID();}
}
async function setup(){const g=new Game(),s=new Store(':memory:'),c=new Coordinator(s,g);await c.open();await c.initializeCore('Optional work');return {g,s,c};}
const accept={name:'accept',async decide(){return {kind:'accept',reason:'Yes'};}};
test('telemetry never falls back to private meters; stale, missing, invalid and old timeline become unknown',async()=>{
 const {g,s,c}=await setup();const state=await g.state(),d=c.inspect();assert.equal(sharedStatus(d,state)[0]!.food,'low');
 for(const patch of [{epoch:'old'},{tick:101},{tick:-1},{tick:100-121},{source:'visual'},{food:.6137}]){const copy=structuredClone(state);Object.assign(copy.pawns[0]!.linkStatus!,patch);assert.equal(sharedStatus(d,copy)[0]!.food,'unknown');}
 delete state.pawns[0]!.linkStatus;assert.equal(sharedStatus(d,state)[0]!.food,'unknown');
 const view=coreView(d,state);assert(!JSON.stringify(view).includes('NEVER PUBLIC'));assert(!JSON.stringify(view).includes('.6137'));
 const report=crewReport(d,state.ticks,sharedStatus(d,state));assert.deepEqual(report.sharedStatus,view.sharedStatus);s.close();
});
test('only a changed shared band wakes core, not timestamp refresh or private needs',async()=>{
 const {g,s,c}=await setup();const a=await g.state(),d=c.inspect(),before=coreWakeSnapshot(coreView(d,a));
 g.data.ticks++;g.data.pawns[0]!.facts![0]!.level=.99;const b=await g.state();assert.deepEqual(coreWakeSnapshot(coreView(d,b)),before);
 b.pawns[0]!.linkStatus!.food='urgent';assert.notDeepEqual(coreWakeSnapshot(coreView(d,b)),before);s.close();
});
// Ordered-haul specific (removed with the ordered haul): a held build source refuses an ordered haul of it.
test('an ordered haul cannot take a source held by a pending build',async()=>{
 const {g,s,c}=await setup();await c.core().propose('A',build,'Optional build');
 const state=await g.state();assert.throws(()=>planHaul(c.inspect(),state,'B',state.pawns[1]!.hauling!.options[0]!));s.close();
});
test('build/cook consent, closure, exact source holds and mapped dispatch',async()=>{
 const {g,s,c}=await setup();const p=await c.core().propose('A',build,'Optional build');assert.equal(g.moves.length,0);
 await assert.rejects(c.core().propose('B',build,'Competing build'));
 await c.pawn('A').decide(p.id,accept);assert.equal(g.moves[0]!.mapId,1);assert.equal(c.inspect().proposals[p.id]!.standing!.status,'completed');
 g.kind='cook';const q=await c.core().propose('B',cook,'Optional cook');await c.pawn('B').decide(q.id,{name:'counter',async decide(){return {kind:'counter',reason:'Only two',action:{...cook,meals:2}};}});assert.equal(g.moves.length,1);
 const revised=await c.core().revise(q.id,'Two meals');assert.equal(g.moves.length,1);await c.pawn('B').decide(revised.id,accept);assert.equal(c.inspect().proposals[revised.id]!.standing!.status,'running');
 await c.checkpoint('lab-concord-meal-one');await c.restore('lab-concord-meal-one');await c.advanceIntentions();assert.equal(c.inspect().proposals[revised.id]!.standing!.status,'completed');await c.advanceIntentions();assert.equal(g.moves.length,3);
 const progress=crewReport(c.inspect(),g.data.ticks).agreements.find(a=>a.progress.id===revised.id)!.progress;assert.equal(progress.agreed,2);assert.equal(progress.delivered,2);s.close();
});
test('production refusal/deferral create no native work; withdrawal stops remaining meals across restore',async()=>{
 for(const kind of ['refuse','defer'] as const){const {g,s,c}=await setup();const p=await c.core().propose('A',build,'Optional');await c.pawn('A').decide(p.id,{name:kind,async decide(){return {kind,reason:'No work now'};}});assert.equal(g.moves.length,0);await c.checkpoint('lab-concord-no-work');await c.restore('lab-concord-no-work');assert.equal(c.inspect().proposals[p.id]!.status,kind==='refuse'?'refused':'deferred');s.close();}
 const {g,s,c}=await setup();g.kind='cook';g.complete=false;const p=await c.core().propose('A',cook,'Optional');await c.pawn('A').decide(p.id,accept);await c.pawn('A').withdraw('Changed my mind');assert.equal(g.data.actions[0]!.status,'interrupted');await c.checkpoint('lab-concord-stopped');await c.restore('lab-concord-stopped');await c.advanceIntentions();assert.equal(g.moves.length,1);s.close();
});
test('production rejects stale observations, insufficient ingredients, substituted source/table and invalid counts',async()=>{
 const {g,s,c}=await setup();g.kind='cook';const state=await g.state(),d=c.inspect();
 for(const a of [{...cook,thing:'invented'},{...cook,target:'other'},{...cook,count:9},{...cook,meals:4}])assert.throws(()=>planProduction(d,state,'A',a));
 state.pawns[0]!.production!.tick--;assert.throws(()=>planProduction(d,state,'A',cook));assert(!Action.safeParse({...cook,meals:0}).success);s.close();
});
test('frozen live protocol admits eight core turns, no ninth; continuous decisions cannot exceed remaining native window',async()=>{
 const {CAMPFIRE_POLICY,campfireInferencePassed,campfireDecisionMs}=await import('../trials/campfire-policy.js');
 assert.equal(CAMPFIRE_POLICY.runs,3);assert.equal(CAMPFIRE_POLICY.coreCalls,8);assert.equal(CAMPFIRE_POLICY.pawnCalls,12);assert.equal(CAMPFIRE_POLICY.jevCalls,0);
 const valid=Array.from({length:8},()=>({result:{status:'applied'}}));assert(campfireInferencePassed(valid));assert(!campfireInferencePassed([...valid,valid[0]!]));assert(!campfireInferencePassed([{result:{status:'failed'}}]));assert.equal(campfireDecisionMs(123),123);assert.equal(campfireDecisionMs(50000),45000);assert.throws(()=>campfireDecisionMs(0));
});
test('native resume handles the single load-pause race, but never loops over a persistent pause',async()=>{
 const {startNative}=await import('../trials/native-run.js');let calls=0;
 const b={async admin(){calls++;},async state(){return {ticks:1,paused:calls<2} as GameState;}};
 assert.equal((await startNative(b)).length,2);assert.equal(calls,2);calls=0;b.state=async()=>({ticks:1,paused:true} as GameState);await assert.rejects(startNative(b));assert.equal(calls,2);
});
test('less food appearing later is not permission to repeat a refused cooking offer with fewer meals',async()=>{
 const {g,s,c}=await setup();g.kind='cook';const p=await c.core().propose('A',cook,'Optional');await c.pawn('A').decide(p.id,{name:'no',async decide(){return {kind:'refuse',reason:'No cooking'};}});
 const state=await g.state();state.pawns[0]!.production!.options=[{...cook,meals:2}];state.pawns[0]!.production!.supplies[1]!.count=20;
 assert(!coreView(c.inspect(),state).opportunities.some(o=>o.pawn==='A'&&o.action.kind==='cook'));s.close();
});
