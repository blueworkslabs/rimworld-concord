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
 saved=new Map<string,GameState>();calls=0;available=true;lost=false;
 async state(){const g=structuredClone(this.data);g.pawns[0]!.eating={epoch:g.epoch,tick:g.ticks,mapId:1,options:this.available?[{thing:'berry',label:'berries',count:16,x:2,z:1,maxTicks:1800}]:[]};return g;}
 async move():Promise<Receipt>{throw Error('Core work dispatch must not happen');}
 async eat(r:EatRequest){this.calls++;let out=this.data.actions.find(a=>a.id===r.id);if(!out){out={id:r.id,actor:r.actor,kind:'eat',status:'started',reason:'Chosen',x:2,z:1,thing:r.action.thing,count:r.action.count,delivered:0};this.data.actions.push(out);}if(this.lost){this.lost=false;throw Error('Lost delivery');}return out;}
 async cancel(r:{id:string;actor:string}):Promise<Receipt>{const a=this.data.actions.find(a=>a.id===r.id)!;assert.equal(a.actor,r.actor);a.status='interrupted';return a;}
 async save(n:string){this.saved.set(n,structuredClone(this.data));return {sha256:'hash'};}async verify(){}async load(n:string){this.data=structuredClone(this.saved.get(n)!);this.data.epoch=randomUUID();}
}
const eat={choice:'eat',thing:'berry',text:'I choose these berries.'};
async function setup(){const g=new Game(),s=new Store(':memory:'),c=new Coordinator(s,g);await c.open();await c.initializeCore('Ask; no orders.');return {g,s,c};}
async function ask(c:Coordinator){const r=await c.planCore({name:'scripted',async plan(){return {topic:null,action:{kind:'ask',pawn:'A',text:'What would help?',reason:'Ask'}};}});assert.equal(r.status,'applied');if(r.status!=='applied')throw Error();return r.questionId!;}
test('eat is pawn-only, absent from core offers and ordinary social speech; plain promise starts nothing',async()=>{
 assert.throws(()=>Action.parse({kind:'eat',thing:'berry'}));assert.throws(()=>SocialChoice.parse(eat));assert.throws(()=>CoreAnswerChoice.parse({...eat,actor:'B'}));assert.equal(coreAnswerSchema().oneOf.length,2);
 const {g,s,c}=await setup(),q=await ask(c);let calls=0;const r=await c.answerCoreQuestion(q,{name:'scripted',async answerCore(v){calls++;assert.equal(coreAnswerSchema(v).oneOf.length,3);return {choice:'say',text:'I will eat'};}});assert.equal(r.status,'delivered');assert.equal(calls,1);assert.equal(g.calls,0);assert.deepEqual(c.inspect().selfCare,undefined);s.close();
});
test('typed eating tracks actual receipt, wakes core, preserves restore and never creates a core agreement',async()=>{
 const {g,s,c}=await setup();await c.checkpoint('lab-concord-before-eat');const q=await ask(c);assert.equal((await c.answerCoreQuestion(q,{name:'eat',async answerCore(){return eat;}})).status,'delivered');assert.equal(g.calls,1);assert.equal(Object.keys(c.inspect().proposals).length,0);await assert.rejects(c.checkpoint('lab-concord-active-eat'));await assert.rejects(c.answerCoreQuestion(q,{name:'retry',async answerCore(){return eat;}}));
 g.data.actions[0]!.status='completed';g.data.actions[0]!.delivered=16;await c.reconcile();assert.equal(c.inspect().characters.A!.commitment,undefined);assert.equal((await c.corePerspective()).selfCare[0]!.consumed,16);assert(coreWakeSnapshot(await c.corePerspective()).some(w=>w.kind==='self-care'));assert(c.inspect().crew!.entries.some(e=>e.text==='eat: completed. Consumed 16 units.'));
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
