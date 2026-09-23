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
