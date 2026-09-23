import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {coreView,validateCoreChoice,coreChoiceSchema,coreAnswerPrompt,type CoreView} from '../src/core-planner.js';
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
 const v=await c.corePerspective();assert.equal(v.messages.length,2);assert.deepEqual(v.questionRecipients,[]);await assert.rejects(c.answerCoreQuestion(r.questionId!,{name:'retry',async answerCore(){throw Error();}}));
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
 const {c,s}=await setup();await c.checkpoint('lab-concord-core-before');const r=await c.planCore(planner(offer));if(r.status!=='applied')throw Error();const p=c.inspect().proposals[r.proposalId!]!;await c.pawn(p.pawn).decide(p.id,{name:'accept',async decide(){return {kind:'accept',reason:'Yes'};}});await c.reconcile();await c.checkpoint('lab-concord-core-after');const state=c.inspect().coreState;
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
 const parsed=parseClaudeResult({type:'result',subtype:'success',is_error:false,total_cost_usd:.01,structured_output:{core:wait},modelUsage:{[CLAUDE_MODEL]:{}},num_turns:1},'core');assert.deepEqual(parsed.output,wait);
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
