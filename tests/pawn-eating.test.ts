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
test('a portion that grows while the pawn thinks still eats the chosen count (identity by thing, count at most the current portion)',async()=>{
 // Live run: Alvin chose 12 berries; the suggested portion became 13 during inference and the
 // choice failed. The chosen 12 is at most the current 13, so it now goes through unchanged.
 const {g,s,c}=await setup();g.portion=12;const q=await ask(c);let calls=0,offered=0;
 const result=await c.answerCoreQuestion(q,{name:'grew',async answerCore(v){calls++;offered=v.pawn.eating!.options[0]!.count;g.portion=13;return eat;}});
 assert.equal(calls,1);assert.equal(offered,12);assert.equal(result.status,'delivered');assert.equal(g.calls,1);
 assert.equal(g.data.actions[0]!.count,12,'the chosen count, never the grown portion');assert.equal(Object.values(c.inspect().selfCare!)[0]!.action.count,12);
 // A portion that shrank dispatches the smaller current portion: never more than the game allows now.
 const second=await setup();second.g.portion=16;const q2=await ask(second.c);
 assert.equal((await second.c.answerCoreQuestion(q2,{name:'shrank',async answerCore(){second.g.portion=10;return eat;}})).status,'delivered');
 assert.equal(second.g.data.actions[0]!.count,10);s.close();second.s.close();
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
 ] as const){const dd=structuredClone(d),pp=structuredClone(p);change(dd,pp);assert.equal(revalidateEating(dd,state,pp,offered,'berry',true).code,expected);}
 const smaller=structuredClone(p);smaller.eating!.options[0]!.count=15;assert.equal(revalidateEating(d,state,smaller,offered,'berry',true).code,null);assert.equal(revalidateEating(d,state,smaller,offered,'berry',true).dispatchCount,15);
 const larger=structuredClone(p);larger.eating!.options[0]!.count=17;assert.equal(revalidateEating(d,state,larger,offered,'berry',true).code,null);assert.equal(revalidateEating(d,state,larger,offered,'berry',true).dispatchCount,offered.eating!.options[0]!.count);
 assert.equal(revalidateEating(d,state,p,offered,'berry',false).code,'bridge-unavailable');
 assert.equal(revalidateEating(d,state,p,offered,'invented',true).code,'not-offered');s.close();
});
test('only an explicitly linked consumption report can close from a meal; unrelated next questions stay unlinked',async()=>{
 const {g,s,c}=await setup(),q=await ask(c);await c.answerCoreQuestion(q,{name:'eat',async answerCore(){return eat;}});
 const d=c.inspect(),msg=(id:string,from:string,to:string,text:string,tick:number)=>({id,exchangeId:'x',tick,from,to,fromName:from,toName:to,text});
 d.coreState!.questions.push({id:'unrelated-first',pawn:'A',text:'Can you build?',status:'answered',messages:[msg('unrelated-first-ask','core','A','Can you build?',140) as any]});
 d.coreState!.questions.push({id:'q2',reportSelfCareId:Object.values(d.selfCare!)[0]!.id,pawn:'A',text:'Did you eat?',status:'answered',messages:[msg('q2-ask','core','A','Did you eat?',150) as any,msg('q2-yes','A','core','Yes, I ate the berries.',151) as any]});
 d.coreState!.questions.push({id:'q3',pawn:'A',text:'Can you build?',status:'answered',messages:[msg('q3-ask','core','A','Can you build?',160) as any,msg('q3-yes','A','core','Yes.',161) as any]});
 let v=coreView(d,await g.state());
 assert.throws(()=>validateCoreChoice(resolve('q2-yes'),v),/closure unsupported/,'no closure before the receipt verifies the meal');
 const care=Object.values(d.selfCare!)[0]!;d.outcomes[care.id]={...g.data.actions[0]!,status:'completed',delivered:16};
 v=coreView(d,await g.state());
 for(const id of ['q2-ask','q2-yes'])validateCoreChoice(resolve(id),v);
 assert.equal(v.selfCare[0]!.reportQuestionId,'q2');
 for(const id of ['unrelated-first-ask','q3-ask','q3-yes'])assert.throws(()=>validateCoreChoice(resolve(id),v),/closure unsupported/,'an unrelated later question never closes');
 s.close();
});

test('typed report binding survives real question publication and cannot target another receipt or be reused',async()=>{
 const {g,s,c}=await setup();await c.configureCoreSchedule({maxAttempts:null,cooldownTicks:60,windowTicks:null});const first=await c.planCoreWhenDue({name:'eat question',async plan(){return {topics:[],actionTopicId:null,action:{kind:'ask',pawn:'A',text:'Food?',reason:'Ask'}};}});if(first.status!=='applied')throw Error('Expected question');const q=first.questionId!;await c.answerCoreQuestion(q,{name:'eat',async answerCore(){return eat;}});
 g.data.actions[0]!.status='completed';g.data.actions[0]!.delivered=16;await c.reconcile();g.data.ticks+=60;
 const care=Object.values(c.inspect().selfCare!)[0]!,choice=(receipt:string|null)=>({topics:[],actionTopicId:null,action:{kind:'ask',pawn:'A',reportSelfCareId:receipt,text:'Did you eat?',reason:'Check this meal.'}});
 assert.throws(()=>validateCoreChoice(choice('other'),coreView(c.inspect(),g.data)),/report receipt unavailable/);
 const result=await c.planCoreWhenDue({name:'report',async plan(){return choice(care.id);}});assert.equal(result.status,'applied');if(result.status!=='applied')throw Error('Expected report question');
 const report=c.inspect().coreState!.questions.find(x=>x.id===result.questionId)!;assert.equal(report.reportSelfCareId,care.id);
 const answer=await c.answerCoreQuestion(report.id,{name:'report answer',async answerCore(v){assert.equal(v.question.reportSelfCare?.id,care.id);assert.equal(v.question.reportSelfCare?.consumed,16);return {choice:'say',text:'Yes, I ate.'};}});assert.equal(answer.status,'delivered');
 const v=await c.corePerspective();for(const m of c.inspect().coreState!.questions.find(x=>x.id===report.id)!.messages)validateCoreChoice(resolve(m.id),v);
 assert(!v.selfCare.filter(x=>!x.reportQuestionId).some(x=>x.id===care.id));await c.checkpoint('lab-concord-report-link');await c.restore('lab-concord-report-link');assert.equal(c.inspect().coreState!.questions.find(x=>x.id===report.id)!.reportSelfCareId,care.id);assert.equal(g.calls,1);s.close();
});

test('answer revalidation failures remain visible per lane without leaking answer text',async()=>{
 const {g,s,c}=await setup(),q=await ask(c);await c.answerCoreQuestion(q,{name:'lost',async answerCore(){g.available=false;return {choice:'eat',thing:'berry',text:'UNPUBLISHED ANSWER'};}});
 const {crewReport}=await import('../src/crew-log.js');const report=crewReport(c.inspect(),g.data.ticks);
 assert.match(report.observerText!,/core-answer failures: 1 \(eating: option-not-current 1\)/);assert(!JSON.stringify(report).includes('UNPUBLISHED'));s.close();
});

test('a consumption report answered with another meal remains claimed but cannot close from the older meal',async()=>{
 const {g,s,c}=await setup(),q=await ask(c);await c.answerCoreQuestion(q,{name:'eat',async answerCore(){return eat;}});
 const d=c.inspect(),care=Object.values(d.selfCare!)[0]!;
 d.outcomes[care.id]={...g.data.actions[0]!,status:'completed',delivered:16};
 d.coreState!.questions.push({id:'report',reportSelfCareId:care.id,pawn:'A',text:'Did you eat?',status:'answered',messages:[{id:'report-msg',exchangeId:'x',tick:150,from:'core',to:'A',fromName:'Core',toName:'Alvin',text:'Did you eat?'} as any]});
 d.selfCare!['second']={...care,id:'second',questionId:'report'};
 const v=coreView(d,await g.state());v.questionRecipients=['A'];assert.equal(v.selfCare.find(x=>x.id===care.id)!.reportQuestionId,'report');
 assert.throws(()=>validateCoreChoice({topics:[],actionTopicId:null,action:{kind:'ask',pawn:'A',reportSelfCareId:care.id,text:'Again?',reason:'Again'}},v),/report receipt unavailable/);
 assert.throws(()=>validateCoreChoice(resolve('report-msg'),v),/closure unsupported/);s.close();
});
