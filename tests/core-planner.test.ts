import {codexSchema} from '../src/contract-cases.js';
import {codexRequest} from '../src/codex-decision.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {corePrompt,coreView,validateCoreChoice,coreChoiceSchema,coreAnswerPrompt,type CoreView} from '../src/core-planner.js';
import {crewReport} from '../src/crew-log.js';
import {claudeArgs,parseClaudeResult,CLAUDE_MODEL} from '../src/claude-decision.js';
import {DecisionChannel} from '../src/decision-channel.js';
import type {ActionRequest,GameBridge,GameState,Receipt} from '../src/protocol.js';
class Game implements GameBridge {
 data:GameState={world:'core',epoch:'one',ticks:100,paused:true,loaded:true,pawns:['A','B'].map((id,i)=>({id,name:id,x:i,z:1,job:'Wait',health:1,downed:false,facts:[{key:'need',value:'Food',level:.9}]})),actions:[]};
 saved=new Map<string,GameState>();moves=0;available=true;
 async state(){const g=structuredClone(this.data);for(const p of g.pawns)p.hauling={epoch:g.epoch,tick:g.ticks,mapId:1,status:'available',options:this.available?[{kind:'haul',thing:'wood'+p.id,x:10+(p.id==='A'?0:1),z:1,count:10,trips:1,maxTicks:600}]:[],supplies:[{thing:'wood'+p.id,label:'Wood',x:10+(p.id==='A'?0:1),z:1,sourceCount:20,destinationFree:75}]};return g;}
 async cancel(r:{epoch:string;actor:string;id:string;kind?:string}):Promise<Receipt>{const prior=this.data.actions.find(a=>a.id===r.id);if(prior)return prior;const out={id:r.id,actor:r.actor,status:'interrupted' as const,reason:'Cancelled',x:0,z:0};this.data.actions.push(out);return out;}
 async save(n:string){this.saved.set(n,structuredClone(this.data));return {sha256:'hash'};}async verify(){}async load(n:string){this.data=structuredClone(this.saved.get(n)!);this.data.epoch=randomUUID();}
 async move(r:ActionRequest):Promise<Receipt>{this.moves++;const out={id:r.id,actor:r.actor,status:'completed' as const,reason:'Delivered',x:r.action.x,z:r.action.z,delivered:10};this.data.actions.push(out);return out;}
}
async function setup(){const g=new Game(),s=new Store(':memory:'),c=new Coordinator(s,g);await c.open();await c.initializeCore('Coordinate optional wood work. Cooking is unsupported.');return {g,s,c};}
const planner=(f:(v:CoreView)=>unknown)=>({name:'scripted-core',async plan(v:CoreView){return f(v);}});
const wait={topic:null,action:{kind:'wait',reason:'Nothing to propose'}};
const offer=(v:CoreView)=>({topic:{sourceId:'brief',text:'Move useful supplies',status:'open'},action:{kind:'propose',opportunityId:v.opportunities[0]!.id,reason:'Optional work, your choice.'}});
test('core projection excludes pawn secrets, private speech and operator diagnostics by structure',async()=>{
 const {g,s,c}=await setup();const d=c.inspect();d.characters.A!.memories=['private'];d.characters.A!.messages=[{id:'secret',exchangeId:'x',tick:1,from:'A',to:'B',text:'Private conversation'}];(d.characters.A as any).privateTest={secret:true};d.crew={revision:1,nextSeq:1,entries:[{seq:1,tick:1,kind:'message',actor:'A',recipient:'B',subject:'secret',text:'Private conversation',key:'secret'}]};
 const v=coreView(d,await g.state());assert.deepEqual(v.crew,[{id:'A',name:'A'},{id:'B',name:'B'}]);assert.deepEqual(v.messages,[]);assert.equal((v as any).characters,undefined);assert.equal((v as any).pawns,undefined);assert.equal((v.crew[0] as any).memories,undefined);assert.equal((v.crew[0] as any).privateTest,undefined);assert.equal((v as any).crewLog,undefined);assert.equal(v.opportunities.length,2);s.close();
});
test('core proposal executes nothing; refusal cannot be retried and counter needs fresh consent',async()=>{
 const {g,s,c}=await setup();let calls=0;const result=await c.planCore(planner(v=>{calls++;return offer(v);}));assert.equal(result.status,'applied');assert.equal(calls,1);assert.equal(g.moves,0);if(result.status!=='applied')throw Error();const p=c.inspect().proposals[result.proposalId!]!;
 await c.pawn(p.pawn).decide(p.id,{name:'refuse',async decide(){return {kind:'refuse',reason:'No thanks'};}});const v=await c.corePerspective();assert(!v.opportunities.some(o=>o.pawn===p.pawn));assert.equal(g.moves,0);
 const r=await c.planCore(planner(offer));if(r.status!=='applied')throw Error();const q=c.inspect().proposals[r.proposalId!]!;
 await c.pawn(q.pawn).decide(q.id,{name:'counter',async decide(){return {kind:'counter',reason:'Less',action:{...q.action,count:5}};}});
 const adopted=await c.planCore(planner(v=>({topic:null,action:{kind:'adopt_counter',proposalId:v.counters[0]!.id,reason:'Would five units suit you?'}})));assert.equal(adopted.status,'applied');assert.equal(g.moves,0);if(adopted.status!=='applied')throw Error();assert.equal(c.inspect().proposals[adopted.proposalId!]!.status,'pending');s.close();
});
test('one addressed question, voluntary answer, no belief or consent, no private leakage',async()=>{
 const {g,s,c}=await setup();const r=await c.planCore(planner(()=>({topic:{sourceId:'brief',text:'Clarify needs before work',status:'open'},action:{kind:'ask',pawn:'A',text:'What would help?',reason:'Ask before proposing.'}})));if(r.status!=='applied')throw Error();assert.equal(g.moves,0);assert.equal(c.inspect().characters.B!.messages,undefined);
 let called=0;const a=await c.answerCoreQuestion(r.questionId!,{name:'answer',async answerCore(v){called++;assert.equal(v.question.from,'core');assert.equal(coreAnswerPrompt(v).task,'core-answer');return {choice:'say',text:'I might haul later, but that is not consent.'};}});assert.equal(a.status,'delivered');assert.equal(called,1);assert.equal(g.moves,0);assert.equal(Object.keys(c.inspect().proposals).length,0);assert.equal(c.inspect().characters.A!.outlook,undefined);
 const v=await c.corePerspective();assert.equal(v.messages.length,2);assert.deepEqual(v.questionRecipients,['B']);await assert.rejects(c.answerCoreQuestion(r.questionId!,{name:'retry',async answerCore(){throw Error();}}));
 assert.equal(crewReport(c.inspect(),100).entries.filter(e=>e.key.startsWith('core-talk:')).length,2);assert.equal(c.inspect().characters.B!.messages,undefined);s.close();
});
test('silence closes question without speech or re-asking; malformed authority is rejected',async()=>{
 const {c,s,g}=await setup();const q=await c.planCore(planner(()=>({topic:null,action:{kind:'ask',pawn:'A',text:'Help?',reason:'Question'}})));if(q.status!=='applied')throw Error();assert.equal((await c.answerCoreQuestion(q.questionId!,{name:'silent',async answerCore(){return {choice:'stay_silent'};}})).status,'silent');assert.equal((await c.corePerspective()).messages.length,1);
 for(const output of [{...wait,action:{kind:'order',pawn:'A'}},{topic:{sourceId:'made-up',text:'Secret',status:'open'},action:wait.action},{topic:{sourceId:'brief',text:'Done',status:'completed'},action:wait.action},{topic:null,action:{kind:'ask',pawn:'A',text:'Again?',reason:'Again'}}])assert.equal((await c.planCore(planner(()=>output))).status,'failed');assert.equal(g.moves,0);s.close();
});
test('opportunity lost while core thinks is rejected without an offer',async()=>{
 const {c,s,g}=await setup();const r=await c.planCore(planner(v=>{const out=offer(v);g.available=false;return out;}));assert.equal(r.status,'failed');assert.deepEqual(c.inspect().proposals,{});assert.equal(g.moves,0);s.close();
});
test('planner state and addressed answers survive save/restore; late old-timeline response cannot apply',async()=>{
 const {c,s}=await setup();await c.checkpoint('lab-concord-core-before');
 assert.equal((await c.planCore(planner(()=>({topics:[{sourceId:'brief',text:'Move useful supplies',status:'open'}],actionTopicId:null,action:{kind:'wait',reason:'Note'}})))).status,'applied');
 const r=await c.planCore(planner(offer));if(r.status!=='applied')throw Error();const p=c.inspect().proposals[r.proposalId!]!;await c.pawn(p.pawn).decide(p.id,{name:'accept',async decide(){return {kind:'accept',reason:'Yes'};}});await c.reconcile();await c.checkpoint('lab-concord-core-after');const state=c.inspect().coreState;
 await c.restore('lab-concord-core-after');assert.deepEqual(c.inspect().coreState,state);assert.equal((await c.corePerspective()).topics[0]!.outcomes[0]!.status,'completed');await c.restore('lab-concord-core-before');assert.equal(c.inspect().coreState!.topics.length,0);
 let enter!:()=>void,release!:(v:unknown)=>void;const entered=new Promise<void>(r=>enter=r);const turn=c.planCore({name:'late',async plan(){enter();return new Promise(r=>release=r);}});await entered;await c.restore('lab-concord-core-before');release(wait);assert.equal((await turn).status,'interrupted');assert.equal(c.inspect().coreState!.turns.length,0);s.close();
});
test('timeouts and reopen retire running attempts and never apply late answers',async()=>{
 const {c,s,g}=await setup();let release!:(v:unknown)=>void;const r=await c.planCore({name:'slow',async plan(){return new Promise(x=>release=x);}},10);assert.equal(r.status,'interrupted');release(wait);assert.equal(c.inspect().coreState!.turns[0]!.status,'failed');
 const d=c.inspect();d.coreState!.turns.push({id:randomUUID(),status:'running'});s.commit(d,{branch:d.branch,kind:'test',actor:'operator',data:{}});const reopened=new Coordinator(s,g);await reopened.open();assert(reopened.inspect().coreState!.turns.every(t=>t.status==='failed'));s.close();
});
test('core provider schema, runtime projection validation and relay have distinct modes',async()=>{
 const {c,s}=await setup();const v=await c.corePerspective(),args=claudeArgs('core',v);assert(args.includes('--tools'));assert.equal(args[args.indexOf('--tools')+1],'');assert.deepEqual(JSON.parse(args[args.indexOf('--json-schema')+1]!).properties.core,coreChoiceSchema(v));assert(args[args.indexOf('--system-prompt')+1]!.includes('colony core'));
 assert.throws(()=>validateCoreChoice({topic:null,action:{kind:'propose',opportunityId:'fake',reason:'Go'}},v));
 const parsed=parseClaudeResult({type:'result',subtype:'success',is_error:false,total_cost_usd:.01,structured_output:{core:wait},modelUsage:{[CLAUDE_MODEL]:{}},num_turns:1},'core');assert.deepEqual(parsed.output,{topics:[],actionTopicId:null,action:wait.action});
 const requests:any[]=[];const channel=new DecisionChannel(m=>requests.push(m));const turn=c.planCore(channel);while(!requests.length)await new Promise(r=>setImmediate(r));assert.equal(requests[0].mode,'core');channel.receive({type:'decision-result',id:requests[0].id,output:wait});assert.equal((await turn).status,'applied');s.close();
});
test('addressed question reply persists privately to its participants across paired restore',async()=>{
 const {c,s}=await setup();const q=await c.planCore(planner(()=>({topic:null,action:{kind:'ask',pawn:'A',text:'What matters?',reason:'One optional question'}})));if(q.status!=='applied')throw Error();
 assert.equal((await c.answerCoreQuestion(q.questionId!,{name:'answer',async answerCore(){return {choice:'say',text:'A short haul would suit me.'};}})).status,'delivered');
 await c.checkpoint('lab-concord-core-answer');const before=c.inspect();await c.restore('lab-concord-core-answer');assert.deepEqual(c.inspect().coreState,before.coreState);assert.deepEqual(c.inspect().characters.A!.messages,before.characters.A!.messages);assert.equal(c.inspect().characters.B!.messages,undefined);assert.equal((await c.corePerspective()).messages[1]!.text,'A short haul would suit me.');s.close();
});
test('pawn withdrawal excludes the same work even though proposal remains accepted',async()=>{
 const {c,s,g}=await setup();g.move=async r=>{g.moves++;const out={id:r.id,actor:r.actor,status:'started' as const,reason:'Running',x:r.action.x,z:r.action.z};g.data.actions.push(out);return out;};
 g.cancel=async r=>{const out={id:r.id,actor:r.actor,status:'interrupted' as const,reason:'Stopped',x:0,z:0};g.data.actions=g.data.actions.filter(a=>a.id!==r.id);g.data.actions.push(out);return out;};
 const r=await c.planCore(planner(offer));if(r.status!=='applied')throw Error();const p=c.inspect().proposals[r.proposalId!]!;await c.pawn(p.pawn).decide(p.id,{name:'accept',async decide(){return {kind:'accept',reason:'Yes'};}});await c.pawn(p.pawn).withdraw('I no longer agree');assert.equal(c.inspect().proposals[p.id]!.status,'accepted');assert.equal(c.inspect().proposals[p.id]!.standing!.status,'stopped');assert(!(await c.corePerspective()).opportunities.some(o=>o.pawn===p.pawn));s.close();
});
test('core-directed speech ingests existing experience and rejects an interrupting injury arriving during thought',async()=>{
 const {c,s,g}=await setup();g.data.events=[{seq:1,tick:90,pawn:'A',kind:'need-band',subject:'Food',detail:'Food changed'}];g.data.eventSeq=1;
 const q=await c.planCore(planner(()=>({topic:null,action:{kind:'ask',pawn:'A',text:'How are you?',reason:'One question'}})));if(q.status!=='applied')throw Error();let seen=0;
 const result=await c.answerCoreQuestion(q.questionId!,{name:'injury',async answerCore(v){seen=v.character.experiences?.length??0;g.data.events!.push({seq:2,tick:101,pawn:'A',kind:'health',subject:'injury',detail:'New injury'});g.data.eventSeq=2;g.data.ticks=101;return {choice:'say',text:'I am uninjured.'};}});
 assert.equal(seen,1);assert.equal(result.status,'interrupted');assert.equal((await c.corePerspective()).messages.length,1);assert.equal(c.inspect().eventCursor,2);s.close();
});
test('finite core trial treats inference failure differently from refusal, waiting and silence',async()=>{
 const {coreInferencePassed,coreNativeWindow}=await import('../trials/core-policy.js');
 const valid=[{result:{status:'applied'},answer:{status:'silent'}},{result:{status:'applied'},proposal:{decision:{kind:'refuse'}}},{result:{status:'applied'},proposal:{decision:{kind:'counter'}}},{result:{status:'applied'}}];assert(coreInferencePassed(valid));
 assert(!coreInferencePassed(valid.map(()=>({result:{status:'failed'}}))));assert(!coreInferencePassed([...valid.slice(0,3),{result:{status:'applied'},answer:{status:'interrupted'}}]));assert(!coreInferencePassed([...valid.slice(0,3),{result:{status:'applied'},pawnError:'Invalid provider answer'}]));assert(!coreInferencePassed(valid.slice(0,3)));
 assert.deepEqual([0,1,2,3].map(i=>coreNativeWindow(false,i)),[30000,30000,30000,30000]);
});
test('runner cancellation after a pawn response but during the final state read cannot dispatch',async()=>{
 const {c,s,g}=await setup();const r=await c.planCore(planner(offer));if(r.status!=='applied')throw Error();const p=c.inspect().proposals[r.proposalId!]!,controller=new AbortController(),state=g.state.bind(g);let called=0;
 await assert.rejects(c.pawn(p.pawn).decide(p.id,{name:'late-disconnect',async decide(){called++;g.state=async()=>{const result=await state();controller.abort();return result;};return {kind:'accept',reason:'I agree'};}},1000,controller.signal));
 assert.equal(called,1);assert.equal(g.moves,0);assert.equal(c.inspect().proposals[p.id]!.status,'pending');s.close();
});

test('defer is communicated non-consent, persists, and suppresses repeated ordinary offers to that pawn',async()=>{
 const {c,s,g}=await setup();const r=await c.planCore(planner(offer));if(r.status!=='applied')throw Error();const p=c.inspect().proposals[r.proposalId!]!;
 const reply=await c.pawn(p.pawn).decide(p.id,{name:'not-now',async decide(){return {kind:'defer',reason:'Not now; I want to eat before considering more work.'};}});
 assert.equal(reply.status,'deferred');assert.equal(reply.actionId,undefined);assert.equal(g.moves,0);assert.equal(c.inspect().characters[p.pawn]!.intention,undefined);
 let v=await c.corePerspective();assert(!v.opportunities.some(o=>o.pawn===p.pawn));assert.equal(v.agreements[0]!.reply!.kind,'defer');assert.equal(v.agreements[0]!.replyEvidence,'attributed-speech');
 assert(crewReport(c.inspect(),100).entries.some(e=>e.text.startsWith('defer:')));
 await c.checkpoint('lab-concord-core-deferred');await c.restore('lab-concord-core-deferred');g.data.ticks+=1000;
 v=await c.corePerspective();assert(!v.opportunities.some(o=>o.pawn===p.pawn));assert.equal(c.inspect().proposals[p.id]!.status,'deferred');assert.equal(g.moves,0);s.close();
});
test('defer is available through the provider and reflection contracts; attribution and source identity are explicit',async()=>{
 const {c,s}=await setup();const {modelPrompt}=await import('../src/model-perspective.js');
 const r=await c.planCore(planner(offer));if(r.status!=='applied')throw Error();const p=c.inspect().proposals[r.proposalId!]!;
 let prompt:any;await c.pawn(p.pawn).decide(p.id,{name:'inspect',async decide(v){prompt=modelPrompt('decision',v);return {kind:'defer',reason:'Later, not now'};}});
 assert(prompt.executableChoices.some((x:any)=>x.choice==='defer'));
 const args=claudeArgs('decision');const schema=JSON.parse(args[args.indexOf('--json-schema')+1]!);assert(schema.properties.decision.oneOf.some((x:any)=>x.properties.kind.const==='defer'));
 assert.equal(parseClaudeResult({type:'result',subtype:'success',is_error:false,total_cost_usd:0,structured_output:{decision:{kind:'defer',reason:'Not now'}},modelUsage:{[CLAUDE_MODEL]:{}},num_turns:1},'decision').output.kind,'defer');
 const v=await c.corePerspective();assert(v.opportunities.length);for(const o of v.opportunities){assert.equal(o.action.kind,'haul');if(o.action.kind==='haul')assert.equal(o.supply?.sourceThingId,o.action.thing);assert.equal(o.supply?.label,'Wood');}
 s.close();
});
test('event scheduler coalesces terminal outcomes, waits through cooldown and does not wake on polling or its own thoughts',async()=>{
 const {c,s,g}=await setup();await c.configureCoreSchedule({maxAttempts:3,cooldownTicks:60,windowTicks:1000});let calls=0;
 const backend=planner(v=>{calls++;return offer(v);});
 const r=await c.planCoreWhenDue(backend);assert.equal(r.status,'applied');if(r.status!=='applied')throw Error();const p=c.inspect().proposals[r.proposalId!]!;
 assert.equal((await c.planCoreWhenDue(backend)).status,'idle');assert.equal(calls,1);
 await c.pawn(p.pawn).decide(p.id,{name:'accept',async decide(){return {kind:'accept',reason:'One trip'};}});await c.reconcile();
 assert.equal((await c.corePerspective()).agreements[0]!.progress.status,'completed');
 assert.equal((await c.planCoreWhenDue(backend)).status,'idle');g.data.ticks+=60;
 let triggers:any;assert.equal((await c.planCoreWhenDue(planner(v=>{calls++;triggers=(v as any).wakeReasons;return wait;}))).status,'applied');
 assert.equal(triggers.length,1);assert.equal(triggers[0].kind,'agreement');assert.equal(triggers[0].sourceId,p.id);
 g.data.ticks+=60;g.data.pawns[0]!.facts![0]!.level=.1;g.available=false;
 for(let i=0;i<3;i++)assert.equal((await c.planCoreWhenDue(backend)).status,'idle');assert.equal(calls,2);
 assert.equal(c.inspect().coreState!.schedule!.attempts,2);await assert.rejects(c.planCore(backend),/mode mismatch/);s.close();
});
test('scheduled failure consumes its event and attempt; new replies wake once, and budget cannot be reset',async()=>{
 const {c,s,g}=await setup();const cfg={maxAttempts:2,cooldownTicks:60,windowTicks:1000};await c.configureCoreSchedule(cfg);
 assert.equal((await c.planCoreWhenDue(planner(()=>({nonsense:true})))).status,'failed');g.data.ticks+=60;
 assert.equal((await c.planCoreWhenDue(planner(()=>wait))).status,'idle');
 const p=await c.core().propose('A',{kind:'move',x:2,z:1},'Separate operator offer');await c.pawn('A').decide(p.id,{name:'no',async decide(){return {kind:'defer',reason:'Not now'};}});
 assert.equal((await c.planCoreWhenDue(planner(()=>wait))).status,'applied');g.data.ticks+=60;
 const q=await c.core().propose('B',{kind:'move',x:2,z:1},'Separate operator offer');await c.pawn('B').decide(q.id,{name:'no',async decide(){return {kind:'refuse',reason:'No'};}});
 const result=await c.planCoreWhenDue(planner(()=>{throw Error('Must not call');}));assert.equal(result.status,'idle');if(result.status==='idle')assert.equal(result.reason,'budget-exhausted');
 await c.configureCoreSchedule(cfg);assert.equal(c.inspect().coreState!.schedule!.attempts,2);await assert.rejects(c.configureCoreSchedule({...cfg,maxAttempts:3}),/immutable/);s.close();
});
test('scheduler preserves consumed events and caps across reopen and paired restore; late results expire',async()=>{
 const {c,s,g}=await setup();await c.configureCoreSchedule({maxAttempts:2,cooldownTicks:60,windowTicks:120});
 assert.equal((await c.planCoreWhenDue(planner(()=>wait))).status,'applied');await c.checkpoint('lab-concord-core-events');const before=c.inspect().coreState;
 const reopened=new Coordinator(s,g);await reopened.open();assert.deepEqual(reopened.inspect().coreState,before);
 await reopened.restore('lab-concord-core-events');g.data.ticks+=60;assert.equal((await reopened.planCoreWhenDue(planner(()=>wait))).status,'idle');
 const p=await reopened.core().propose('A',{kind:'move',x:2,z:1},'Optional');await reopened.pawn('A').decide(p.id,{name:'no',async decide(){return {kind:'refuse',reason:'No'};}});
 const result=await reopened.planCoreWhenDue(planner(()=>{g.data.ticks+=60;return wait;}));assert.equal(result.status,'failed');assert.equal(g.moves,0);assert.equal(reopened.inspect().coreState!.schedule!.attempts,2);s.close();
});
test('concurrent scheduler polls never admit two turns and events arriving during inference remain pending',async()=>{
 const {c,s,g}=await setup();await c.configureCoreSchedule({maxAttempts:3,cooldownTicks:60,windowTicks:1000});
 let enter!:()=>void,release!:(v:unknown)=>void;const entered=new Promise<void>(r=>enter=r);
 const pending=c.planCoreWhenDue({name:'blocked',async plan(){enter();return new Promise(r=>release=r);}});await entered;
 assert.equal((await c.planCoreWhenDue(planner(()=>{throw Error('Concurrent inference');}))).status,'idle');
 const p=await c.core().propose('A',{kind:'move',x:2,z:1},'Optional');await c.pawn('A').decide(p.id,{name:'no',async decide(){return {kind:'defer',reason:'Not now'};}});
 release(wait);assert.equal((await pending).status,'applied');g.data.ticks+=60;
 let wakes:any;assert.equal((await c.planCoreWhenDue(planner(v=>{wakes=(v as any).wakeReasons;return wait;}))).status,'applied');assert.equal(wakes[0].sourceId,p.id);assert.equal(g.moves,0);s.close();
});
test('scheduled unanswered question does not wake; voluntary answer and silence both do, without granting consent',async()=>{
 for(const choice of [{choice:'say',text:'I report hunger.'},{choice:'stay_silent'}]){
  const {c,s,g}=await setup();await c.configureCoreSchedule({maxAttempts:3,cooldownTicks:60,windowTicks:1000});
  const r=await c.planCoreWhenDue(planner(()=>({topic:null,action:{kind:'ask',pawn:'A',text:'What matters?',reason:'One question'}})));if(r.status!=='applied')throw Error();
  g.data.ticks+=60;assert.equal((await c.planCoreWhenDue(planner(()=>wait))).status,'idle');
  await c.answerCoreQuestion(r.questionId!,{name:'optional',async answerCore(){return choice;}});
  let causes:any;assert.equal((await c.planCoreWhenDue(planner(v=>{causes=(v as any).wakeReasons;return wait;}))).status,'applied');
  assert(causes.some((w:any)=>w.kind==='answer'));assert.equal(g.moves,0);
  if(choice.choice==='say')assert.equal((await c.corePerspective()).messages[1]!.evidence,'attributed-speech');
  g.data.ticks+=60;assert.equal((await c.planCoreWhenDue(planner(()=>wait))).status,'idle');s.close();
 }
});
test('event trial permits unused calls and deferral but never hides inference failure',async()=>{
 const {coreEventsInferencePassed}=await import('../trials/core-events-policy.js');
 assert(coreEventsInferencePassed([{result:{status:'applied'},proposal:{decision:{kind:'defer'}}}]));
 assert(!coreEventsInferencePassed([]));assert(!coreEventsInferencePassed([{result:{status:'failed'}}]));
 assert(!coreEventsInferencePassed([{result:{status:'applied'},pawnError:'Failed'}]));
 assert(!coreEventsInferencePassed(Array.from({length:5},()=>({result:{status:'applied'}}))));
});
test('terminal movement receipts wake the core even without a standing agreement',async()=>{
 for(const outcome of ['completed','interrupted','failed'] as const){
  const {c,s,g}=await setup();await c.configureCoreSchedule({maxAttempts:3,cooldownTicks:60,windowTicks:1000});
  await c.planCoreWhenDue(planner(()=>wait));g.data.ticks+=60;
  g.move=async r=>{g.moves++;const receipt={id:r.id,actor:r.actor,status:'started' as const,reason:'In progress',x:0,z:0};g.data.actions.push(receipt);return receipt;};
  const p=await c.core().propose('A',{kind:'move',x:2,z:1},'Optional movement');await c.pawn('A').decide(p.id,{name:'accept',async decide(){return {kind:'accept',reason:'I agree'};}});
  assert.equal((await c.planCoreWhenDue(planner(()=>wait))).status,'idle');
  g.data.actions[0]!.status=outcome;await c.reconcile();let wakes:any;
  assert.equal((await c.planCoreWhenDue(planner(v=>{wakes=(v as any).wakeReasons;return wait;}))).status,'applied');
  assert.equal(wakes.length,1);assert.equal(wakes[0].sourceId,p.id);assert.equal(JSON.parse(wakes[0].value).status,outcome==='completed'?'completed':'stopped');
  g.data.ticks+=60;assert.equal((await c.planCoreWhenDue(planner(()=>wait))).status,'idle');s.close();
 }
});

// Offers link only to a topic that already exists: note it in one turn, offer linked in the next.
const noteTopic=(v:CoreView,pawn:string)=>{const op=v.opportunities.find(o=>o.pawn===pawn)!;return {topics:[{sourceId:op.id,text:'Optional supplies',status:'open'}],actionTopicId:null,action:{kind:'wait',reason:'Note the need first'}};};
const multiOffer=(v:CoreView,pawn:string)=>{const op=v.opportunities.find(o=>o.pawn===pawn)!,existing=v.topics.some(t=>t.sourceId===op.id);return {topics:existing?[]:[{sourceId:op.id,text:'Optional supplies',status:'open'}],actionTopicId:existing?op.id:null,action:{kind:'propose',opportunityId:op.id,reason:'Optional haul'}};};
const linkedOffer=async(c:Coordinator,pawn:string)=>{assert.equal((await c.planCore(planner(v=>noteTopic(v,pawn)))).status,'applied');return c.planCore(planner(v=>multiOffer(v,pawn)));};
test('one turn closes multiple earlier topics only against completed linked receipts',async()=>{
 const {c,s,g}=await setup();
 for(const pawn of ['A','B']){const r=await linkedOffer(c,pawn);assert.equal(r.status,'applied');if(r.status!=='applied')throw Error();await c.pawn(pawn).decide(r.proposalId!,{name:'yes',async decide(){return {kind:'accept',reason:'One trip'};}});await c.reconcile();}
 const view=await c.corePerspective();assert.equal(view.topics.length,2);assert(view.topicClosures.filter(t=>t.sourceId.startsWith('op:')).every(t=>t.statuses.includes('resolved')));
 const close={topics:view.topics.map(t=>({sourceId:t.sourceId,text:'Linked work completed',status:'resolved'})),actionTopicId:null,action:wait.action};
 assert.equal((await c.planCore(planner(()=>close))).status,'applied');assert.deepEqual(c.inspect().coreState!.topics.map(t=>t.status),['resolved','resolved']);assert.equal(g.moves,2);
 await c.checkpoint('lab-concord-topics-closed');await c.restore('lab-concord-topics-closed');assert.deepEqual(c.inspect().coreState!.topics.map(t=>t.status),['resolved','resolved']);
 const schema:any=coreChoiceSchema(await c.corePerspective());assert(schema.anyOf.every((b:any)=>b.required.includes('topics')&&!b.required.includes('topic')&&b.properties.topics.maxItems===8));s.close();
});
test('topic closure distinguishes refusal from completion and never guesses from prose or unknown links',async()=>{
 const {c,s}=await setup();const r=await linkedOffer(c,'A');if(r.status!=='applied')throw Error();const t=(await c.corePerspective()).topics[0]!;
 const update=(status:string)=>({topics:[{sourceId:t.sourceId,text:'I claim it is done',status}],actionTopicId:null,action:wait.action});
 assert.equal((await c.planCore(planner(()=>update('resolved')))).status,'failed');
 await c.pawn('A').decide(r.proposalId!,{name:'no',async decide(){return {kind:'refuse',reason:'No thanks'};}});
 assert.equal((await c.planCore(planner(()=>update('resolved')))).status,'failed');assert.equal((await c.planCore(planner(()=>update('declined')))).status,'applied');
 assert.equal(c.inspect().coreState!.topics[0]!.status,'declined');
 assert.throws(()=>validateCoreChoice({topics:[{sourceId:'brief',text:'Done',status:'resolved'}],actionTopicId:null,action:wait.action},coreView(c.inspect(),awaitableGame())));
 s.close();
 function awaitableGame(){return {world:'core',epoch:'one',ticks:100,paused:true,loaded:true,pawns:[],actions:[]} as GameState;}
});
test('batch validation is atomic; duplicates, ninth topics and closed action links create no offers',async()=>{
 const {c,s,g}=await setup();const v=await c.corePerspective(),t={sourceId:'brief',text:'Open',status:'open'};
 for(const choice of [{topics:[t,t],actionTopicId:null,action:wait.action},{topics:[t],actionTopicId:'unknown',action:multiOffer(v,'A').action},{topics:[{...t,status:'resolved'}],actionTopicId:'brief',action:multiOffer(v,'A').action}])assert.equal((await c.planCore(planner(()=>choice))).status,'failed');
 assert.equal(c.inspect().coreState!.topics.length,0);assert.equal(Object.keys(c.inspect().proposals).length,0);assert.equal(g.moves,0);
 const d=c.inspect();d.coreState!.topics=Array.from({length:8},(_,i)=>({sourceId:'old'+i,text:'old',status:'open',proposalIds:[]}));
 const full=coreView(d,await g.state());assert.throws(()=>validateCoreChoice(multiOffer(full,'A'),full),/capacity full/);
 // At capacity a new topic is not even expressible, and the prompt says so; existing topics can still be updated.
 const schema:any=coreChoiceSchema(full);const ids=schema.anyOf[0].properties.topics.items.anyOf.map((b:any)=>b.properties.sourceId.const);
 assert.deepEqual(ids,full.topics.map(t=>t.sourceId));assert.equal(corePrompt(full).perspective.availableChoices.topicCapacity.full,true);
 validateCoreChoice({topics:[{sourceId:'old0',text:'still open',status:'blocked'}],actionTopicId:'old0',action:multiOffer(full,'A').action},full);s.close();
});
test('counter lineage closes its topic from the accepted revision, not from the superseded offer',async()=>{
 const {c,s}=await setup();const r=await linkedOffer(c,'A');if(r.status!=='applied')throw Error();const p=c.inspect().proposals[r.proposalId!]!;
 await c.pawn('A').decide(p.id,{name:'counter',async decide(){return {kind:'counter',reason:'Smaller',action:{...p.action,count:5}};}});
 const topic=c.inspect().coreState!.topics[0]!;
 const revised=await c.planCore(planner(()=>({topics:[],actionTopicId:topic.sourceId,action:{kind:'adopt_counter',proposalId:p.id,reason:'Fresh consent'}})));if(revised.status!=='applied')throw Error();
 assert(!(await c.corePerspective()).topicClosures.find(t=>t.sourceId===topic.sourceId)!.statuses.length);
 await c.pawn('A').decide(revised.proposalId!,{name:'yes',async decide(){return {kind:'accept',reason:'Yes'};}});await c.reconcile();
 assert.equal((await c.planCore(planner(()=>({topics:[{sourceId:topic.sourceId,text:'Revised work complete',status:'resolved'}],actionTopicId:null,action:wait.action})))).status,'applied');s.close();
});
test('pawn-authored re-invitation wakes once, survives restart, and still needs fresh consent',async()=>{
 const {c,s,g}=await setup();await c.configureCoreSchedule({maxAttempts:4,cooldownTicks:60,windowTicks:3600});
 // The first offer creates its topic unlinked; the fresh re-offer links to it (it exists by then).
 const r=await c.planCoreWhenDue(planner(v=>multiOffer(v,'A')));if(r.status!=='applied')throw Error();const id=r.proposalId!;
 await c.pawn('A').decide(id,{name:'later',async decide(){return {kind:'defer',reason:'Not now'};}});g.data.ticks+=60;await c.planCoreWhenDue(planner(()=>wait));
 g.data.ticks+=500;g.data.pawns[0]!.facts![0]!.level=1;assert.equal((await c.planCoreWhenDue(planner(()=>wait))).status,'idle');
 assert(!(await c.corePerspective()).opportunities.some(o=>o.pawn==='A'));
 await assert.rejects(c.pawn('B').requestReoffer(id,'Not my decision'));
 const request=await c.pawn('A').requestReoffer(id,'You may offer that haul once again.');assert.equal(g.moves,0);
 await assert.rejects(c.pawn('A').requestReoffer(id,'Again'));
 await c.checkpoint('lab-concord-reoffer');await c.restore('lab-concord-reoffer');assert.equal(c.inspect().reoffers![request.id]!.status,'pending');
 const reopened=new Coordinator(s,g);await reopened.open();assert.deepEqual(reopened.inspect().reoffers,c.inspect().reoffers);
 let wakes:any;const offer=await reopened.planCoreWhenDue(planner(v=>{wakes=(v as any).wakeReasons;return {topics:[],actionTopicId:v.topics[0]!.sourceId,action:{kind:'propose',opportunityId:v.opportunities.find(o=>o.reofferRequestId===request.id)!.id,reason:'One fresh offer, no assumed consent'}};}));assert.equal(offer.status,'applied');if(offer.status!=='applied')throw Error();assert(wakes.some((w:any)=>w.sourceId===request.id));assert.equal(g.moves,0);
 assert.equal(reopened.inspect().reoffers![request.id]!.status,'offered');g.data.ticks+=60;assert.equal((await reopened.planCoreWhenDue(planner(()=>wait))).status,'idle');
 await reopened.pawn('A').decide(offer.proposalId!,{name:'still-no',async decide(){return {kind:'refuse',reason:'I reconsidered; no'};}});assert.equal(g.moves,0);assert(!(await reopened.corePerspective()).opportunities.some(o=>o.pawn==='A'));assert((await reopened.corePerspective()).topicClosures.find(t=>t.sourceId===reopened.inspect().coreState!.topics[0]!.sourceId)!.statuses.includes('declined'));
 assert(crewReport(reopened.inspect(),g.data.ticks).entries.some(e=>e.text.startsWith('Request one fresh offer:')));s.close();
});
test('re-invitation is grounded to the exact deferred work and discarded by rewind',async()=>{
 const {c,s,g}=await setup();const r=await linkedOffer(c,'A');if(r.status!=='applied')throw Error();await c.pawn('A').decide(r.proposalId!,{name:'later',async decide(){return {kind:'defer',reason:'Later'};}});
 await c.checkpoint('lab-concord-before-reoffer');const request=await c.pawn('A').requestReoffer(r.proposalId!,'One new offer please');
 const v=await c.corePerspective(),op=v.opportunities.find(o=>o.reofferRequestId===request.id)!;assert(op);g.available=false;
 assert.equal((await c.planCore(planner(()=>({topics:[],actionTopicId:null,action:{kind:'propose',opportunityId:op.id,reason:'Stale'}})))).status,'failed');assert.equal(c.inspect().reoffers![request.id]!.status,'pending');assert.equal(g.moves,0);
 await c.restore('lab-concord-before-reoffer');assert.equal(c.inspect().reoffers,undefined);s.close();
});
test('reflection exposes only own eligible defer IDs and communicates an explicit re-invitation',async()=>{
 const {c,s,g}=await setup();const {reflectionChoices,reflectionChoiceSchema,validateReflectionChoice,reflectionFromChoice}=await import('../src/reflection-choice.js');
 const r=await linkedOffer(c,'A');if(r.status!=='applied')throw Error();const id=r.proposalId!;await c.pawn('A').decide(id,{name:'later',async decide(){return {kind:'defer',reason:'Not now'};}});
 g.data.events=[{seq:1,tick:g.data.ticks,pawn:'A',kind:'health',subject:'change',detail:'An own experience'}];g.data.eventSeq=1;let seen:any;
 const result=await c.attend('A',{name:'deliberate-request',async reflect(v){seen=v;const choice={choice:'request_fresh_offer' as const,proposalId:id,reason:'I would consider that offer again'};validateReflectionChoice(choice,v);return reflectionFromChoice(choice);}},undefined,{cooldownTicks:0});
 assert.equal(result.status,'continued');assert.equal(g.moves,0);assert(seen);assert.deepEqual(reflectionChoices(seen).find(x=>x.choice==='request_fresh_offer')!.proposalIds,[id]);
 assert(reflectionChoiceSchema(seen,{}).oneOf.some((x:any)=>x.properties.choice.const==='request_fresh_offer'));assert.throws(()=>validateReflectionChoice({choice:'request_fresh_offer',proposalId:randomUUID(),reason:'Unknown'},seen));
 const req=Object.values(c.inspect().reoffers!)[0]!;assert.equal(req.pawn,'A');assert.equal(req.reason,'I would consider that offer again');assert.equal(c.inspect().characters.B!.messages,undefined);s.close();
});

// Preserved live failure: an otherwise available question was given an offer
// topic link. The provider menu must exclude that combination, not repair it.
test('core provider branches prohibit offer links on questions and waiting',async()=>{
 const {c,s}=await setup();const v=await c.corePerspective();const schema:any=coreChoiceSchema(v);
 for(const kind of ['ask','wait']){
  const b=schema.anyOf.find((b:any)=>b.properties.action.properties.kind.const===kind);assert(b);assert.deepEqual(b.properties.actionTopicId,{type:'null'});
  const action=kind==='ask'?{kind,pawn:v.questionRecipients[0],text:'What would help?',reason:'Ask'}:{kind,reason:'Wait'};
  const output={topics:[{sourceId:'brief',text:'Shared need',status:'open'}],actionTopicId:'brief',action};
  assert.throws(()=>validateCoreChoice(output,v),/Only offers link/);
  assert.doesNotThrow(()=>validateCoreChoice({...output,actionTopicId:null},v));
 }
 // Offers link only to an existing open topic: none exists yet, so only null; a same-turn topic fails closed.
 let offer=schema.anyOf.find((b:any)=>b.properties.action.properties.kind.const==='propose');assert(offer);assert.deepEqual(offer.properties.actionTopicId,{type:'null'});
 assert.throws(()=>validateCoreChoice({topics:[{sourceId:'brief',text:'Shared need',status:'open'}],actionTopicId:'brief',action:{kind:'propose',opportunityId:v.opportunities[0]!.id,reason:'Go'}},v),/existing open action topic/);
 assert.equal((await c.planCore(planner(()=>({topics:[{sourceId:'brief',text:'Shared need',status:'open'}],actionTopicId:null,action:{kind:'wait',reason:'Note'}})))).status,'applied');
 const next=await c.corePerspective();offer=(coreChoiceSchema(next) as any).anyOf.find((b:any)=>b.properties.action.properties.kind.const==='propose');
 assert(offer.properties.actionTopicId.anyOf.some((b:any)=>b.enum?.includes('brief')));validateCoreChoice({topics:[],actionTopicId:'brief',action:{kind:'propose',opportunityId:next.opportunities[0]!.id,reason:'Go'}},next);s.close();
});

test('naming another pawn in a core reply never changes delivery or forwards to them',async()=>{
 const {c,s,g}=await setup();const q=await c.planCore(planner(()=>({topic:null,action:{kind:'ask',pawn:'A',text:'Can you help B?',reason:'Ask'}})));if(q.status!=='applied')throw Error();let envelope:any;
 const answer=await c.answerCoreQuestion(q.questionId!,{name:'reply',async answerCore(v){envelope=coreAnswerPrompt(v).delivery;return {choice:'say',text:'B, the food is south.'};}});
 assert.equal(answer.status,'delivered');assert.deepEqual(envelope,{from:'A',to:'core',forwarding:'none'});assert.equal(c.inspect().characters.B!.messages?.length??0,0);assert.equal(c.inspect().coreState!.questions[0]!.messages.at(-1)!.to,'core');assert.equal(g.moves,0);s.close();
});

test('ongoing schedule survives more than sixteen turns, does not poll unchanged state, and preserves admission on restore',async()=>{
 const {c,s,g}=await setup();await c.configureCoreSchedule({maxAttempts:null,windowTicks:null,cooldownTicks:60});
 const update=(i:number)=>{g.data.ticks+=60;g.data.pawns[0]!.linkStatus={source:'shared-link-telemetry',epoch:g.data.epoch,tick:g.data.ticks,food:i%2?'low':'satisfied',rest:'satisfied'};};
 for(let i=0;i<20;i++){update(i);assert.equal((await c.planCoreWhenDue(planner(()=>wait))).status,'applied');assert.equal((await c.planCoreWhenDue(planner(()=>{throw Error('no duplicate');}))).status,'idle');}
 assert.equal(c.inspect().coreState!.schedule!.attempts,20);await c.checkpoint('lab-concord-ongoing');const saved=c.inspect().coreState;await c.restore('lab-concord-ongoing');assert.deepEqual(c.inspect().coreState,saved);
 g.data.ticks+=60;g.data.pawns[0]!.linkStatus!.epoch=g.data.epoch;g.data.pawns[0]!.linkStatus!.tick=g.data.ticks;
 assert.equal((await c.planCoreWhenDue(planner(()=>{throw Error('restore must not replenish');}))).status,'idle');s.close();
});
test('ongoing questions require changed public context, not reply text, elapsed time or private need values',async()=>{
 const {c,s,g}=await setup();await c.configureCoreSchedule({maxAttempts:null,windowTicks:null,cooldownTicks:60});
 const ask=planner(()=>({topic:null,action:{kind:'ask',pawn:'A',text:'What would help?',reason:'Ask'}}));
 const r=await c.planCoreWhenDue(ask);if(r.status!=='applied')throw Error();assert(!(await c.corePerspective()).questionRecipients.includes('A'));
 await c.answerCoreQuestion(r.questionId!,{name:'silent',async answerCore(){return {choice:'stay_silent'};}});g.data.ticks+=600;
 g.data.pawns[0]!.facts=[{key:'need',value:'Food',level:.1}];assert(!(await c.corePerspective()).questionRecipients.includes('A'));
 g.data.pawns[0]!.linkStatus={source:'shared-link-telemetry',epoch:g.data.epoch,tick:g.data.ticks,food:'low',rest:'satisfied'};
 assert((await c.corePerspective()).questionRecipients.includes('A'));assert.equal((await c.planCoreWhenDue(ask)).status,'applied');s.close();
});
test('ongoing repeated failures block visibly, while successful waiting is never a failure',async()=>{
 const {c,s,g}=await setup();await c.configureCoreSchedule({maxAttempts:null,windowTicks:null,cooldownTicks:60});
 for(let i=0;i<3;i++){g.data.ticks+=60;g.data.pawns[0]!.linkStatus={source:'shared-link-telemetry',epoch:g.data.epoch,tick:g.data.ticks,food:i%2?'low':'satisfied',rest:'satisfied'};assert.equal((await c.planCoreWhenDue(planner(()=>{throw Error('invalid');}))).status,'failed');}
 g.data.ticks+=600;const result=await c.planCoreWhenDue(planner(()=>wait));assert.equal(result.status,'idle');assert.match(c.inspect().coreState!.schedule!.blocked!,/diagnosis/);s.close();
});
test('ongoing prompt bounds answered history and archives closed topics without weakening closure evidence',async()=>{
 const {c,s,g}=await setup();await c.configureCoreSchedule({maxAttempts:null,windowTicks:null,cooldownTicks:60});const d=c.inspect();
 for(let i=0;i<30;i++){d.coreState!.questions.push({id:'q'+i,pawn:'A',text:'old',status:'answered',messages:[{id:'m'+i,exchangeId:'q'+i,tick:i,from:'A',to:'core',text:'old'}]});d.coreState!.topics.push({sourceId:'m'+i,text:'old',status:'resolved',proposalIds:[]});}
 const v=coreView(d,await g.state());assert.equal(v.questions.length,12);assert.equal(v.messages.length,12);assert.equal(v.topics.length,8);assert.equal(d.coreState!.topics.length,30);
 validateCoreChoice({topics:[{sourceId:'brief',text:'Still open',status:'open'}],actionTopicId:null,action:wait.action},v);
 assert.throws(()=>validateCoreChoice({topics:[{sourceId:'brief',text:'done',status:'resolved'}],actionTopicId:null,action:wait.action},v),/closure/);s.close();
});

test('Luna core schema references preserve all choice constraints while fitting accumulated history',async()=>{
 const {c,s,g}=await setup();const v=await c.corePerspective();
 for(let i=0;i<24;i++)v.messages.push({id:'m'+i,tick:i,from:'A',to:'core',text:'A public reported observation '+i,evidence:'attributed-speech'});
 for(let i=0;i<12;i++)v.requests.push({id:'r'+i,pawn:'A',target:'B',status:'pending',reason:'A public request',evidence:'attributed-speech'} as any);
 for(let i=0;i<24;i++)v.agreements.push({id:'a'+i,pawn:'A',action:{kind:'move',x:1,z:1},status:'refused',reason:'No',progress:{status:'refused'}} as any);
 const req=codexRequest('core',v),original=JSON.parse(claudeArgs('core',v)[claudeArgs('core',v).indexOf('--json-schema')+1]!);
 const expanded=structuredClone(req.schema);for(const b of expanded.properties.core.anyOf)b.properties.topics.items=expanded.$defs.coreTopicUpdate;delete expanded.$defs;
 assert.deepEqual(expanded,codexSchema(original));assert(Buffer.byteLength(JSON.stringify(req))<64000);
 v.messages[0]!.text='x'.repeat(25000);assert.throws(()=>codexRequest('core',v),/too large/);s.close();
});

test('topic dates are based on the supplied snapshot, not refreshed by reading or unrelated turns',async()=>{
 const {c,s,g}=await setup();let calls=0;
 const r=await c.planCore(planner(v=>{calls++;g.data.ticks=120;return {topics:[{sourceId:'brief',text:'An older interpretation',status:'open'}],actionTopicId:null,action:{kind:'wait',reason:'Wait'}};}));
 assert.equal(calls,1);assert.equal(r.status,'applied');
 const topic=c.inspect().coreState!.topics[0]!;assert.equal(topic.basedOnTick,100);assert.equal(topic.updatedTick,120);
 g.data.ticks=150;assert.equal((await c.planCore(planner(()=>wait))).status,'applied');
 assert.deepEqual(c.inspect().coreState!.topics[0],topic);
 await c.checkpoint('lab-concord-dated-topics');g.data.ticks=200;await c.restore('lab-concord-dated-topics');assert.deepEqual(c.inspect().coreState!.topics[0],topic);
 const d=c.inspect();delete d.coreState!.topics[0]!.basedOnTick;delete d.coreState!.topics[0]!.updatedTick;
 const v=corePrompt(coreView(d,await g.state()));assert.equal(v.perspective.plannerHistory.topics[0]!.basedOnTick,null);assert.equal(v.perspective.plannerHistory.topics[0]!.updatedTick,null);s.close();
});

test('core narration and questions retain snapshot age when ingestion arrives during inference',async()=>{
 for(const kind of ['wait','ask'] as const){
  const {g,s,c}=await setup();g.data.ticks=20100;
  let enter!:()=>void,release!:(v:unknown)=>void;const ready=new Promise<void>(r=>enter=r);
  const pending=c.planCore({name:'held',async plan(v){assert.equal(v.tick,20100);enter();return new Promise(r=>release=r);}});
  await ready;g.data.ticks=21034;g.data.eventSeq=1;g.data.events=[{seq:1,tick:20205,pawn:'A',kind:'ingested',detail:'RawBerries;count=16'}];
  release({topic:null,action:kind==='wait'?{kind,reason:'No consumption observed'}:{kind,pawn:'A',text:'Food still urgent?',reason:'Ask about hunger'}});
  assert.equal((await pending).status,'applied');
  const texts=crewReport(c.inspect(),g.data.ticks).entries.map(e=>e.text);
  // A wait is silent in the log (Gate C); a question keeps its as-of prefix.
  if(kind==='wait')assert.ok(!texts.some(t=>t.includes('No consumption observed')));
  else assert.ok(texts.some(t=>t==='[as of t20100; newer receipts since t20205] Food still urgent?'));
  s.close();
 }
});

test('rejected core outputs and failures are counted by cause and shown in-game, with whom a rejected offer was for',async()=>{
 const {c,s,g}=await setup();const v=await c.corePerspective(),op=v.opportunities[0]!;
 // A returned offer linked to a topic created this turn: rejected before publication.
 assert.equal((await c.planCore(planner(()=>({topics:[{sourceId:'brief',text:'Need',status:'open'}],actionTopicId:'brief',action:{kind:'propose',opportunityId:op.id,reason:'Go'}})))).status,'failed');
 // A backend that never answers: the deadline.
 assert.equal((await c.planCore({name:'slow',async plan(){return new Promise(()=>{});}},10)).status,'interrupted');
 // A backend with its own #71 cause.
 assert.equal((await c.planCore({name:'big',async plan(){throw Object.assign(Error('Decision unavailable'),{failureCause:'context-too-large'});}})).status,'failed');
 const f=c.inspect().coreState!.failures!;
 assert.deepEqual(f,{total:3,causes:{'rejected: topic link':1,deadline:1,'context-too-large':1}});
 const r=crewReport(c.inspect(),g.data.ticks);
 assert.match(r.observerText??'',/Core outputs failed or rejected: 3 \(topic link 1, deadline 1, context-too-large 1\)/);
 const name=c.inspect().characters[op.pawn]!.name;
 assert.ok(r.entries.some(e=>e.text===`Core's offer to ${name} was rejected before publication (topic link).`));
 assert.equal(r.entries.filter(e=>/rejected before publication/.test(e.text)).length,1,'only returned offers/questions get a record');
 assert.equal(Object.keys(c.inspect().proposals).length,0);s.close();
});

test('a wait after a pawn spoke to the core is never silent: the status says it heard them, and cuts topics at a word',async()=>{
 const {c,s,g}=await setup();await c.configureCoreSchedule({maxAttempts:null,cooldownTicks:60,windowTicks:null});
 const long='Beatrice reported urgent hunger and asked for help finding something edible before she can haul the shared wood pile safely';
 const ask=await c.planCoreWhenDue(planner(()=>({topics:[{sourceId:'brief',text:long,status:'open'}],actionTopicId:null,action:{kind:'ask',pawn:'A',text:'How are you?',reason:'Ask'}})));
 if(ask.status!=='applied'||!ask.questionId)throw Error('no question');
 assert.equal((await c.answerCoreQuestion(ask.questionId,{name:'plea',async answerCore(){return {choice:'say',text:'Please help me find food first.'};}})).status,'delivered');
 g.data.ticks+=60;assert.equal((await c.planCoreWhenDue(planner(()=>wait))).status,'applied');
 const status=crewReport(c.inspect(),g.data.ticks).observerText??'';const name=c.inspect().characters.A!.name;
 assert.match(status,new RegExp(`Core: heard ${name}; waiting on `));
 const topic=/waiting on (.*?)(?: · |$)/.exec(status)![1]!;
 assert.ok(topic.endsWith('…')&&long.startsWith(topic.slice(0,-1))&&long[topic.length-1]===' ','cut at a word boundary: '+topic);
 assert.deepEqual(c.inspect().coreState!.turns.at(-1)!.heard,['A']);
 s.close();
});
