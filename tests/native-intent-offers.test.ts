import {legacyAction,legacyPawn} from '../trials/fixtures/legacy.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Coordinator } from '../src/coordinator.js';
import { Store } from '../src/store.js';
import { scripted } from '../src/backends.js';
import {coreAdmission,coreSchedulerDue,telemetryOnlyIdle,NATIVE_INTENT_STALL_TICKS,type CoreWake} from '../src/core-scheduler.js';
import {corePrompt} from '../src/core-planner.js';
import { coreView } from '../src/core-planner.js';
import {stopTrialWork,retireUndecided} from '../src/work-trial.js';
import {nativeSceneCrew,nativeOfferCoverage,assertNativeLedger,assertNativeRestore} from '../trials/native-haul-live.js';
import { crewReport } from '../src/crew-log.js';
import { intentAction, type IntentView } from '../src/native-intents.js';
import type { GameBridge, GameState, ActionRequest, Receipt, Action } from '../src/protocol.js';

const cfg={intentId:randomUUID(),area:{x:76,z:84,w:4,h:4},quota:30,maxTicks:30000,variant:'exclusive' as const};
const view=(o:Partial<IntentView>):IntentView=>({intentId:cfg.intentId,thingDef:'WoodLog',variant:cfg.variant,status:'open',zoneId:9,quota:30,delivered:0,reserved:0,remaining:30,
  overshoot:0,incidental:0,unattributed:0,removed:0,violations:0,rejectedStarts:0,finishedAfterExclusion:0,createdTick:0,untilTick:30000,lastDeliveryTick:-1,
  peakHolders:0,accepted:[],excluded:[],byPawn:[],drops:[],...o});
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
    if(payload.op==='intent-stop'&&v){v.status='stopped';v.reserved=0;v.remaining=v.quota-v.delivered;}
    return {state:structuredClone(this.data),receipt:list};
  }
  async save(){return {sha256:'hash'};}async load(){}async verify(){}
}
async function setup(configure=true){const game=new IntentGame(),store=new Store(':memory:'),c=new Coordinator(store,game);await c.open();await c.initializeCore('Wood needs a home.');if(configure)await c.configureNativeHaul(cfg);return {game,c,store};}
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
  assert.ok(text.includes('Agreement complete: 30 of 30 wood (Beatrice 10, Pedro 20). Further hauling here is ordinary work.'));
});

test('partial expiry stops the standing and keeps the topic open; no needs stop for native intents',async()=>{
  const {c,game}=await setup();
  const p=await c.core().propose('P',intentAction(cfg),'Stock wood');await c.pawn('P').decide(p.id,say('accept'));
  // Even a stale readiness flag in an old observation never stops native work.
  legacyPawn(game.data.pawns[2]!).workReady=false;game.data.ticks=100;await c.reconcile();
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
  // The ordered offer predates native mode, which now admits only the stockpile haul.
  const {c,game}=await setup(false);
  const move=await c.core().propose('P',{kind:'move',x:4,z:4},'Move later');
  await c.configureNativeHaul(cfg);
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


test('native mode never exposes or directly admits the retired ordered haul',async()=>{
  const {c,game}=await setup();
  const haul={kind:'haul' as const,thing:'Thing_WoodLog1',x:4,z:4,count:10,trips:1,maxTicks:1800};
  // An old observation still carrying a hauling view offers nothing: 'haul' is no longer an action.
  legacyPawn(game.data.pawns[0]!).hauling={epoch:'e',tick:0,mapId:0,status:'available',options:[haul],supplies:[{thing:haul.thing,label:'wood',x:4,z:4,sourceCount:30,destinationFree:75}]};
  assert.ok(!(await c.corePerspective()).opportunities.some(o=>(o.action.kind as string)==='haul'));
  await assert.rejects(c.core().propose('A',legacyAction(haul),'Old haul'));
  await assert.rejects(c.core().propose('P',{kind:'move',x:4,z:4},'Walk over'),/the stockpile haul is the only proposable work/);
  const perspective=await c.corePerspective();
  assert.ok(perspective.opportunities.every(o=>o.action.kind==='haul-zone'));
  assert.match(perspective.limits,/Only the listed shared stockpile hauls may be proposed/);
  assert.match(perspective.limits,/never an eligibility or consent disclaimer/);
  assert.ok(!perspective.limits.includes('Only listed campfire'));
  for(const action of [{kind:'rescue',target:'X',bed:'Y',x:4,z:4,maxTicks:900},{kind:'build',thing:'X',x:4,z:4,maxTicks:900},{kind:'cook',thing:'X',target:'Y',x:4,z:4,count:1,meals:1,maxTicks:900}] as Action[])
    await assert.rejects(c.core().propose('P',action,'Unlisted work'),/the stockpile haul is the only proposable work/);
});


test('uncertain native operator stop never manufactures a pawn withdrawal',async()=>{
 for(const applied of [false,true]){
  const {c,game}=await setup();const p=await c.core().propose('P',intentAction(cfg),'Stock wood');await c.pawn('P').decide(p.id,say('accept'));
  const original=game.intent.bind(game);let fail=true;
  game.intent=async payload=>{if(payload.op==='intent-stop'&&fail){if(applied)await original(payload);throw Error('Stop reply lost');}return original(payload);};
  const first=await stopTrialWork(c);assert(first.errors.some(e=>e.includes('Stop reply lost')));
  assert.equal(c.inspect().proposals[p.id]!.status,'accepted');
  assert(!game.ops.some(o=>o.op==='intent-exclude'));
  fail=false;const second=await stopTrialWork(c);assert.deepEqual(second.errors,[]);
  assert.equal(c.inspect().proposals[p.id]!.standing?.reason,'Intent stopped by the operator');
  assert.deepEqual(game.data.intents![0]!.accepted,['P']);assert.deepEqual(game.data.intents![0]!.excluded,[]);
 }
});

test('native rehearsal rejects missing crew or offers without requiring live acceptance',async()=>{
 const {c,game}=await setup();assert.deepEqual(nativeSceneCrew(game.data),{eligible:['P','B'],ineligible:'A'});
 const wrong=structuredClone(game.data);wrong.pawns[0]!.haulingCapable=true;assert.throws(()=>nativeSceneCrew(wrong),/ineligible/);
 wrong.pawns=wrong.pawns.filter(p=>p.id!=='B');assert.throws(()=>nativeSceneCrew(wrong),/missing/);
 assert.throws(()=>nativeOfferCoverage(c.inspect(),['P','B']),/coverage/);
 const p=await c.core().propose('P',intentAction(cfg),'Offer');await c.pawn('P').decide(p.id,say('refuse'));
 assert.throws(()=>nativeOfferCoverage(c.inspect(),['P','B']),/coverage/);
 const b=await c.core().propose('B',intentAction(cfg),'Offer');await c.pawn('B').decide(b.id,say('defer'));
 assert.doesNotThrow(()=>nativeOfferCoverage(c.inspect(),['P','B']));
});

test('native restore and polling validate actual game ledger rather than copied database state',async()=>{
 const {c,game}=await setup();const p=await c.core().propose('P',intentAction(cfg),'Offer');await c.pawn('P').decide(p.id,say('accept'));
 await c.reconcile();const saved=c.inspect();assert.doesNotThrow(()=>assertNativeRestore(game.data,saved));
 const lost=structuredClone(game.data);lost.intents=[];assert.throws(()=>assertNativeRestore(lost,saved),/GAME intents/);
 const changed=structuredClone(game.data);changed.intents![0]!.accepted=[];assert.throws(()=>assertNativeRestore(changed,saved),/GAME intents/);
 const escaped=structuredClone(game.data);escaped.intents![0]!.overshoot=1;assert.throws(()=>assertNativeLedger(escaped,cfg.intentId),/violation/);
});


test('ongoing core wakes on first native delivery and each quiet period, not every trip',async()=>{
 const {c,game}=await setup();await c.configureCoreSchedule({maxAttempts:null,cooldownTicks:300,windowTicks:null});
 const choose={name:'scripted',async plan(){return {topics:[],actionTopicId:null,action:{kind:'wait' as const,reason:'Observe receipts'}};}};
 assert.equal((await c.planCoreWhenDue(choose)).status,'applied');
 const p=await c.core().propose('B',intentAction(cfg),'Offer');await c.pawn('B').decide(p.id,say('accept'));
 const i=game.data.intents![0]!;Object.assign(i,{delivered:5,remaining:25,lastDeliveryTick:400,byPawn:[{pawn:'P',count:5}]});game.data.ticks=400;await c.reconcile();
 const v=await c.corePerspective(),records=corePrompt(v).perspective.currentRecords;
 assert.deepEqual(records.nativeIntents![0]!.byPawn,{P:5});assert.equal(records.nativeIntents![0]!.delivered,5);
 assert.equal((await c.planCoreWhenDue(choose)).status,'applied');
 Object.assign(i,{delivered:10,remaining:20,lastDeliveryTick:800,byPawn:[{pawn:'P',count:10}]});game.data.ticks=800;await c.reconcile();
 assert.equal((await c.planCoreWhenDue(choose)).status,'idle');
 game.data.ticks=800+NATIVE_INTENT_STALL_TICKS;assert.equal((await c.planCoreWhenDue(choose)).status,'applied');
 game.data.ticks+=400;assert.equal((await c.planCoreWhenDue(choose)).status,'idle');
 Object.assign(i,{delivered:15,remaining:15,lastDeliveryTick:game.data.ticks,byPawn:[{pawn:'P',count:15}]});await c.reconcile();assert.equal((await c.planCoreWhenDue(choose)).status,'idle');
 game.data.ticks+=NATIVE_INTENT_STALL_TICKS;assert.equal((await c.planCoreWhenDue(choose)).status,'applied');
 game.data.ticks+=400;Object.assign(i,{status:'met',delivered:30,remaining:0,byPawn:[{pawn:'P',count:30}]});await c.reconcile();assert.equal((await c.planCoreWhenDue(choose)).status,'applied');
 const admission=coreAdmission(c.inspect().coreState!.schedule!,await c.corePerspective());assert.equal(admission.ready,false);
});

test('a yes after the shared work closed is kept as said, starts nothing and is never agreed or withdrawn',async()=>{
  const {c,game}=await setup();
  const b=await c.core().propose('B',intentAction(cfg),'Stock wood');await c.pawn('B').decide(b.id,say('accept'));
  const p=await c.core().propose('P',intentAction(cfg),'Stock wood');
  // The quota is met while Pedro is still thinking; his answer then arrives.
  Object.assign(game.data.intents![0]!,{status:'met',delivered:30,byPawn:[{pawn:'P',count:20},{pawn:'B',count:10}],lastDeliveryTick:2510});
  const opsBefore=game.ops.length;
  const decided=await c.pawn('P').decide(p.id,say('accept','Happy to help'));
  assert.equal(decided.status,'lapsed');assert.deepEqual(decided.lapsed,{intentStatus:'met',answered:true});assert.equal(decided.decision?.kind,'accept');
  assert.equal(game.ops.length,opsBefore,'no intent operation for a lapsed answer');
  const d=c.inspect(),progress=crewReport(d,3000).agreements.find(a=>a.pawn==='P');
  assert.equal(progress,undefined,'a lapsed offer is not listed as an agreement');
  const core=coreView(d,game.data).agreements.find(a=>a.id===p.id)!;
  assert.equal(core.progress.agreed,0);assert.equal(core.progress.unfulfilled,0);assert.equal(core.progress.delivered,0);assert.equal(core.status,'lapsed');
  const text=crewReport(d,3000).entries.map(e=>e.text);
  assert.ok(text.includes('Pedro answered accept after the stockpile haul was already complete; no agreement started.'));
  assert.ok(!text.some(t=>/withdrawn/i.test(t)));
});

test('an unanswered offer lapses when the shared work closes; completion time comes from the receipt',async()=>{
  const {c,game}=await setup();
  const b=await c.core().propose('B',intentAction(cfg),'Stock wood');await c.pawn('B').decide(b.id,say('accept'));
  const p=await c.core().propose('P',intentAction(cfg),'Stock wood');
  Object.assign(game.data.intents![0]!,{status:'met',delivered:30,byPawn:[{pawn:'B',count:30}],lastDeliveryTick:2510});game.data.ticks=9000;await c.reconcile();
  const d=c.inspect();assert.equal(d.proposals[p.id]!.status,'lapsed');assert.deepEqual(d.proposals[p.id]!.lapsed,{intentStatus:'met',answered:false});
  assert.ok(crewReport(d,9000).entries.some(e=>e.text==='Offer to Pedro lapsed unanswered: the stockpile haul was already complete.'));
  const v=coreView(d,game.data),mine=v.agreements.find(a=>a.id===b.id)!;
  assert.equal(mine.progress.completedTick,2510);assert.equal(mine.progress.observedTick,9000);assert.ok(!('tick' in mine.progress));
  // A topic linking the completed agreement and the lapsed offer can still resolve.
  const closures=v.topicClosures.filter(t=>t.sourceId===b.id||t.sourceId===p.id);
  assert.deepEqual(closures.find(t=>t.sourceId===b.id)?.statuses,['resolved']);assert.deepEqual(closures.find(t=>t.sourceId===p.id)?.statuses,[]);
});


test('terminal offer survives active inference, then lapses after failure without withdrawal',async()=>{
 const {c,game,store}=await setup();
 const b=await c.core().propose('B',intentAction(cfg),'Stock wood');await c.pawn('B').decide(b.id,say('accept'));
 const p=await c.core().propose('P',intentAction(cfg),'Help');
 let started!:()=>void,reject!: (e:Error)=>void;
 const ready=new Promise<void>(r=>started=r);
 const deciding=c.pawn('P').decide(p.id,{name:'blocked',decide:async()=>{started();return await new Promise((_r,j)=>reject=j);}});
 const failed=assert.rejects(deciding,/offline/);await ready;
 Object.assign(game.data.intents![0]!,{status:'met',delivered:30,remaining:0,lastDeliveryTick:42});
 await c.reconcile();assert.equal(c.inspect().proposals[p.id]!.status,'pending');
 reject(Error('offline'));await failed;
 await retireUndecided(c,p.id,'Decision unavailable; no retry');
 assert.equal(c.inspect().proposals[p.id]!.status,'lapsed');
 assert.deepEqual(c.inspect().proposals[p.id]!.lapsed,{intentStatus:'met',answered:false});
 assert.equal(game.ops.filter(o=>o.actor==='P').length,0);
 const again=new Coordinator(store,game);await again.open();await again.reconcile();
 assert.equal(again.inspect().proposals[p.id]!.status,'lapsed');
 assert.ok(!crewReport(c.inspect(),100).entries.some(e=>e.text.includes('Pending offer withdrawn')));
});


test('telemetry-only wakes spend no core turn unless something is offerable or a band worsens to urgent (E2 replay)',()=>{
 // The E2 native-haul run's 14 core inputs, as exported (#74): offerable counts, non-telemetry
 // causes, and each crew member's shared Food/Rest bands. Replayed in order through the real
 // admission, carrying the consumed snapshot forward (silent wakes consume too).
 const e2:[number,number,boolean,string][]=[[90,2,true,'low satisfied|satisfied satisfied|satisfied satisfied'],[1577,1,true,'low satisfied|satisfied satisfied|satisfied satisfied'],
  [2759,0,true,'low satisfied|satisfied satisfied|low satisfied'],[5680,0,false,'low satisfied|low satisfied|low satisfied'],[8986,0,false,'urgent satisfied|low satisfied|low satisfied'],
  [14496,0,false,'urgent satisfied|low satisfied|urgent satisfied'],[16355,0,false,'satisfied satisfied|low satisfied|urgent satisfied'],[18211,0,false,'satisfied satisfied|urgent satisfied|urgent satisfied'],
  [20100,0,true,'satisfied satisfied|urgent satisfied|urgent satisfied'],[21242,0,true,'satisfied satisfied|satisfied satisfied|urgent satisfied'],[22740,0,true,'satisfied satisfied|satisfied satisfied|satisfied satisfied'],
  [24247,0,true,'satisfied satisfied|satisfied satisfied|satisfied satisfied'],[25943,0,true,'satisfied low|satisfied low|satisfied low'],[34935,0,false,'low low|satisfied low|satisfied low']];
 const schedule:any={config:{maxAttempts:null,cooldownTicks:60,windowTicks:null},startTick:0,endTick:null,attempts:0,consumed:{}};
 const silent:number[]=[];
 e2.forEach(([tick,offers,other,bands],i)=>{
  const sharedStatus=bands.split('|').map((b,k)=>{const [food,rest]=b.split(' ');return {pawn:'p'+k,food,rest};});
  const v:any={tick,brief:{id:'brief'},sharedStatus,selfCare:[],agreements:[],nativeIntents:[],requests:[],reoffers:[],questions:[],counters:[],
   opportunities:Array.from({length:offers},(_,k)=>({id:'o'+k})),messages:other?[{id:'m'+i,to:'core',from:'p0',text:'news'}]:[]};
  const a=coreAdmission(schedule,v);
  if(a.ready){schedule.attempts++;schedule.lastAttemptTick=tick;schedule.consumed=a.snapshot;}
  else if(a.silent){schedule.consumed=a.silent.snapshot;silent.push(i);}
  else assert.fail(`turn ${i} did not wake at all: ${a.reason}`);
 });
 assert.deepEqual(silent,[3,6,13],'turns 4, 5 and 7 (a band worsening to urgent) stay awake');
 const t=(value:string):CoreWake[]=>[{sourceId:'p0',kind:'telemetry',value}];
 const none={opportunities:[],counters:[]} as any;
 const band=(food:string,rest='satisfied')=>JSON.stringify({food,rest});
 assert.equal(telemetryOnlyIdle(t(band('urgent')),none,{'telemetry:p0':band('low')}),false,'low -> urgent wakes');
 assert.equal(telemetryOnlyIdle(t(band('satisfied','urgent')),none,{'telemetry:p0':band('satisfied','low')}),false,'rest reaching urgent wakes');
 assert.equal(telemetryOnlyIdle(t(band('urgent')),none,{}),false,'a first reading that is urgent wakes');
 assert.equal(telemetryOnlyIdle(t(band('urgent','low')),none,{'telemetry:p0':band('urgent')}),true,'still urgent, other band worsening short of urgent: silent');
 assert.equal(telemetryOnlyIdle(t(band('low')),none,{'telemetry:p0':band('urgent')}),true,'improving never wakes on its own');
 assert.equal(telemetryOnlyIdle(t(band('low')),none,{'telemetry:p0':band('satisfied')}),true,'worsening short of urgent stays silent');
 assert.equal(telemetryOnlyIdle(t(band('low')),{opportunities:[{id:'o'}],counters:[]} as any,{}),false,'an offer to make is a reason to think');
 assert.equal(telemetryOnlyIdle(t(band('low')),{opportunities:[],counters:[{id:'c'}]} as any,{}),false,'a counter to adopt is a reason to think');
 assert.equal(telemetryOnlyIdle([],none),false);
});

test('a silent telemetry wake consumes its bands without a turn, attempt or cooldown and shows the waiting status',async()=>{
 const {c,game,store}=await setup(false);await c.configureCoreSchedule({maxAttempts:null,cooldownTicks:300,windowTicks:null});
 let calls=0;const choose={name:'scripted',async plan(){calls++;return {topics:[],actionTopicId:null,action:calls===1?{kind:'ask' as const,pawn:'A',text:'What would help?',reason:'Ask'}:{kind:'wait' as const,reason:'Observe'}};}};
 const initial=await c.planCoreWhenDue(choose);assert.equal(initial.status,'applied');assert.equal(calls,1);
 if(initial.status!=='applied'||!initial.questionId)throw Error('missing initial question');
 const entriesBefore=crewReport(c.inspect(),0).entries;
 assert.doesNotMatch(crewReport(c.inspect(),0).observerText??'',/Core: waiting on/);
 const attempts=c.inspect().coreState!.schedule!.attempts;
 game.data.ticks=1000;game.data.pawns[1]!.linkStatus={source:'shared-link-telemetry',epoch:'e',tick:1000,food:'low',rest:'satisfied'};
 const due=coreSchedulerDue(c.inspect().coreState!.schedule!,await c.corePerspective());
 assert.equal(due,true,'ongoing driver must run silent bookkeeping, not just ready inference');
 const r=due?await c.planCoreWhenDue(choose):undefined;
 assert.deepEqual(r,{status:'idle',reason:'telemetry-only'});assert.equal(calls,1,'no backend call');
 const d=c.inspect();assert.equal(d.coreState!.schedule!.attempts,attempts,'no attempt spent');assert.equal(d.coreState!.schedule!.lastAttemptTick,0,'no cooldown started');
 assert.equal(d.coreState!.silentWake?.tick,1000);assert.ok(store.events().some(e=>e.event.kind==='core-wake-silent'));
 assert.match(crewReport(d,1000).observerText??'',/Core: waiting on/);
 assert.deepEqual(crewReport(d,1000).entries,entriesBefore,'nothing written to the crew log');
 const reopened=new Coordinator(store,game);await reopened.open();
 assert.deepEqual(reopened.inspect().coreState!.schedule,d.coreState!.schedule,'consumption and allowance persist');
 assert.deepEqual(reopened.inspect().coreState!.silentWake,d.coreState!.silentWake);
 assert.equal(coreSchedulerDue(reopened.inspect().coreState!.schedule!,await reopened.corePerspective()),false,'driver does not reschedule consumed silence');
 // The same bands do not wake it again; a message still does.
 game.data.ticks=1010;game.data.pawns[1]!.linkStatus={source:'shared-link-telemetry',epoch:'e',tick:1010,food:'low',rest:'satisfied'};
 assert.deepEqual(await reopened.planCoreWhenDue(choose),{status:'idle',reason:'no-new-event'});
 let answers=0;assert.equal((await reopened.answerCoreQuestion(initial.questionId,{name:'scripted',async answerCore(){answers++;return {choice:'say',text:'I am fine.'};}})).status,'delivered');assert.equal(answers,1);
 assert.equal((await reopened.planCoreWhenDue(choose)).status,'applied');assert.equal(calls,2,'message/answer wakes without a new offer');
 assert.equal(reopened.inspect().coreState!.silentWake,undefined);
 // With nothing offerable, a band worsening to urgent is the one telemetry change that wakes it alone.
 assert.equal((await reopened.corePerspective()).opportunities.length,0);
 game.data.ticks=1400;game.data.pawns[1]!.linkStatus={source:'shared-link-telemetry',epoch:'e',tick:1400,food:'urgent',rest:'satisfied'};
 assert.equal((await reopened.planCoreWhenDue(choose)).status,'applied');assert.equal(calls,3,'urgent wakes the core');
 game.data.ticks=1800;game.data.pawns[1]!.linkStatus={source:'shared-link-telemetry',epoch:'e',tick:1800,food:'low',rest:'satisfied'};
 assert.deepEqual(await reopened.planCoreWhenDue(choose),{status:'idle',reason:'telemetry-only'},'recovery does not wake it');
 game.data.ticks=1810;game.data.pawns[1]!.linkStatus={source:'shared-link-telemetry',epoch:'e',tick:1810,food:'low',rest:'low'};
 assert.deepEqual(await reopened.planCoreWhenDue(choose),{status:'idle',reason:'telemetry-only'},'worsening short of urgent stays silent');
 // A band change while something is offerable still wakes the core, and the turn clears the silent status.
 await reopened.configureNativeHaul(cfg);game.data.ticks=2200;game.data.pawns[1]!.linkStatus={source:'shared-link-telemetry',epoch:'e',tick:2200,food:'satisfied',rest:'low'};
 assert.equal((await reopened.planCoreWhenDue(choose)).status,'applied');assert.equal(calls,4);assert.equal(reopened.inspect().coreState!.silentWake,undefined);
});
