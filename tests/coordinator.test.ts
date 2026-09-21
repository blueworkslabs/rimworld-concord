import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Coordinator } from '../src/coordinator.js';
import { Store } from '../src/store.js';
import { scripted } from '../src/backends.js';
import type { GameBridge, GameState, ActionRequest, Receipt, DecisionBackend } from '../src/protocol.js';

class FakeGame implements GameBridge {
  data:GameState={world:'world',epoch:'epoch',loaded:true,ticks:0,paused:false,pawns:[
    {id:'A',name:'Ada',x:1,z:1,job:'Haul',health:1},
    {id:'B',name:'Bea',x:3,z:3,job:'Sleep',health:1}],actions:[]};
  moves=0;lostReply=false;validHash=true;saves=new Map<string,GameState>();
  async verify(_name:string,hash:string){if(!this.validHash || hash!=='hash')throw Error('Hash mismatch');}
  async state(){return structuredClone(this.data);}
  async move(r:ActionRequest):Promise<Receipt>{
    if(r.epoch!==this.data.epoch) throw Error('Stale');
    const old=this.data.actions.find(a=>a.id===r.id); if(old) return structuredClone(old);
    const a:Receipt={id:r.id,actor:r.actor,status:'started',reason:'moving',x:r.action.x,z:r.action.z};
    this.moves++;this.data.actions.push(a);
    if(this.lostReply){this.lostReply=false;throw Error('Lost response');}
    return structuredClone(a);
  }
  async save(name:string){this.saves.set(name,structuredClone(this.data));this.data.paused=true;return {sha256:'hash'};}
  async load(name:string){this.data=structuredClone(this.saves.get(name)!);this.data.epoch=randomUUID();this.data.paused=true;}
}
async function setup(){const game=new FakeGame(),store=new Store(':memory:'),c=new Coordinator(store,game);await c.open();return {game,store,c};}
const move={kind:'move' as const,x:8,z:9};
const accept=scripted({kind:'accept',reason:'I choose to help'});

test('core has no execution handle; pawn acceptance executes once; counterpart cannot decide',async()=>{
  const {c,game}=await setup();
  assert.deepEqual(Object.keys(c.core()),['propose']);
  const id=randomUUID();const p=await c.core().propose('A',move,'Help',id);
  await assert.rejects(c.pawn('B').decide(p.id,accept),/belong/);
  await c.pawn('A').decide(p.id,accept);
  await c.core().propose('A',move,'Help',id);await c.reconcile();
  await assert.rejects(c.pawn('A').decide(p.id,accept),/already decided/);
  assert.equal(game.moves,1);
});
test('refusal and counterproposal never dispatch a game job',async()=>{
  const {c,game}=await setup();
  for(const decision of [{kind:'refuse' as const,reason:'I promised to rest'}, {kind:'counter' as const,reason:'A different route',action:{...move,x:2}}]) {
    const p=await c.core().propose('A',move,'Help');await c.pawn('A').decide(p.id,scripted(decision));
  }
  assert.equal(game.moves,0);assert.equal(c.inspect().characters.A!.memories.length,2);
});
test('backend only sees own character/proposal and cannot inject actor or action',async()=>{
  const {c,game}=await setup();const p=await c.core().propose('A',move,'Help');
  await assert.rejects(c.pawn('A').decide(p.id,{name:'malicious',async decide(view){
    assert.deepEqual(Object.keys(view).sort(),['character','pawn','proposal']);
    assert.equal(JSON.stringify(view).includes('Bea'),false);
    return {kind:'accept',reason:'spoof',actor:'B'};
  }}));assert.equal(game.moves,0);
});
test('native interruptions are outcomes, not fictional success',async()=>{
  const {c,game}=await setup();const p=await c.core().propose('A',move,'Help');await c.pawn('A').decide(p.id,accept);
  const a=game.data.actions[0]!;a.status='interrupted';a.reason='Pawn downed';await c.reconcile();
  assert.equal(c.inspect().outcomes[a.id]!.status,'interrupted');assert.equal(c.inspect().characters.A!.commitment,undefined);
});
test('lost response reconciles existing action without duplicate execution',async()=>{
  const {c,game}=await setup();const p=await c.core().propose('A',move,'Help');game.lostReply=true;
  await assert.rejects(c.pawn('A').decide(p.id,accept),/Lost response/);await c.reconcile();assert.equal(game.moves,1);
});
test('timeout continues native behavior and clears deliberating indicator',async()=>{
  const {c,game}=await setup();const p=await c.core().propose('A',move,'Help');
  await assert.rejects(c.pawn('A').decide(p.id,{name:'offline',decide:()=>new Promise(()=>{})},20),/cancelled/);
  assert.equal(game.moves,0);assert.equal(game.data.pawns[0]!.job,'Haul');assert.deepEqual(c.activity(),[]);
});
test('checkpoint restores memories and invalidates an in-flight future decision',async()=>{
  const {c,game}=await setup();const p=await c.core().propose('A',move,'Help');await c.checkpoint('lab-concord-test');
  const f=await c.core().propose('B',move,'Future');
  let release!:(r:unknown)=>void;
  const running=c.pawn('B').decide(f.id,{name:'slow',decide:()=>new Promise(r=>release=r)});
  const rejected=assert.rejects(running,/cancelled|Stale/);
  while(!release) await new Promise(r=>setTimeout(r,1));
  await c.restore('lab-concord-test'); release({kind:'accept',reason:'Old future'});await rejected;
  assert.equal(c.inspect().proposals[f.id],undefined);assert.equal(game.moves,0);
  assert.equal(c.inspect().proposals[p.id]!.status,'pending');
});
test('external reload fails closed; paired save rejects active jobs and duplicate names',async()=>{
  const {c,game}=await setup();await c.checkpoint('lab-concord-unique');
  await assert.rejects(c.checkpoint('lab-concord-unique'),/already exists/);
  const p=await c.core().propose('A',move,'Help');await c.pawn('A').decide(p.id,accept);
  await assert.rejects(c.checkpoint('lab-concord-busy'),/active actions/);
  game.data.epoch='different';await assert.rejects(c.reconcile(),/Stale/);
});
test('database reopen preserves decisions without dispatching twice',async()=>{
  const {c,game,store}=await setup();const p=await c.core().propose('A',move,'Help');await c.pawn('A').decide(p.id,accept);
  const reopened=new Coordinator(store,game);await reopened.open();await reopened.reconcile();assert.equal(game.moves,1);
});

test('corrupt checkpoint is rejected before game load or memory mutation',async()=>{
  const {c,game}=await setup();await c.checkpoint('lab-concord-corrupt');const before=c.inspect();
  game.validHash=false;await assert.rejects(c.restore('lab-concord-corrupt'),/Hash/);
  assert.deepEqual(c.inspect(),before);assert.equal(game.data.epoch,'epoch');
});

test('native events are deduplicated, private and restored with their timeline cursor',async()=>{
 const {c,game,store}=await setup();
 game.data.events=[{seq:1,tick:30,pawn:'A',kind:'memory',detail:'Helped'}, {seq:2,tick:30,pawn:'B',kind:'mood',detail:'secret'}];game.data.eventSeq=2;
 await c.observe();await c.observe();
 assert.equal(c.inspect().characters.A!.experiences!.length,1);
 assert.equal(c.inspect().characters.A!.experiences![0]!.route,'deliberation');
 const p=await c.core().propose('A',move,'Help');
 await c.pawn('A').decide(p.id,{name:'private',async decide(view){assert(!JSON.stringify(view).includes('secret'));return {kind:'refuse',reason:'Rest'};}});
 await c.checkpoint('lab-concord-events');
 game.data.events.push({seq:3,tick:60,pawn:'A',kind:'job',detail:'Goto'});game.data.eventSeq=3;await c.observe();
 await c.restore('lab-concord-events');await c.observe();
 assert.equal(c.inspect().eventCursor,2);assert.equal(c.inspect().characters.A!.experiences!.length,1);
 game.data.events=[{seq:300,tick:90,pawn:'A',kind:'job',detail:'Wait'}];game.data.eventSeq=300;await c.observe();await c.observe();
 assert.equal(store.events().filter(e=>e.event.kind==='native-event-gap').length,1);
});
test('indicator has bounded lifetime and clears on refusal and inference timeout',async()=>{
 const {c,game}=await setup();const activities:{epoch:string;actor:string;activityId:string;ttlMs:number}[]=[];
 Object.assign(game,{setActivity:async(a:typeof activities[number])=>{activities.push(a);}});
 const p=await c.core().propose('A',move,'Think');
 await c.pawn('A').decide(p.id,scripted({kind:'refuse',reason:'No'}));
 assert(activities[0]!.ttlMs>0);assert.equal(activities[1]!.ttlMs,0);assert.equal(activities[0]!.activityId,activities[1]!.activityId);
 const q=await c.core().propose('A',move,'Again');
 await assert.rejects(c.pawn('A').decide(q.id,{name:'offline',decide:()=>new Promise(()=>{})},10));
 assert.equal(activities.at(-1)!.ttlMs,0);
 await assert.rejects(c.pawn('A').decide(q.id,accept,Infinity),/timeout/);
});

test('appraisal uses only the owner perspective, cannot downgrade significant events or command jobs',async()=>{
 const {c,game}=await setup();
 game.data.events=[{seq:1,tick:30,pawn:'A',kind:'mood',detail:'low'}, {seq:2,tick:30,pawn:'B',kind:'memory',detail:'private'}];game.data.eventSeq=2;
 const backend={name:'appraiser',async assess(view:unknown){assert(!JSON.stringify(view).includes('private'));return {reflectionScore:0.8};}};
 assert.equal((await c.appraise('A',1,backend,new AbortController().signal)).route,'deliberation');
 await assert.rejects(c.appraise('B',2,backend,new AbortController().signal),/eligible/);
 assert.equal(game.moves,0);
});
test('late appraisal cannot change a restored character',async()=>{
 const {c,game}=await setup();game.data.events=[{seq:1,tick:1,pawn:'A',kind:'mood',detail:'low'}];game.data.eventSeq=1;
 await c.observe();await c.checkpoint('lab-concord-appraisal');
 let release!:(v:unknown)=>void;
 const p=c.appraise('A',1,{name:'slow',assess:()=>new Promise(r=>release=r)},new AbortController().signal);
 const rejected=assert.rejects(p,/Stale/);
 while(!release)await new Promise(r=>setTimeout(r,1));
 await c.restore('lab-concord-appraisal');release({reflectionScore:1});await rejected;
 assert.equal(c.inspect().characters.A!.experiences![0]!.route,'appraisal');
});
