import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Coordinator } from '../src/coordinator.js';
import { Store } from '../src/store.js';
import { scripted } from '../src/backends.js';
import { coreView } from '../src/core-planner.js';
import { crewReport } from '../src/crew-log.js';
import { intentAction, type IntentView } from '../src/native-intents.js';
import type { GameBridge, GameState, ActionRequest, Receipt } from '../src/protocol.js';

const cfg={intentId:randomUUID(),area:{x:76,z:84,w:4,h:4},quota:30,maxTicks:30000,variant:'exclusive' as const};
const view=(o:Partial<IntentView>):IntentView=>({intentId:cfg.intentId,thingDef:'WoodLog',variant:cfg.variant,status:'open',zoneId:9,quota:30,delivered:0,reserved:0,remaining:30,
  overshoot:0,incidental:0,unattributed:0,removed:0,violations:0,rejectedStarts:0,finishedAfterExclusion:0,createdTick:0,untilTick:30000,lastDeliveryTick:-1,
  accepted:[],excluded:[],byPawn:[],drops:[],...o});
/** Mirrors the mod's intent ops closely enough for coordinator lifecycle checks. */
class IntentGame implements GameBridge {
  data:GameState={world:'w',epoch:'e',loaded:true,ticks:0,paused:false,actions:[],intents:[],pawns:[
    {id:'A',name:'Alvin',x:1,z:1,job:'Wait',health:1,haulingCapable:false},
    {id:'B',name:'Beatrice',x:2,z:2,job:'Wait',health:1,haulingCapable:true},
    {id:'P',name:'Pedro',x:3,z:3,job:'Wait',health:1,haulingCapable:true}]};
  ops:any[]=[];
  async state(){return structuredClone(this.data);}
  async move(_r:ActionRequest):Promise<Receipt>{throw Error('Native intents never issue ordered jobs');}
  async cancel():Promise<Receipt>{throw Error('Native intents never cancel ordered jobs');}
  async intent(payload:any){
    this.ops.push(payload);const list=this.data.intents!;let v=list.find(i=>i.intentId===payload.intentId);
    if(payload.op==='intent-exclude'){if(!v){v=view({status:'pending'});list.push(v);}if(!v.excluded.includes(payload.actor))v.excluded.push(payload.actor);v.accepted=v.accepted.filter(x=>x!==payload.actor);}
    if(payload.op==='intent-accept'){
      if(v?.excluded.includes(payload.actor))throw Error('Pawn is excluded; a change of mind is a new offer');
      if(!v){v=view({quota:payload.quota,remaining:payload.quota});list.push(v);}
      if(v.status==='pending'){v.status='open';v.quota=payload.quota;v.remaining=payload.quota;}
      if(!v.accepted.includes(payload.actor))v.accepted.push(payload.actor);
    }
    return {state:structuredClone(this.data),receipt:list};
  }
  async save(){return {sha256:'hash'};}async load(){}async verify(){}
}
async function setup(){const game=new IntentGame(),store=new Store(':memory:'),c=new Coordinator(store,game);await c.open();await c.initializeCore('Wood needs a home.');await c.configureNativeHaul(cfg);return {game,c,store};}
const say=(kind:'accept'|'refuse'|'defer',reason='because')=>scripted({kind,reason});

test('a pawn the game says cannot haul is not offered, with the reason visible',async()=>{
  const {c}=await setup();
  const v=await c.corePerspective();
  assert.ok(!v.opportunities.some(o=>o.pawn==='A'));
  assert.ok(v.availability.some(a=>a.pawn==='A'&&/cannot do hauling/.test(a.status)));
  assert.deepEqual(v.opportunities.filter(o=>o.action.kind==='haul-zone').map(o=>o.pawn).sort(),['B','P']);
  await assert.rejects(c.core().propose('A',intentAction(cfg),'Help stock wood'),/Not offered: cannot do hauling/);
  const report=crewReport(c.inspect(),0);
  assert.ok(report.entries.some(e=>e.text==='Alvin: not offered: cannot do hauling.'));
});

test('refusal binds in the game before the zone exists; acceptance opens it without an ordered job',async()=>{
  const {c,game}=await setup();
  const b=await c.core().propose('B',intentAction(cfg),'Stock wood');await c.pawn('B').decide(b.id,say('refuse','Not today'));
  const p=await c.core().propose('P',intentAction(cfg),'Stock wood');await c.pawn('P').decide(p.id,say('accept'));
  assert.deepEqual(game.ops.map(o=>[o.op,o.actor]),[['intent-exclude','B'],['intent-accept','P']]);
  const d=c.inspect();assert.equal(d.proposals[p.id]!.standing?.status,'running');assert.equal(d.characters.P!.commitment,undefined);
  assert.equal(game.data.intents![0]!.excluded[0],'B');
});

test('quota counters: adoptable before the first acceptance, recorded but not adoptable after',async()=>{
  const {c,game}=await setup();
  const b=await c.core().propose('B',intentAction(cfg),'Stock wood');
  await c.pawn('B').decide(b.id,scripted({kind:'counter',reason:'20 is plenty',action:intentAction(cfg,20)}));
  const revised=await c.core().revise(b.id,'Twenty then');assert.equal(revised.action.kind==='haul-zone'&&revised.action.quota,20);
  await c.pawn('B').decide(revised.id,say('accept'));assert.equal(game.data.intents![0]!.quota,20);
  const p=await c.core().propose('P',intentAction(cfg,20),'Stock wood');
  await assert.rejects(c.core().propose('P',intentAction(cfg,30),'More',randomUUID()),/./); // pawn already has an open offer
  await c.pawn('P').decide(p.id,scripted({kind:'counter',reason:'10 only',action:intentAction(cfg,10)}));
  await assert.rejects(c.core().revise(p.id,'Ten then'),/quota is fixed after the first acceptance/);
  assert.equal(game.data.intents![0]!.quota,20);
});

test('withdrawal excludes in the game; quota met completes the standing and the crew log says so',async()=>{
  const {c,game}=await setup();
  const b=await c.core().propose('B',intentAction(cfg),'Stock wood');await c.pawn('B').decide(b.id,say('accept'));
  const p=await c.core().propose('P',intentAction(cfg),'Stock wood');await c.pawn('P').decide(p.id,say('accept'));
  await c.pawn('B').withdraw('Tired of logs');
  assert.deepEqual(game.ops.at(-1),{op:'intent-exclude',epoch:c.inspect().epoch,intentId:cfg.intentId,actor:'B',reason:'withdraw'});
  const v=game.data.intents![0]!;Object.assign(v,{delivered:10,remaining:20,finishedAfterExclusion:1,byPawn:[{pawn:'B',count:10}],lastDeliveryTick:50});
  game.data.ticks=60;await c.reconcile();
  Object.assign(v,{status:'met',delivered:30,remaining:0,byPawn:[{pawn:'B',count:10},{pawn:'P',count:20}]});game.data.ticks=900;await c.reconcile();
  const d=c.inspect();assert.equal(d.proposals[p.id]!.standing?.status,'completed');assert.equal(d.proposals[b.id]!.standing?.status,'stopped');
  const text=crewReport(d,900).entries.map(e=>e.text);
  assert.ok(text.includes('Stockpile haul: first delivery, 10/30 wood (Beatrice 10).'));
  assert.ok(text.includes('Finished a trip started before withdrawing; credited to the carrier, not a new agreement.'));
  assert.ok(text.includes('Stockpile haul quota met: 30/30 wood (Beatrice 10, Pedro 20).'));
});

test('partial expiry stops the standing and keeps the topic open; no needs stop for native intents',async()=>{
  const {c,game}=await setup();
  const p=await c.core().propose('P',intentAction(cfg),'Stock wood');await c.pawn('P').decide(p.id,say('accept'));
  game.data.pawns[2]!.workReady=false;game.data.ticks=100;await c.reconcile();
  assert.equal(c.inspect().proposals[p.id]!.standing?.status,'running');
  Object.assign(game.data.intents![0]!,{status:'expired',delivered:20,byPawn:[{pawn:'P',count:20}]});await c.reconcile();
  const s=c.inspect().proposals[p.id]!.standing!;assert.equal(s.status,'stopped');assert.match(s.reason!,/expired at 20\/30; topic stays open/);
});

test('lost exclusion calls remain durable and reconcile without replaying consent',async()=>{
  for(const kind of ['refuse','defer','withdraw'] as const){
    const {c,game,store}=await setup();
    const p=await c.core().propose('P',intentAction(cfg),'Stock wood');
    if(kind==='withdraw')await c.pawn('P').decide(p.id,say('accept'));
    const actual=game.intent.bind(game);let fail=true;
    game.intent=async payload=>{if(payload.op==='intent-exclude'&&fail)throw Error('Mailbox unavailable');return actual(payload);};
    if(kind==='withdraw')await assert.rejects(c.pawn('P').withdraw('Stop'),/Mailbox unavailable/);
    else await assert.rejects(c.pawn('P').decide(p.id,say(kind)),/Mailbox unavailable/);
    assert.equal(Object.keys(c.inspect().pendingIntentExclusions??{}).length,1);
    // A different pawn's acceptance must not overtake the lost exclusion.
    const b=await c.core().propose('B',intentAction(cfg),'Stock wood');
    await c.pawn('B').decide(b.id,say('accept'));
    assert.equal(c.inspect().proposals[b.id]!.status,'accepted');
    assert.ok(c.inspect().pendingIntentAcceptances?.includes(b.id));
    assert.ok(!game.ops.some(o=>o.op==='intent-accept'&&o.actor==='B'));
    fail=false;const reopened=new Coordinator(store,game);await reopened.open();await reopened.reconcile();
    assert.ok(game.data.intents![0]!.excluded.includes('P'));
    assert.equal(Object.keys(reopened.inspect().pendingIntentExclusions??{}).length,0);
    assert.ok(game.data.intents![0]!.accepted.includes('B'));
    assert.deepEqual(reopened.inspect().pendingIntentAcceptances,[]);
  }
});

test('an applied acceptance with a lost reply is reconciled without inventing a stop or repeating acceptance',async()=>{
  const {c,game}=await setup();const actual=game.intent.bind(game);let failed=false;
  game.intent=async payload=>{const r=await actual(payload);if(payload.op==='intent-accept'&&!failed){failed=true;throw Error('Reply lost');}return r;};
  const p=await c.core().propose('P',intentAction(cfg),'Stock wood');await c.pawn('P').decide(p.id,say('accept'));
  assert.equal(c.inspect().proposals[p.id]!.standing?.status,'running');
  assert.ok(c.inspect().pendingIntentAcceptances?.includes(p.id));
  assert.ok(game.data.intents![0]!.accepted.includes('P'));
  await c.reconcile();assert.equal(game.ops.filter(o=>o.op==='intent-accept').length,1);
  assert.deepEqual(c.inspect().pendingIntentAcceptances,[]);
  assert.equal(c.inspect().proposals[p.id]!.standing?.status,'running');
});


test('another pawn meeting quota does not complete a withdrawn obligation',async()=>{
  const {c,game}=await setup();const p=await c.core().propose('P',intentAction(cfg),'Stock wood');
  await c.pawn('P').decide(p.id,say('accept'));await c.pawn('P').withdraw('No more');
  Object.assign(game.data.intents![0]!,{status:'met',delivered:30,byPawn:[{pawn:'B',count:30}]});await c.reconcile();
  const report=crewReport(c.inspect(),0),v=report.agreements.find(a=>a.pawn==='P')!.progress;
  assert.equal(v.completed,0);assert.equal(v.unfulfilled,1);assert.equal(v.status,'stopped');
});


test('an existing ordered offer cannot dispatch across an unconfirmed native withdrawal',async()=>{
  const {c,game}=await setup();
  const move=await c.core().propose('P',{kind:'move',x:4,z:4},'Move later');
  const native=await c.core().propose('P',intentAction(cfg),'Stock wood');
  await c.pawn('P').decide(native.id,say('accept'));
  const actual=game.intent.bind(game);let fail=true,moved=0;
  game.intent=async p=>{if(p.op==='intent-exclude'&&fail)throw Error('Mailbox unavailable');return actual(p);};
  game.move=async r=>{moved++;return {id:r.id,actor:r.actor,status:'completed',reason:'arrived',x:4,z:4};};
  await assert.rejects(c.pawn('P').withdraw('Stop'),/Mailbox unavailable/);
  await assert.rejects(c.pawn('P').decide(move.id,say('accept')),/Native exclusion unconfirmed/);
  assert.equal(c.inspect().proposals[move.id]!.status,'accepted');assert.equal(moved,0);
  fail=false;await c.reconcile();assert.equal(moved,1);
});
