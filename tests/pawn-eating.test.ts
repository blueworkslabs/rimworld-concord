import {coreView,validateCoreChoice,coreChoiceSchema,coreAnswerPrompt} from '../src/core-planner.js';
import {stopTrialWork,workSummary} from '../src/work-trial.js';
import {DecisionChannel} from '../src/decision-channel.js';
import {eatingOptions,eatingBlock,revalidateEating} from '../src/pawn-eating.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {Action,type GameState,type GameBridge,type EatRequest,type Receipt} from '../src/protocol.js';
import {coreAnswerSchema,CoreAnswerChoice} from '../src/pawn-eating.js';
import {coreWakeSnapshot} from '../src/core-scheduler.js';
import {SocialChoice} from '../src/social.js';
class Game implements GameBridge{
 data:GameState={world:'eat',epoch:'one',ticks:100,paused:true,loaded:true,pawns:[{id:'A',name:'Alvin',x:1,z:1,job:'Wait',health:1}],actions:[]};
 saved=new Map<string,GameState>();calls=0;available=true;lost=false;portion=16;
 async state(){const g=structuredClone(this.data);g.pawns[0]!.eating={epoch:g.epoch,tick:g.ticks,mapId:1,options:this.available?[{thing:'berry',label:'berries',count:this.portion,x:2,z:1,maxTicks:1800}]:[]};return g;}
 async move():Promise<Receipt>{throw Error('Core work dispatch must not happen');}
 async eat(r:EatRequest){this.calls++;let out=this.data.actions.find(a=>a.id===r.id);if(!out){out={id:r.id,actor:r.actor,kind:'eat',status:'started',reason:'Chosen',x:2,z:1,thing:r.action.thing,count:r.action.count,delivered:0};this.data.actions.push(out);}if(this.lost){this.lost=false;throw Error('Lost delivery');}return out;}
 async cancel(r:{id:string;actor:string}):Promise<Receipt>{const a=this.data.actions.find(a=>a.id===r.id)!;assert.equal(a.actor,r.actor);a.status='interrupted';return a;}
 async save(n:string){this.saved.set(n,structuredClone(this.data));return {sha256:'hash'};}async verify(){}async load(n:string){this.data=structuredClone(this.saved.get(n)!);this.data.epoch=randomUUID();}
}
const eat={choice:'eat',thing:'berry',text:'I choose these berries.'};
test('diagnostic: a growing suggested portion rejects an otherwise identical delayed choice',async()=>{
 const {g,s,c}=await setup();g.portion=12;const q=await ask(c);let calls=0,offered=0;
 const result=await c.answerCoreQuestion(q,{name:'diagnostic',async answerCore(v){calls++;offered=v.pawn.eating!.options[0]!.count;g.portion=13;return eat;}});
 assert.equal(calls,1);assert.equal(offered,12);assert.equal(result.status,'failed');assert.equal(g.calls,0);
 const event=s.events().find(e=>e.event.kind==='core-answer-failed')!.event.data as any;
 assert.equal(event.eatingValidation.code,'portion-increased');assert.equal(event.eatingValidation.offeredCount,12);assert.equal(event.eatingValidation.currentCount,13);assert.equal(event.eatingValidation.checkedTick,100);
 assert.equal((await c.corePerspective() as any).eatingValidation,undefined);s.close();
});
async function setup(){const g=new Game(),s=new Store(':memory:'),c=new Coordinator(s,g);await c.open();await c.initializeCore('Ask; no orders.');return {g,s,c};}
async function ask(c:Coordinator){const r=await c.planCore({name:'scripted',async plan(){return {topic:null,action:{kind:'ask',pawn:'A',text:'What would help?',reason:'Ask'}};}});assert.equal(r.status,'applied');if(r.status!=='applied')throw Error();return r.questionId!;}
test('eat is pawn-only, absent from core offers and ordinary social speech; plain promise starts nothing',async()=>{
 assert.throws(()=>Action.parse({kind:'eat',thing:'berry'}));assert.throws(()=>SocialChoice.parse(eat));assert.throws(()=>CoreAnswerChoice.parse({...eat,actor:'B'}));assert.equal(coreAnswerSchema().oneOf.length,2);
 const {g,s,c}=await setup(),q=await ask(c);let calls=0;const r=await c.answerCoreQuestion(q,{name:'scripted',async answerCore(v){calls++;assert.equal(coreAnswerSchema(v).oneOf.length,3);return {choice:'say',text:'I will eat'};}});assert.equal(r.status,'delivered');assert.equal(calls,1);assert.equal(g.calls,0);assert.deepEqual(c.inspect().selfCare,undefined);s.close();
});
test('typed eating tracks actual receipt, wakes core, preserves restore and never creates a core agreement',async()=>{
 const {g,s,c}=await setup();await c.checkpoint('lab-concord-before-eat');const q=await ask(c);assert.equal((await c.answerCoreQuestion(q,{name:'eat',async answerCore(){return eat;}})).status,'delivered');assert.equal(g.calls,1);assert.equal(Object.keys(c.inspect().proposals).length,0);await assert.rejects(c.checkpoint('lab-concord-active-eat'));await assert.rejects(c.answerCoreQuestion(q,{name:'retry',async answerCore(){return eat;}}));
 g.data.actions[0]!.status='completed';g.data.actions[0]!.delivered=16;await c.reconcile();assert.equal(c.inspect().characters.A!.commitment,undefined);assert.equal((await c.corePerspective()).selfCare[0]!.consumed,16);assert(coreWakeSnapshot(await c.corePerspective()).some(w=>w.kind==='self-care'));assert(c.inspect().crew!.entries.some(e=>e.text==='eat: completed. Consumed 16 food items.'));
 await c.checkpoint('lab-concord-after-eat');const after=c.inspect().selfCare;await c.restore('lab-concord-before-eat');assert.equal(c.inspect().selfCare,undefined);await c.restore('lab-concord-after-eat');assert.deepEqual(c.inspect().selfCare,after);await c.reconcile();assert.equal(g.calls,1);s.close();
});
test('lost dispatch response reconciles same action; pawn-bound stop records interruption',async()=>{
 const {g,s,c}=await setup(),q=await ask(c);g.lost=true;assert.equal((await c.answerCoreQuestion(q,{name:'eat',async answerCore(){return eat;}})).status,'failed');assert.equal(g.data.actions.length,1);await c.reconcile();assert.equal(g.calls,1);await c.pawn('A').stopEating();assert.equal(c.inspect().characters.A!.commitment,undefined);assert.equal(g.data.actions[0]!.status,'interrupted');await c.reconcile();assert.equal(g.calls,1);s.close();
});
test('lost option, invented target, extra authority and existing commitment reject without dispatch',async()=>{
 for(const variant of ['lost','target','actor','committed']){
  const {g,s,c}=await setup();if(variant==='committed'){const d=c.inspect();d.characters.A!.commitment='other';s.commit(d,{branch:d.branch,kind:'fixture',actor:'operator',data:{}});await c.open();}
  const q=await ask(c);let seen=0;const r=await c.answerCoreQuestion(q,{name:'bad',async answerCore(v){seen++;if(variant==='committed')assert.equal(v.pawn.eating!.options.length,0);if(variant==='lost')g.available=false;return variant==='target'?{...eat,thing:'invented'}:variant==='actor'?{...eat,actor:'B'}:eat;}});
  assert.equal(seen,1);assert.equal(r.status,'failed');assert.equal(g.calls,0);s.close();
 }
});
test('late eating answer cannot act after paired rewind',async()=>{
 const {g,s,c}=await setup();await c.checkpoint('lab-concord-before-answer');const q=await ask(c);let enter!:()=>void,release!:(v:unknown)=>void;const entered=new Promise<void>(r=>enter=r);const pending=c.answerCoreQuestion(q,{name:'delayed',async answerCore(){enter();return new Promise(r=>release=r);}});await entered;await c.restore('lab-concord-before-answer');release(eat);assert.equal((await pending).status,'interrupted');assert.equal(g.calls,0);s.close();
});

test('decision relay carries typed core eating but remains speech-only for social turns',async()=>{
 const {g,s,c}=await setup(),q=await ask(c),requests:any[]=[];const channel=new DecisionChannel(r=>requests.push(r));
 const pending=c.answerCoreQuestion(q,channel);while(!requests.length)await new Promise(r=>setImmediate(r));
 assert.equal(requests[0].mode,'core-answer');channel.receive({type:'decision-result',id:requests[0].id,output:eat});assert.equal((await pending).status,'delivered');assert.equal(g.calls,1);
 const abort=new AbortController();const social=channel.speak({} as any,abort.signal);assert.throws(()=>channel.receive({type:'decision-result',id:requests[1].id,output:eat}));abort.abort();await assert.rejects(social);s.close();
});
test('answered counter does not permanently suppress self-care; unresolved counter still holds',async()=>{
 const {g,s,c}=await setup();const d=c.inspect(),p={id:'counter',pawn:'A',status:'countered' as const,reason:'less work',action:{kind:'move' as const,x:1,z:1}};d.proposals.counter=p;
 const state=await g.state();assert.equal(eatingOptions(d,state,state.pawns[0]!).length,0);d.proposals.counter!.replyId='revision';d.proposals.revision={...p,id:'revision',status:'refused'};assert.equal(eatingOptions(d,state,state.pawns[0]!).length,1);s.close();
});

test('shared trial shutdown cancels self-care and leaves a checkpointable state',async()=>{
 const {g,s,c}=await setup(),q=await ask(c);assert.equal((await c.answerCoreQuestion(q,{name:'eat',async answerCore(){return eat;}})).status,'delivered');
 const cleanup=await stopTrialWork(c);assert.deepEqual(cleanup.errors,[]);assert.deepEqual(cleanup.operatorStops,['A']);assert.equal(g.data.actions[0]!.status,'interrupted');await c.checkpoint('lab-concord-cleanup-eating');assert(c.inspect().crew!.entries.some(e=>e.text.includes('Operator trial ended')));s.close();
});
test('self-care consumption is not counted as delivered work or hauling trips',async()=>{
 const {g,s,c}=await setup(),q=await ask(c);await c.answerCoreQuestion(q,{name:'eat',async answerCore(){return eat;}});g.data.actions[0]!.status='completed';g.data.actions[0]!.delivered=16;await c.reconcile();const summary=workSummary(c.inspect());assert.equal(summary.deliveredUnits,0);assert.equal(summary.completedTrips,0);assert.equal(summary.selfCare[0]!.delivered,16);s.close();
});

const resolve=(sourceId:string)=>({topics:[{sourceId,text:'This bounded eating action completed.',status:'resolved'}],actionTopicId:null,action:{kind:'wait',reason:'No further action.'}});
test('only matched positive completed eating resolves its receipt/question/reply, never brief or unrelated work',async()=>{
 const {g,s,c}=await setup(),q=await ask(c);assert.equal((await c.answerCoreQuestion(q,{name:'eat',async answerCore(){return eat;}})).status,'delivered');
 const care=Object.values(c.inspect().selfCare!)[0]!,sources=[care.id,...c.inspect().coreState!.questions[0]!.messages.map(m=>m.id)];
 let v=await c.corePerspective();for(const id of sources)assert.throws(()=>validateCoreChoice(resolve(id),v),/closure unsupported/);
 g.data.actions[0]!.status='completed';g.data.actions[0]!.delivered=16;await c.reconcile();v=await c.corePerspective();
 assert.equal(v.selfCare[0]!.consumedUnit,'food-items');assert.equal(v.selfCare[0]!.food.label,'berries');assert.equal(v.selfCare[0]!.portionCount,16);
 for(const id of sources){validateCoreChoice(resolve(id),v);const schema:any=coreChoiceSchema(v);assert(schema.anyOf[0].properties.topics.items.anyOf.find((b:any)=>b.properties.sourceId.const===id).properties.status.enum.includes('resolved'));}
 assert.throws(()=>validateCoreChoice(resolve('brief'),v),/closure unsupported/);
 const d=c.inspect();d.proposals.work={id:'work',pawn:'A',status:'pending',action:{kind:'move',x:1,z:1},reason:'Still separate'};d.coreState!.topics.push({sourceId:sources[1]!,text:'Mixed scope',status:'open',proposalIds:['work']});
 const mixed=coreView(d,await g.state());assert.throws(()=>validateCoreChoice(resolve(sources[1]!),mixed),/closure unsupported/);assert.throws(()=>validateCoreChoice(resolve('work'),mixed),/closure unsupported/);validateCoreChoice(resolve(care.id),mixed);
 s.close();
});
test('eating closure fails closed for interrupted, empty, mismatched and multiply linked receipts',async()=>{
 const {g,s,c}=await setup(),q=await ask(c);await c.answerCoreQuestion(q,{name:'eat',async answerCore(){return eat;}});g.data.actions[0]!.status='completed';g.data.actions[0]!.delivered=16;await c.reconcile();const original=c.inspect(),care=Object.values(original.selfCare!)[0]!,world=await g.state();
 for(const patch of [{status:'interrupted'},{status:'failed'},{status:'started'},{delivered:0},{delivered:17},{delivered:1.5},{actor:'B'},{kind:'haul'},{thing:'other'},{count:25},{id:'wrong'}]){const d=structuredClone(original);Object.assign(d.outcomes[care.id]!,patch);assert.throws(()=>validateCoreChoice(resolve(care.id),coreView(d,world)),/closure unsupported/);}
 const d=structuredClone(original);delete d.outcomes[care.id];assert.throws(()=>validateCoreChoice(resolve(care.id),coreView(d,world)),/closure unsupported/);
 const multi=structuredClone(original);multi.selfCare!.other={...care,id:'other'};const v=coreView(multi,await g.state()),message=original.coreState!.questions[0]!.messages[0]!.id;assert.throws(()=>validateCoreChoice(resolve(message),v),/closure unsupported/);validateCoreChoice(resolve(care.id),v);s.close();
});
test('resolved self-care topics survive rewind/restore without closing unrelated goals or replaying food',async()=>{
 const {g,s,c}=await setup();await c.checkpoint('lab-concord-empty');const q=await ask(c);await c.answerCoreQuestion(q,{name:'eat',async answerCore(){return eat;}});g.data.actions[0]!.status='completed';g.data.actions[0]!.delivered=16;await c.reconcile();const care=Object.values(c.inspect().selfCare!)[0]!;
 const outcome=await c.planCore({name:'close',async plan(){return resolve(care.id);}});assert.equal(outcome.status,'applied');assert.equal(c.inspect().coreState!.topics[0]!.status,'resolved');await c.checkpoint('lab-concord-closed');
 await c.restore('lab-concord-empty');assert.equal(c.inspect().coreState!.topics.length,0);assert.equal(c.inspect().selfCare,undefined);await c.restore('lab-concord-closed');assert.equal(c.inspect().coreState!.topics[0]!.status,'resolved');assert.equal(g.calls,1);s.close();
});

test('eating revalidation distinguishes policy blocks, stale views, missing option and changed map without changing admission',async()=>{
 const {c,g,s}=await setup();const d=c.inspect(),state=await g.state(),p=state.pawns[0]!,offered=structuredClone(p);
 assert.equal(revalidateEating(d,state,p,offered,'berry',true).code,null);
 for(const [expected,change] of [
  ['existing-commitment',(d:any,p:any)=>{d.characters.A.commitment='work';}],
  ['existing-intention',(d:any,p:any)=>{d.characters.A.intention={};}],
  ['observation-tick',(d:any,p:any)=>{p.eating.tick--;}],
  ['observation-epoch',(d:any,p:any)=>{p.eating.epoch='old';}],
  ['option-not-current',(d:any,p:any)=>{p.eating.options=[];}],
  ['map-changed',(d:any,p:any)=>{p.eating.mapId=2;}],
  ['portion-increased',(d:any,p:any)=>{p.eating.options[0].count=17;}],
 ] as const){const dd=structuredClone(d),pp=structuredClone(p);change(dd,pp);assert.equal(revalidateEating(dd,state,pp,offered,'berry',true).code,expected);}
 const smaller=structuredClone(p);smaller.eating!.options[0]!.count=15;assert.equal(revalidateEating(d,state,smaller,offered,'berry',true).code,null);
 assert.equal(revalidateEating(d,state,p,offered,'berry',false).code,'bridge-unavailable');
 assert.equal(revalidateEating(d,state,p,offered,'invented',true).code,'not-offered');s.close();
});
