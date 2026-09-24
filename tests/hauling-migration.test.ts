import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Coordinator } from '../src/coordinator.js';
import { Store } from '../src/store.js';
import { scripted } from '../src/backends.js';
import { coreView } from '../src/core-planner.js';
import { crewReport, recordCrew } from '../src/crew-log.js';
import { intentAction, orderedEntries, type IntentView, type NativeHaulEntry } from '../src/native-intents.js';
import type { GameBridge, GameState, ActionRequest, Receipt } from '../src/protocol.js';

const view=(o:Partial<IntentView>&{intentId:string}):IntentView=>({thingDef:'WoodLog',variant:'attribution',status:'open',zoneId:950,quota:30,delivered:0,reserved:0,remaining:30,
  overshoot:0,incidental:0,unattributed:0,removed:0,violations:0,rejectedStarts:0,finishedAfterExclusion:0,createdTick:0,untilTick:30000,lastDeliveryTick:-1,
  peakHolders:0,accepted:[],excluded:[],byPawn:[],drops:[],...o});
const rescue={kind:'rescue' as const,target:'X',bed:'bed',x:6,z:7,maxTicks:600};
/** Mirrors the mod's migration ops: stockpile list, per-(zone, def) intents, rescue views. */
class MigGame implements GameBridge {
  data:GameState={world:'w',epoch:'e',loaded:true,ticks:10,paused:false,actions:[],intents:[],clock:'Day 1, 6h (t10)',
    stockpiles:[{zoneId:950,label:'north wall pile',x:76,z:84,w:4,h:4,cells:16}],pawns:[
    {id:'A',name:'Alvin',x:1,z:1,job:'Wait',health:1,haulingCapable:false},
    {id:'B',name:'Beatrice',x:2,z:2,job:'Wait',health:1,haulingCapable:true,rescueReady:true},
    {id:'P',name:'Pedro',x:3,z:3,job:'Wait',health:1,haulingCapable:true,rescueReady:true}]};
  ops:any[]=[];moves:ActionRequest[]=[];excludeFails=0;
  async state(){return structuredClone(this.data);}
  async move(r:ActionRequest):Promise<Receipt>{this.moves.push(structuredClone(r));const a:Receipt={id:r.id,actor:r.actor,status:'started',reason:'native',x:r.action.x,z:r.action.z,kind:r.action.kind};
    if(!this.data.actions.some(x=>x.id===r.id))this.data.actions.push(a);return structuredClone(a);}
  async cancel():Promise<Receipt>{throw Error('Native intents never cancel ordered jobs');}
  async intent(payload:any){
    this.ops.push(payload);const list=this.data.intents!;let v=list.find(i=>i.intentId===payload.intentId);
    if(payload.op==='intent-exclude'){if(this.excludeFails>0){this.excludeFails--;throw Error('Mailbox unavailable');}
      if(!v){v=view({intentId:payload.intentId,status:'pending'});list.push(v);}if(!v.excluded.includes(payload.actor))v.excluded.push(payload.actor);v.accepted=v.accepted.filter(x=>x!==payload.actor);}
    if(payload.op==='intent-accept'){
      if(!v){v=view({intentId:payload.intentId,thingDef:payload.thing,quota:payload.quota,remaining:payload.quota,zoneId:payload.zoneId,hold:payload.hold,label:payload.label,thingLabel:payload.thing==='WoodLog'?'wood':'components'});list.push(v);}
      if(!v.accepted.includes(payload.actor))v.accepted.push(payload.actor);
    }
    if(payload.op==='intent-stop'&&v){v.status='stopped';v.reserved=0;}
    return {state:structuredClone(this.data),receipt:list};
  }
  async save(){return {sha256:'hash'};}async load(){}async verify(){}
}
const wood=(o:Partial<NativeHaulEntry>={})=>({intentId:randomUUID(),thing:'WoodLog',thingLabel:'wood',label:'shared wood pile by the north wall',zoneId:950,quota:30,maxTicks:30000,variant:'attribution',hold:'growing',...o});
const comps=(o:Partial<NativeHaulEntry>={})=>({intentId:randomUUID(),thing:'ComponentIndustrial',thingLabel:'components',label:'east shed',zoneId:-1,siteId:'east-site',x:90,z:84,w:3,h:3,quota:20,maxTicks:30000,variant:'attribution',hold:'strict',...o});
async function setup(entries:any[],intentOnly=false){const game=new MigGame(),c=new Coordinator(new Store(':memory:'),game);await c.open();await c.initializeCore('Keep the colony stocked.');const frozen=await c.configureNativeHauls(entries,{intentOnly});return {game,c,frozen};}
const say=(kind:'accept'|'refuse'|'defer',reason='because')=>scripted({kind,reason});

test('stockpile hauls come from existing stockpiles or candidate sites, frozen in a fixed order',async()=>{
  const w=wood(),k=comps();
  const {c,game,frozen}=await setup([w,k]);
  assert.deepEqual(frozen.map(e=>e.label),['east shed','shared wood pile by the north wall']);
  assert.deepEqual({x:frozen[1]!.x,z:frozen[1]!.z,w:frozen[1]!.w,h:frozen[1]!.h},{x:76,z:84,w:4,h:4},'existing stockpile rectangle comes from the game');
  await assert.rejects(c.configureNativeHauls([w,{...w,intentId:randomUUID()}]),/Duplicate|frozen/);
  const other=new Coordinator(new Store(':memory:'),game);await other.open();
  await assert.rejects(other.configureNativeHauls([wood({zoneId:4242})]),/Unknown stockpile/);
  await assert.rejects(other.configureNativeHauls([comps({w:9,h:8})]),/at most 64 cells/);
  const v=coreView(c.inspect(),game.data),mine=v.opportunities.filter(o=>o.pawn==='P').map(o=>o.action.kind==='haul-zone'?o.action.label:'');
  assert.deepEqual(mine,['east shed','shared wood pile by the north wall']);
  assert.ok(!v.opportunities.some(o=>o.pawn==='A'));assert.equal(v.clock,'Day 1, 6h (t10)');
  assert.deepEqual(orderedEntries([...frozen].reverse()),frozen);
});

test('ordinary play keeps other work; only ordered hauling is replaced; intent-only scenes admit nothing else',async()=>{
  const {c}=await setup([wood()]);
  await assert.rejects(c.core().propose('P',{kind:'haul',thing:'t',x:1,z:1,count:5,trips:1,maxTicks:600},'Old haul'),/replaces ordered hauling/);
  const p=await c.core().propose('P',{kind:'move',x:4,z:4},'Walk over');assert.equal(p.action.kind,'move');
  const only=await setup([wood()],true);
  await assert.rejects(only.c.core().propose('P',{kind:'move',x:4,z:4},'Walk over'),/only proposable work/);
  assert.match(coreView(only.c.inspect(),only.game.data).limits,/never an eligibility or consent disclaimer/);
});

test('the offer record says what is offered; helpers are labelled; retirement and archive use the frozen wording',async()=>{
  const e=wood();const {c,game}=await setup([e]);
  const b=await c.core().propose('B',intentAction(c.inspect().nativeHauls![0]!),'The wood by the wall is getting wet.');
  await c.pawn('B').decide(b.id,say('accept'));
  assert.deepEqual(game.ops.at(-1),{op:'intent-accept',epoch:'e',intentId:e.intentId,actor:'B',thing:'WoodLog',x:76,z:84,w:4,h:4,quota:30,maxTicks:30000,variant:'attribution',zoneId:950,label:e.label,hold:'growing'});
  const v=game.data.intents![0]!;
  Object.assign(v,{delivered:20,remaining:10,byPawn:[{pawn:'P',count:20}],lastDeliveryTick:40});game.data.ticks=50;await c.reconcile();
  Object.assign(v,{status:'met',delivered:30,remaining:0,byPawn:[{pawn:'P',count:20},{pawn:'B',count:10}],lastDeliveryTick:90,archiveOpen:true});game.data.ticks=100;await c.reconcile();
  Object.assign(v,{ordinaryByPawn:[{pawn:'P',count:25},{pawn:'B',count:20}]});game.data.ticks=200;await c.reconcile();
  Object.assign(v,{ordinaryByPawn:[{pawn:'P',count:26},{pawn:'B',count:20}]});game.data.ticks=300;await c.reconcile();
  const text=crewReport(c.inspect(),300).entries.map(e=>e.text);
  assert.ok(text.includes('Offer to Beatrice: haul up to 30 wood to the shared wood pile by the north wall; others may help.'));
  assert.ok(text.includes('Pedro is helping with the shared wood pile by the north wall (not asked).'));
  assert.ok(!text.some(t=>t.startsWith('Beatrice is helping')),'the accepting pawn is not a helper');
  assert.ok(text.includes('Agreement complete: 30 of 30 wood (Pedro 20, Beatrice 10). Further hauling here is ordinary work.'));
  assert.deepEqual(text.filter(t=>t.startsWith('Since then:')),['Since then: 46 wood as ordinary work (Pedro 26, Beatrice 20).'],'archive line updated in place');
});

test('expiry and zone edits use plain wording; nobody is blamed',async()=>{
  const {c,game}=await setup([wood(),comps()]);
  const [k,w]=c.inspect().nativeHauls!;
  for(const [pawn,e] of [['P',k!],['B',w!]] as const){const p=await c.core().propose(pawn,intentAction(e),'Needed soon.');await c.pawn(pawn).decide(p.id,say('accept'));}
  const [ik,iw]=[game.data.intents!.find(i=>i.intentId===k!.intentId)!,game.data.intents!.find(i=>i.intentId===w!.intentId)!];
  Object.assign(ik,{status:'expired',delivered:12,byPawn:[{pawn:'P',count:12}]});Object.assign(iw,{status:'stopped',stopReason:'zone no longer accepts wood'});
  await c.reconcile();const text=crewReport(c.inspect(),10).entries.map(e=>e.text);
  assert.ok(text.includes('Agreement expired at 12 of 20 components (Pedro 12); the topic stays open.'));
  assert.ok(text.includes('Agreement stopped (zone no longer accepts wood) at 0 of 30 wood (no deliveries).'));
});

test('a wait is silent in the log; the status line names what the core waits on',async()=>{
  const {c,game}=await setup([wood()]);
  const d=c.inspect(),s=d.coreState!;s.topics.push({sourceId:'brief',text:'Stock the wood pile',status:'open',proposalIds:[]});
  s.turns.push({id:'t1',status:'applied',choice:{topics:[],actionTopicId:null,action:{kind:'wait',reason:'Nothing new to offer.'}}});
  const r=crewReport(d,game.data.ticks);
  assert.match(r.observerText??'',/Core: waiting on Stock the wood pile/);
  assert.ok(!r.entries.some(e=>e.text==='Nothing new to offer.'));
});

test('rescue replacing a carrying native haul waits for confirmed exclusion and empty hands, then dispatches once',async()=>{
  const {c,game}=await setup([wood()]);const e=c.inspect().nativeHauls![0]!;
  const p=await c.core().propose('P',intentAction(e),'The wood by the wall is getting wet.');await c.pawn('P').decide(p.id,say('accept'));
  const pedro=game.data.pawns[2]!;Object.assign(pedro,{job:'HaulToCell',carrying:'Thing_WoodLog1',
    rescue:{epoch:'e',tick:10,mapId:1,status:'unavailable',options:[],observations:[]},
    rescueHandover:{epoch:'e',tick:10,mapId:1,status:'available',options:[rescue],observations:[]},
    casualties:{epoch:'e',tick:10,mapId:1,radius:12,observations:[{target:'X',name:'Xavi',x:3,z:3}],visibleSubjects:[{target:'X',downed:true,inBed:false}]}});
  game.data.eventSeq=1;game.data.events=[{seq:1,pawn:'P',tick:10,kind:'casualty',detail:'Locally down',subject:'X'}];
  await c.attend('P',{name:'ask',async reflect(){return {kind:'request_rescue',agreementId:p.id,target:'X',reason:'Xavi is down; can I help?'};}});
  const r=c.core().requests()[0]!;assert.ok(r,'request raised while carrying on a native haul');
  const offer=await c.core().offerRequestedRescue(r.id,rescue,'Xavi needs a bed.');assert.equal(offer.replacesAgreementId,p.id);
  game.excludeFails=2;await c.pawn('P').decide(offer.id,say('accept'));
  let h=Object.values(c.inspect().handovers!)[0]!;assert.equal(h.step,'excluding');assert.equal(game.moves.length,0,'no dispatch before exclusion is confirmed');
  await c.reconcile();h=Object.values(c.inspect().handovers!)[0]!;assert.equal(h.step,'draining');
  assert.ok(game.data.intents![0]!.excluded.includes('P'));assert.equal(game.moves.length,0,'still carrying: no dispatch');
  Object.assign(pedro,{job:'Wait',carrying:'',rescue:{epoch:'e',tick:10,mapId:1,status:'available',options:[rescue],observations:[]}});
  await c.reconcile();h=Object.values(c.inspect().handovers!)[0]!;
  assert.equal(h.step,'dispatched');assert.equal(game.moves.length,1);assert.equal(game.moves[0]!.id,h.dispatchId);
  await c.reconcile();assert.equal(game.moves.length,1,'one dispatch under the persisted id');
  assert.ok(crewReport(c.inspect(),10).entries.some(e=>e.text==="Pedro's carried trip finished; the rescue now starts."));
});

test('a handover that never drains stops at its deadline without retrying',async()=>{
  const {c,game}=await setup([wood()]);const e=c.inspect().nativeHauls![0]!;
  const p=await c.core().propose('P',intentAction(e),'Stock it.');await c.pawn('P').decide(p.id,say('accept'));
  const pedro=game.data.pawns[2]!;Object.assign(pedro,{job:'HaulToCell',carrying:'Thing_WoodLog1',rescueHandover:{epoch:'e',tick:10,mapId:1,status:'available',options:[rescue],observations:[]},
    casualties:{epoch:'e',tick:10,mapId:1,radius:12,observations:[{target:'X',name:'Xavi',x:3,z:3}],visibleSubjects:[{target:'X',downed:true,inBed:false}]}});
  game.data.eventSeq=1;game.data.events=[{seq:1,pawn:'P',tick:10,kind:'casualty',detail:'Locally down',subject:'X'}];
  await c.attend('P',{name:'ask',async reflect(){return {kind:'request_rescue',agreementId:p.id,target:'X',reason:'Xavi is down.'};}});
  const offer=await c.core().offerRequestedRescue(c.core().requests()[0]!.id,rescue,'Xavi needs a bed.');await c.pawn('P').decide(offer.id,say('accept'));
  game.data.ticks=10+rescue.maxTicks+1;await c.reconcile();
  const h=Object.values(c.inspect().handovers!)[0]!;assert.equal(h.step,'stopped');assert.equal(h.reason,'handover timed out');assert.equal(game.moves.length,0);
});


test('legacy native-only stores preserve their frozen permissions on open and paired restore',async()=>{
  const {c,game}=await setup([wood()]);
  const d=c.inspect(),e=d.nativeHauls![0]!;
  d.nativeHaul={intentId:e.intentId,area:{x:e.x!,z:e.z!,w:e.w!,h:e.h!},quota:e.quota,maxTicks:e.maxTicks,variant:e.variant};
  delete d.nativeHauls;delete d.nativeIntentOnly;
  const store=new Store(':memory:');store.commit(d,{branch:d.branch,kind:'legacy',actor:'operator',data:{}});
  store.checkpoint('lab-concord-legacy',d,'hash');
  const restored=new Coordinator(store,game);await restored.open();
  assert.equal(restored.inspect().nativeIntentOnly,true);
  await assert.rejects(restored.core().propose('P',{kind:'move',x:4,z:4},'Walk over'),/only proposable work/);
  assert.equal(store.read()!.nativeIntentOnly,true,'migration is durable');
  await restored.restore('lab-concord-legacy');
  assert.equal(restored.inspect().nativeIntentOnly,true);
  await assert.rejects(restored.core().propose('P',{kind:'move',x:4,z:4},'Walk over'),/only proposable work/);
  store.close();
});

test('handover dispatch intent is not published as a started rescue without a game receipt',async()=>{
  const {c}=await setup([wood()]);const d=c.inspect();
  const id=randomUUID(),actionId=randomUUID();
  d.proposals[id]={id,pawn:'P',action:rescue,reason:'Help Xavi',status:'accepted',actionId,
    standing:{status:'running',deadline:600,steps:[actionId]}} as any;
  d.handovers={[id]:{proposalId:id,oldId:'old',pawn:'P',intentId:'intent',step:'dispatched',deadline:600,dispatchId:actionId}};
  recordCrew(d,'handover-dispatching','P',d.handovers[id],10);
  assert.ok(!crewReport(d,10).entries.some(e=>e.text.includes('rescue now starts')));
  recordCrew(d,'action-outcome','P',{id:actionId,actor:'P',status:'failed',reason:'Unavailable',x:6,z:7},11);
  assert.ok(!crewReport(d,11).entries.some(e=>e.text.includes('rescue now starts')));
  // A separate admitted action has direct started evidence; replay is deduplicated.
  recordCrew(d,'action-outcome','P',{id:actionId,actor:'P',status:'started',reason:'native',x:6,z:7},12);
  recordCrew(d,'action-outcome','P',{id:actionId,actor:'P',status:'started',reason:'native',x:6,z:7},12);
  assert.equal(crewReport(d,12).entries.filter(e=>e.text.includes('rescue now starts')).length,1);
});

/** Up to the rescue offer that replaces Pedro's carrying native haul (the B7 setup above). */
async function handoverOffer(store=new Store(':memory:')){
  const game=new MigGame(),c=new Coordinator(store,game);await c.open();await c.initializeCore('Keep the colony stocked.');await c.configureNativeHauls([wood()]);
  const e=c.inspect().nativeHauls![0]!;
  const p=await c.core().propose('P',intentAction(e),'Stock it.');await c.pawn('P').decide(p.id,say('accept'));
  const pedro=game.data.pawns[2]!;Object.assign(pedro,{job:'HaulToCell',carrying:'Thing_WoodLog1',rescueHandover:{epoch:'e',tick:10,mapId:1,status:'available',options:[rescue],observations:[]},
    casualties:{epoch:'e',tick:10,mapId:1,radius:12,observations:[{target:'X',name:'Xavi',x:3,z:3}],visibleSubjects:[{target:'X',downed:true,inBed:false}]}});
  game.data.eventSeq=1;game.data.events=[{seq:1,pawn:'P',tick:10,kind:'casualty',detail:'Locally down',subject:'X'}];
  await c.attend('P',{name:'ask',async reflect(){return {kind:'request_rescue',agreementId:p.id,target:'X',reason:'Xavi is down.'};}});
  const offer=await c.core().offerRequestedRescue(c.core().requests()[0]!.id,rescue,'Xavi needs a bed.');
  return {game,c,store,old:p,offer,pedro};
}

test('the pending rescue is owned, conflict-visible and withdrawable while the carried trip drains',async()=>{
  const {game,c,old,offer,pedro}=await handoverOffer();await c.pawn('P').decide(offer.id,say('accept'));
  let d=c.inspect();assert.equal(Object.values(d.handovers!)[0]!.step,'draining');
  assert.equal(d.proposals[old.id]!.standing!.status,'stopped');
  assert.equal(d.characters.P!.intention,offer.id,'the pawn holds the pending rescue');
  assert.equal(d.proposals[offer.id]!.standing!.status,'running');assert.deepEqual(d.proposals[offer.id]!.standing!.steps,[]);
  assert.ok(!coreView(d,game.data).opportunities.some(o=>o.pawn==='P'),'no competing offer while the rescue is pending');
  await c.pawn('P').withdraw('Someone else is closer.');
  Object.assign(pedro,{job:'Wait',carrying:'',rescue:{epoch:'e',tick:10,mapId:1,status:'available',options:[rescue],observations:[]}});
  await c.reconcile();d=c.inspect();
  const h=Object.values(d.handovers!)[0]!;assert.equal(h.step,'stopped');assert.equal(game.moves.length,0,'a withdrawn rescue is never dispatched');
  assert.equal(d.characters.P!.intention,undefined);
});

test('a newer intention taken during draining is never overwritten by the handover dispatch',async()=>{
  const {game,c,offer,pedro}=await handoverOffer();await c.pawn('P').decide(offer.id,say('accept'));
  const d=c.inspect();d.characters.P!.intention='someone-else';   // ownership changed out of band
  Object.assign(pedro,{job:'Wait',carrying:'',rescue:{epoch:'e',tick:10,mapId:1,status:'available',options:[rescue],observations:[]}});
  // Revalidation reads the live domain; inspect() is a clone, so change it through the store round trip.
  const store=(c as any).store as Store;store.commit(d,{branch:d.branch,kind:'test-ownership',actor:'operator',data:{}});
  const again=new Coordinator(store,game);await again.open();await again.reconcile();
  assert.equal(Object.values(again.inspect().handovers!)[0]!.step,'stopped');assert.equal(game.moves.length,0);
  assert.equal(again.inspect().characters.P!.intention,'someone-else');
});

test('a restart between consent and withdrawal finishes stopping the old agreement',async()=>{
  const store=new Store(':memory:');const {game,c,old,offer,pedro}=await handoverOffer(store);
  const commit=store.commit.bind(store);let failNext=false;
  (store as any).commit=(d:any,meta:any)=>{const r=commit(d,meta);if(meta.kind==='handover-started')failNext=true;return r;};
  const state=game.state.bind(game);game.state=async()=>{if(failNext){failNext=false;throw Error('process restarted');}return state();};
  await c.pawn('P').decide(offer.id,say('accept')).catch(()=>{});
  (store as any).commit=commit;
  let d=store.read()!;assert.equal(d.proposals[old.id]!.standing!.status,'running','crashed before the old agreement was stopped');
  const restarted=new Coordinator(store,game);await restarted.open();await restarted.reconcile();
  d=restarted.inspect();
  assert.equal(d.proposals[old.id]!.standing!.status,'stopped');assert.equal(d.characters.P!.intention,offer.id);
  assert.ok(game.data.intents![0]!.excluded.includes('P'));assert.equal(Object.values(d.handovers!)[0]!.step,'draining');
  Object.assign(pedro,{job:'Wait',carrying:'',rescue:{epoch:'e',tick:10,mapId:1,status:'available',options:[rescue],observations:[]}});
  await restarted.reconcile();assert.equal(game.moves.length,1);
});

test('persistent exclusion failures do not keep a handover past its deadline',async()=>{
  const {game,c,offer}=await handoverOffer();game.excludeFails=1000;
  await c.pawn('P').decide(offer.id,say('accept')).catch(()=>{});
  game.data.ticks=10+rescue.maxTicks+1;
  await assert.rejects(c.reconcile(),/Mailbox unavailable/);
  const d=c.inspect(),h=Object.values(d.handovers!)[0]!;
  assert.equal(h.step,'stopped');assert.equal(h.reason,'handover timed out');assert.equal(game.moves.length,0);
  assert.equal(d.characters.P!.intention,undefined);
});

test('a haul already on its way at tag time gets one line and no credit',async()=>{
  const {c,game}=await setup([wood()]);const e=c.inspect().nativeHauls![0]!;
  const p=await c.core().propose('P',intentAction(e),'Stock it.');await c.pawn('P').decide(p.id,say('accept'));
  const v=game.data.intents![0]!;
  Object.assign(v,{preTagAtStart:[{job:7,pawn:'B',planned:30}],jobs:[{job:7,pawn:'B',hold:0,trip:0,preTag:true,planned:30}]});
  await c.reconcile();
  Object.assign(v,{preTagByPawn:[{pawn:'B',count:30}],drops:[{seq:1,tick:12,count:30,escape:0,job:7,kind:'pretag',pawn:'B',source:'',startedBeforeExclusion:false,violation:false}]});
  game.data.ticks=12;await c.reconcile();
  const r=crewReport(c.inspect(),12);
  assert.equal(r.entries.filter(x=>x.text==='Already on its way when the agreement started: 30 wood (Beatrice).').length,1);
  assert.ok(!r.entries.some(x=>/helping with/.test(x.text)),'pre-agreement work is neither credited nor a helper');
  assert.equal(c.inspect().intentViews![v.intentId]!.delivered,0);
});
