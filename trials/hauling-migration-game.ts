/** Scripted hauling-migration checks (docs/MIGRATION_HAULING.md, Gate B B1–B8). Zero model
 * calls: intent ops and authored answers only. Every case starts from the same base save;
 * raw events, final state and failures are retained per case. Checks that are not forced by
 * this runner are listed as unimplemented, never counted as passed. Round ledger: Astra. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {LabBridge} from '../src/lab-bridge.js';
import type {GameState,NativeEvent} from '../src/protocol.js';
import {IntentView,invariantFindings,intentAction,type NativeHaulEntry} from '../src/native-intents.js';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {scripted} from '../src/backends.js';
import {crewReport} from '../src/crew-log.js';
import {startNative} from './native-run.js';
if(process.env.CONCORD_HAULING_MIGRATION_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname;
const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
// Strict is the migration configuration (B1 2/2 used). Growing runs only as an explicit,
// experimental re-check; it cannot clear anything. --strict is accepted for old commands.
const hold=process.argv.includes('--experimental-growing')?'growing':'strict';
const deadline=Date.now()+2400000;
let opDeadline=deadline;const b=new LabBridge(undefined,()=>opDeadline);
type Case={name:string;passed:boolean;findings:string[];data:Record<string,unknown>};
const runId=randomUUID();
const receipt:{runId:string;hold:string;unimplemented:string[];observedOnly:Record<string,unknown>;needsRecordedEvidence:string[];fixture?:unknown;passed:boolean;inferenceCalls:0;cases:Case[];eventGaps:number;at:string;error?:string}=
  {runId,hold,unimplemented:[],
   // Not forceable on 4871 (the native check validates reservability first): tallied from every
   // case, never counted as passed. A hold left after such an end is a finding in that case.
   observedOnly:{'nested job end inside the pickup or duplicate check':[]},
   // Game cases this runner cannot observe: recorded by the operator, never counted as passed here.
   needsRecordedEvidence:['crew-log clock per event map across two maps (the fixture has one map) and the Show button','zone label/colour on screen while open and after retirement'],
   passed:false,inferenceCalls:0,cases:[],eventGaps:0,at:new Date().toISOString()};
let events:NativeEvent[]=[],lastSeq=0,state:GameState;
let safetyStopped=false,checking=false;
const persist=()=>writeFile(root+`/.runtime/hauling-migration-${hold}-${runId}.json`,JSON.stringify(receipt,null,2));
const DETECTORS=['intent-pickup-bound-violation','intent-ledger-violation','quota-escape','intent-retarget-unadmitted'];

async function poll(){
  state=await b.state();
  const fresh=(state.events??[]).filter(e=>e.seq>lastSeq);
  if(fresh.length&&fresh[0]!.seq>lastSeq+1&&lastSeq>0)receipt.eventGaps++;
  events.push(...fresh);if(fresh.length)lastSeq=fresh[fresh.length-1]!.seq;
  if(checking){
    const violations=[...fresh.filter(e=>DETECTORS.includes(e.kind)).map(e=>e.kind+': '+e.detail),
      ...(state.intents??[]).flatMap(i=>invariantFindings(IntentView.parse(i)))];
    if(violations.length){safetyStopped=true;throw Error('Safety stop: '+violations.join(' | '));}
  }
  return state;
}
const view=(id:string)=>{const v=(state.intents??[]).find(i=>i.intentId===id);return v?IntentView.parse(v):undefined;};
const pawn=(name:string)=>{const p=state.pawns.find(p=>p.name===name);if(!p)throw Error('No pawn '+name);return p;};
const op=async(payload:Record<string,unknown>&{op:any})=>{const r=await b.intent({epoch:state.epoch,...payload});state=r.state;return r.receipt as any;};
async function run(until:()=>boolean,ms:number,tick?:()=>Promise<void>){
  const end=Math.min(deadline,Date.now()+ms);await startNative(b);
  try{while(Date.now()<end){if(tick)await tick();await poll();if(until())return true;await delay(150);}return false;}
  finally{await b.admin('pause');await poll();}
}
const kinds=(k:string,who?:string)=>events.filter(e=>e.kind===k&&(!who||e.pawn===who));
/** One field of a native event detail (`a=1;b=2`). */
const field=(e:{detail:string}|undefined,k:string)=>e?new RegExp('(?:^|;)'+k+'=([^;]*)').exec(e.detail)?.[1]:undefined;
const jobOf=(id:string,job:number)=>view(id)?.jobs?.find(j=>j.job===job);
async function scenario(name:string,base:string,body:(c:Case)=>Promise<void>){
  if(safetyStopped||(only&&only!==name))return;
  const c:Case={name,passed:false,findings:[],data:{}};receipt.cases.push(c);const gapsBefore=receipt.eventGaps;
  try{
    checking=false;opDeadline=deadline;lastSeq=0;events=[];await b.load(base);await b.admin('pause');await poll();events=[];lastSeq=state.eventSeq??0;checking=true;
    await body(c);
    // Detectors, not mechanisms: any of these is a finding in every case.
    for(const k of DETECTORS)if(kinds(k).length&&!c.data.escapeExpected)c.findings.push(`${k}: ${kinds(k).map(e=>e.detail).join(' | ')}`);
    for(const e of kinds('intent-nested-end')){
      (receipt.observedOnly['nested job end inside the pickup or duplicate check'] as unknown[]).push({case:name,tick:e.tick,detail:e.detail});
      if(Number(field(e,'holdLeft'))>0)c.findings.push('hold left after a nested job end: '+e.detail);
    }
  }catch(e){c.findings.push('error: '+String(e));}
  finally{
    try{await b.admin('pause');await poll();}catch(e){safetyStopped=true;c.findings.push('final capture: '+String(e));}
    c.data.events=[...events];c.data.finalState=state;
    if(receipt.eventGaps>gapsBefore)c.findings.push('native event gap: evidence incomplete');
    checking=false;c.passed=c.findings.length===0;
    await persist();
  }
  console.error(`${c.passed?'PASS':'FAIL'} ${name} ${c.findings.join('; ')}`);
}
function expect(c:Case,ok:boolean,finding:string){if(!ok)c.findings.push(finding);}
function invariants(c:Case,id:string){const v=view(id);if(!v){c.findings.push('intent missing '+id);return undefined;}c.findings.push(...invariantFindings(v));(c.data.intents??={} as any)[id]=v;return v;}

try{
  const f=JSON.parse(await readFile(root+'/.runtime/hauling-migration-fixture.json','utf8'));receipt.fixture=f;
  const m=f.manifest,zoneId=m.zone.id as number;
  await b.load(f.save);await b.admin('pause');await poll();
  // Quiet base: no job in flight at tag time. Round 1's base carried Beatrice's running wood haul
  // (pre-agreement work for every case), which starved contention and pre-tag supply.
  const quiet:unknown[]=[];for(const p of state!.pawns)quiet.push({pawn:p.name,...await op({op:'lab-interrupt',actor:p.id,reason:'idle'})});
  receipt.fixture={...f,quietBase:quiet};
  const base='lab-concord-hm-base-'+Date.now();await b.save(base);
  const P=pawn('Pedro').id,B=pawn('Beatrice').id;
  const stacks=(def:string)=>m.stacks.filter((s:any)=>s.def===def);
  const accept=async(intentId:string,actor:string,o:Record<string,unknown>={})=>{
    for(let attempt=0;;attempt++){
      try{return await op({op:'intent-accept',intentId,actor,thing:'WoodLog',zoneId,label:m.zone.label,quota:30,maxTicks:30000,variant:'attribution',hold,...o});}
      catch(e){
        // The mod refuses a tag in the tick a matching job started; the next tick is unambiguous.
        if(attempt>=3||!/next game tick/.test(String(e)))throw e;
        const t0=state.ticks;await run(()=>state.ticks>t0,10000);
      }
    }
  };
  const site=(o:Record<string,unknown>={})=>({zoneId:-1,siteId:m.site.id,label:m.site.label,x:m.site.x,z:m.site.z,w:m.site.w,h:m.site.h,...o});
  const loose=async(def:string,actor?:string)=>((await op({op:'lab-loose',thing:def,actor})).stacks as {thing:string;x:number;z:number;count:number;forbidden:boolean;reachable?:boolean;reservable?:boolean;haulable?:boolean}[]);
  /** Pedro's current job has finished collecting: its hold equals the cargo, and its latest
   * pickup-phase receipt is a pickup (no duplicate selection pending). */
  const settled=(id:string)=>{
    const who=pawn('Pedro'),carried=who.carryingCount??0,job=who.jobId??-1;const j=jobOf(id,job);
    const last=events.filter(e=>(e.kind==='intent-pickup'||e.kind==='intent-duplicate-admitted')&&Number(field(e,'job'))===job).pop();
    return who.job==='HaulToCell'&&carried>0&&!!j&&j.hold===carried&&(hold==='strict'||last?.kind==='intent-pickup');
  };
  const exclude=(intentId:string,actor:string,reason:string)=>op({op:'intent-exclude',intentId,actor,reason});
  const done=(id:string)=>()=>{const v=view(id);return !!v&&v.status!=='open';};
  const maxStack=(def:string)=>Math.max(...stacks(def).map((s:any)=>s.count));

  // --- B1: growing hold (or strict when --strict), zero escapes throughout.
  await scenario('duplicate-within-budget',base,async c=>{
    const id=randomUUID();await accept(id,P,{quota:30});await run(done(id),300000);
    const v=invariants(c,id);if(!v)return;
    // One trip is one job: placement callbacks of the same job are summed.
    const byJob=new Map<number,number>();for(const d of v.drops.filter(d=>d.kind==='participation'))byJob.set(d.job,(byJob.get(d.job)??0)+d.count);
    const trips=[...byJob.values()];c.data.trips=trips;
    expect(c,v.status==='met'&&v.delivered===30,`expected 30 met, got ${v.delivered} ${v.status}`);
    // A trip above the largest single stack can only come from a native duplicate pickup.
    c.data.duplicateObserved=trips.some(n=>n>maxStack('WoodLog'));
    if(hold==='growing'&&m.duplicatePairs.some((p:string[])=>p[0]!.startsWith('WoodLog')))expect(c,!!c.data.duplicateObserved,'no duplicate pickup observed with duplicate geometry (growing hold)');
    if(hold==='strict')expect(c,!c.data.duplicateObserved,'strict hold admitted a multi-stack trip');
  });
  await scenario('zero-extra',base,async c=>{
    // The quota equals the first stack: no extra can be admitted; no jump, no zero-count pickup.
    const id=randomUUID(),first=stacks('WoodLog')[0].count;await accept(id,P,{quota:first});await run(done(id),240000);
    const v=invariants(c,id);if(!v)return;
    expect(c,v.status==='met'&&v.delivered===first,`expected ${first} met, got ${v.delivered} ${v.status}`);
    expect(c,!kinds('intent-pickup-skipped',P).some(e=>e.detail.includes(';carried=0;')),'a pickup was skipped with nothing carried');
  });
  for(const [label,to] of [['source-grows',20],['source-shrinks',3]] as const)await scenario(label,base,async c=>{
    // Initial hold 10 / trip budget 30: the source changes while the pawn walks to it.
    const small=stacks('WoodLog').find((s:any)=>s.count<=10);
    if(!small){c.findings.push('precondition: the frozen manifest needs a wood stack of at most 10');return;}
    const id=randomUUID();await accept(id,P,{quota:30});
    const admitted=()=>kinds('intent-admitted-start',P).find(e=>e.detail.includes(';source=Thing_'+small.id)||e.detail.includes(';source='+small.id));
    if(!await run(()=>!!admitted(),120000)){c.findings.push('precondition: no tagged trip from the prepared 10-stack');return;}
    const job=Number(field(admitted(),'job'));const pickups=()=>kinds('intent-pickup',P).filter(e=>Number(field(e,'job'))===job);
    if(pickups().length||(pawn('Pedro').carryingCount??0)>0){c.findings.push('precondition: pickup occurred before source mutation');return;}
    const hold0=Number(field(admitted(),'reserved'));c.data.initialHold=hold0;c.data.job=job;
    await op({op:'lab-stack-set',intentId:id,thing:admitted()!.detail.split(';source=')[1],count:to});
    await run(()=>pickups().length>0||done(id)(),60000);
    // The guarded first pickup of this job, from its own receipt (later growth is legitimate).
    const first=pickups()[0];c.data.firstPickup=first?.detail;
    const acquired=Number(field(first,'acquired')),cap=Number(field(first,'cap'));
    expect(c,!!first,'no pickup receipt for the admitted job');
    expect(c,acquired>0&&acquired<=hold0&&acquired<=cap,`first pickup ${acquired} (cap ${cap}) exceeded the initial hold ${hold0}`);
    if(to<hold0)expect(c,acquired<=to,`first pickup ${acquired} exceeded the shrunken source ${to}`);
    await run(done(id),240000);invariants(c,id);
  });
  await scenario('withdraw-after-duplicate-selection',base,async c=>{
    // Exclude while carrying: the carried trip may finish, but nothing more is collected.
    const id=randomUUID();await accept(id,P,{quota:30});
    // The duplicate guard's receipt is the selection proof: the game jumped to a second stack.
    const selected=()=>kinds('intent-duplicate-admitted',P).find(e=>field(e,'pickedNow')==='False' && Number(field(e,'job'))===pawn('Pedro').jobId && (jobOf(id,Number(field(e,'job')))?.hold??0)>(pawn('Pedro').carryingCount??0));
    if(!await run(()=>!!selected(),120000)){c.findings.push('precondition: no duplicate selection receipt (geometry)');return;}
    const job=Number(field(selected(),'job'));c.data.selection=selected()!.detail;
    const exclusionTick=state.ticks;
    const atExclusion=pawn('Pedro').carryingCount??0;await exclude(id,P,'withdraw');
    await run(()=>pawn('Pedro').job!=='HaulToCell',60000);
    const v=invariants(c,id);if(!v)return;
    const later=kinds('intent-pickup',P).filter(e=>Number(field(e,'job'))===job&&e.tick>=exclusionTick&&Number(field(e,'acquired'))>0);
    expect(c,later.length===0,`the selected duplicate was still collected after withdrawal: ${later.map(e=>e.detail).join(' | ')}`);
    const after=v.drops.filter(d=>d.kind==='participation'&&d.pawn===P&&d.tick>exclusionTick);
    expect(c,after.length>0&&after.every(d=>d.startedBeforeExclusion),'participation after withdrawal not flagged');
    expect(c,after.reduce((n,d)=>n+d.count,0)<=atExclusion,`gathered more after withdrawal: ${after.reduce((n,d)=>n+d.count,0)} > ${atExclusion}`);
    c.data.atExclusion=atExclusion;
  });
  await scenario('two-pawns-last-units',base,async c=>{
    // Both accept before the first tick of the quiet base: neither has a trip in flight.
    const id=randomUUID();await accept(id,P,{quota:25});await accept(id,B,{quota:25});
    expect(c,!kinds('intent-pretag-marked').length,'a trip was already in flight at tag time');
    await run(done(id),300000);
    const v=invariants(c,id);if(!v)return;
    expect(c,v.peakHolders>=2,'no overlapping reservation holders: contention not exercised');
    expect(c,v.status==='met'&&v.delivered===25&&v.overshoot===0,`credited ${v.delivered}, overshoot ${v.overshoot}`);c.data.byPawn=v.byPawn;c.data.peakHolders=v.peakHolders;
  });
  await scenario('carried-cargo-plus-source',base,async c=>{
    const id=randomUUID();await accept(id,P,{quota:30});
    c.data.carry=await op({op:'lab-carry',intentId:id,actor:P,count:5});
    // Started as the game starts a job for a pawn already carrying (keepCarryingThing): a queued
    // start drops the cargo first (JobDef.dropThingBeforeJob), which round 1 observed.
    c.data.started=await op({op:'lab-start-haul',intentId:id,actor:P});
    const initial=(c.data.carry as {carried?:number}).carried??0,job=(c.data.started as {job?:number}).job;
    const completed=await run(done(id),240000),v=invariants(c,id);
    const admitted=kinds('intent-admitted-start',P).find(e=>Number(field(e,'job'))===job&&Number(field(e,'carried'))===initial);
    expect(c,initial===5&&(c.data.started as {started?:boolean}).started===true&&(c.data.started as {carried?:number}).carried===initial&&!!admitted,'positive cargo and linked job admission were not established');
    expect(c,!!v&&completed&&v.status==='met'&&v.delivered===30,'carried-cargo scenario did not complete 30 units');
    const deliveredByJob=v?v.drops.filter(d=>d.kind==='participation'&&d.job===job&&d.pawn===P).reduce((n,d)=>n+d.count,0):0;c.data.deliveredByJob=deliveredByJob;
    // Growing: the pickup guard's receipts give the exact extra; strict has no guard receipts.
    const extra=hold==='growing'?kinds('intent-pickup',P).filter(e=>Number(field(e,'job'))===job).reduce((n,e)=>n+Number(field(e,'acquired')),0):deliveredByJob-initial;c.data.extraPicked=extra;
    expect(c,extra>0&&deliveredByJob===initial+extra,`job ${job} delivered ${deliveredByJob}; cargo ${initial} plus picked ${extra}`);
  });
  await scenario('save-load-mid-growth',base,async c=>{
    const id=randomUUID();await accept(id,P,{quota:30});
    // Mid-growth, per job: Pedro's own job holds more than he carries (an admitted extra is pending).
    const mine=()=>view(id)?.jobs?.find(j=>j.pawn===P&&!j.preTag);
    const growing=()=>{const j=mine(),carried=pawn('Pedro').carryingCount??0;return view(id)?.status==='open'&&!!j&&carried>0&&j.hold>carried;};
    const reached=await run(growing,120000);c.data.midGrowthReached=reached;
    if(!reached&&hold==='growing'){c.findings.push('precondition: no pending extra observed for this job (geometry)');return;}
    const before=view(id)!,job=mine(),name='lab-concord-hm-mid-'+Date.now();c.data.jobBefore=job;
    await b.save(name);c.data.eventsBeforeLoad=[...events];events=[];lastSeq=0;await b.load(name);await b.admin('pause');await poll();
    const after=view(id),jobAfter=job?jobOf(id,job.job):undefined;c.data.jobAfter=jobAfter;
    expect(c,!!after&&after.delivered===before.delivered&&after.quota===before.quota&&after.reserved===before.reserved,'intent changed across save/load');
    if(job)expect(c,!!jobAfter&&jobAfter.hold===job.hold&&jobAfter.trip===job.trip&&jobAfter.pawn===job.pawn,`job ${job.job} hold/budget changed across save/load: ${JSON.stringify(job)} -> ${JSON.stringify(jobAfter)}`);
    await run(done(id),240000);invariants(c,id);
  });

  // --- Retargets through the game's own placement path (Toils_Haul.PlaceHauledThingInCell): the
  // target cell keeps room for one unit and every other pile cell is occupied, so the direct drop
  // places one and the game searches storage for the remainder (patch 1 decides, patch 2 moves the
  // hold). Filling the target outright fails the carry toil instead: the job ends, no retarget.
  // On 4871 this is the only SetTarget(B) of a haul, and it runs after collection, so no extra is
  // pending there; each case asserts the hold before the move equals the cargo.
  const retargetTrip=async(c:Case,a:string,second:string,destinationQuota:number)=>{
    if(!m.site){c.findings.push('precondition: the manifest needs a candidate site');return undefined;}
    // Beatrice refuses: helpers must not put wood in the pile before the setup.
    await accept(a,P,{quota:30});await exclude(a,B,'refuse');
    await accept(second,P,site({quota:destinationQuota}));await exclude(second,B,'refuse');
    c.data.initialTrip=await op({op:'lab-start-haul',intentId:a,actor:P});
    if(!(c.data.initialTrip as {started:boolean}).started){c.findings.push('initial trip to the first pile was not started');return undefined;}
    if(!await run(()=>settled(a),120000)){c.findings.push('precondition: no tagged trip finished collecting');return undefined;}
    if(view(second)?.status!=='open'||view(second)?.delivered!==0||view(second)?.reserved!==0){c.findings.push('destination was consumed before the retarget');return undefined;}
    return {job:pawn('Pedro').jobId!,carried:pawn('Pedro').carryingCount??0};
  };
  const tripEnd=(job:number)=>kinds('job-end',P).find(e=>Number(field(e,'job'))===job);
  const placedBy=(v:IntentView,job:number)=>v.drops.filter(d=>d.job===job&&d.kind==='participation').reduce((n,d)=>n+d.count,0);
  await scenario('retarget-between-tagged-zones',base,async c=>{
    const a=randomUUID(),second=randomUUID();const trip=await retargetTrip(c,a,second,30);if(!trip)return;
    if(trip.carried<2){c.findings.push(`precondition: carried ${trip.carried}, need at least 2`);return;}
    c.data.setup=await op({op:'lab-target-room',intentId:a,actor:P,count:1,reason:'Steel'});
    if(!await run(()=>!!tripEnd(trip.job),120000)){c.findings.push(`no job-end receipt for trip ${trip.job}`);return;}
    const va=invariants(c,a),vb=invariants(c,second);if(!va||!vb)return;
    const moved=kinds('intent-retarget',P).find(e=>Number(field(e,'job'))===trip.job&&field(e,'to')===second);
    c.data.retarget=moved?.detail;c.data.ended=tripEnd(trip.job)!.detail;
    const rest=Number(field(moved,'carried')),inA=placedBy(va,trip.job),inB=placedBy(vb,trip.job);c.data.placed={first:inA,second:inB};
    expect(c,!!moved&&field(moved,'from')===a&&field(moved,'mode')==='ToCellStorage','no native storage retarget from the first pile to the second');
    expect(c,!!moved&&Number(field(moved,'holdBefore'))===rest,`hold before the retarget ${field(moved,'holdBefore')} differs from the cargo ${rest}`);
    expect(c,inA===1&&inB===rest&&rest>0&&trip.carried===inA+inB,`placed ${inA} in the first pile and ${inB} in the second; ${rest} carried at the retarget, room 1`);
    expect(c,(va.byPawn.find(x=>x.pawn===P)?.count??0)===inA&&(vb.byPawn.find(x=>x.pawn===P)?.count??0)===inB,'credit does not follow placement');
    expect(c,!(va.jobs??[]).some(j=>j.job===trip.job)&&!(vb.jobs??[]).some(j=>j.job===trip.job),'a hold outlived the trip');
  });
  await scenario('retarget-insufficient-destination-quota',base,async c=>{
    const a=randomUUID(),second=randomUUID();const trip=await retargetTrip(c,a,second,1);if(!trip)return;
    if(trip.carried<3){c.findings.push(`precondition: carried ${trip.carried}, need at least 3`);return;}
    // The second pile can take fewer units than the remainder: the whole load or nothing.
    const before=await op({op:'lab-loose',thing:'WoodLog',actor:P});
    c.data.setup=await op({op:'lab-target-room',intentId:a,actor:P,count:1,reason:'Steel'});
    if(!await run(()=>!!tripEnd(trip.job),120000)){c.findings.push(`no job-end receipt for trip ${trip.job}`);return;}
    const va=invariants(c,a),vb=invariants(c,second);if(!va||!vb)return;
    const moves=kinds('intent-retarget',P).filter(e=>Number(field(e,'job'))===trip.job);c.data.retargets=moves.map(e=>e.detail);c.data.ended=tripEnd(trip.job)!.detail;
    const aside=moves.find(e=>field(e,'from')===a&&field(e,'to')==='');
    expect(c,!moves.some(e=>field(e,'to')===second),'the remainder was retargeted into a pile that could not take it whole');
    expect(c,!!aside,`expected a native retarget outside tagged storage (mode at SetTarget precedes the game's mode update), got ${moves.map(e=>e.detail).join(' | ')||'no retarget'}`);
    expect(c,placedBy(va,trip.job)===1&&placedBy(vb,trip.job)===0&&vb.overshoot===0,`placed ${placedBy(va,trip.job)} in the first pile, ${placedBy(vb,trip.job)} in the second`);
    expect(c,!(va.jobs??[]).some(j=>j.job===trip.job)&&!(vb.jobs??[]).some(j=>j.job===trip.job),'a hold outlived the trip');
    const after=await op({op:'lab-loose',thing:'WoodLog',actor:P});c.data.conservation={before,after};
    expect(c,Number(field(aside,'carried'))+1===trip.carried,'retarget remainder differs from initial cargo');
    expect(c,after.spawned+after.carried===before.spawned+before.carried+(c.data.setup as {spawned:number}).spawned,'wood lost or created during the aside trip');
    expect(c,field(tripEnd(trip.job),'condition')==='Succeeded','captured aside trip did not succeed');
  });
  // The reachable neighbour of a pending-extra retarget: the destination stops being valid storage
  // while Pedro walks to an admitted duplicate. The game fails the job (JobDriver_HaulToCell's goto
  // fail condition); the pending extra must be released uncollected. Growing only: strict never
  // holds an extra.
  if(hold==='growing')await scenario('pending-extra-destination-lost',base,async c=>{
    const a=randomUUID();await accept(a,P,{quota:30});await exclude(a,B,'refuse');
    const pending=()=>kinds('intent-duplicate-admitted',P).find(e=>field(e,'pickedNow')==='False'&&Number(field(e,'job'))===pawn('Pedro').jobId&&(jobOf(a,Number(field(e,'job')))?.hold??0)>(pawn('Pedro').carryingCount??0));
    if(!await run(()=>!!pending(),120000)){c.findings.push('precondition: no pending duplicate selection (geometry)');return;}
    const job=Number(field(pending(),'job')),fillTick=state.ticks;c.data.pending=pending()!.detail;c.data.holdAtFill=jobOf(a,job);
    c.data.fill=await op({op:'lab-zone-fill',intentId:a,thing:'Steel'});
    if(!await run(()=>!!tripEnd(job),120000)){c.findings.push(`no job-end receipt for trip ${job}`);return;}
    const v=invariants(c,a);if(!v)return;c.data.ended=tripEnd(job)!.detail;
    const later=kinds('intent-pickup',P).filter(e=>Number(field(e,'job'))===job&&e.tick>=fillTick&&Number(field(e,'acquired'))>0);
    expect(c,!/Succeeded/.test(tripEnd(job)!.detail),'the trip succeeded although its destination was lost');
    expect(c,later.length===0,`the pending extra was collected after the destination was lost: ${later.map(e=>e.detail).join(' | ')}`);
    expect(c,!v.drops.some(d=>d.job===job&&d.kind==='participation'&&d.tick>=fillTick),'a placement was credited after the destination was lost');
    expect(c,!(v.jobs??[]).some(j=>j.job===job)&&v.reserved===0,'the pending hold was not released');
    expect(c,!kinds('intent-retarget',P).some(e=>Number(field(e,'job'))===job),'unexpected retarget of the failed trip');
  });

  // --- B3: (map, zone, def): independent balances; a refusing pawn stores a third def freely.
  await scenario('mixed-zone-independent',base,async c=>{
    const w=randomUUID(),k=randomUUID();
    const third=m.zone.allow.find((d:string)=>d!=='WoodLog'&&d!=='ComponentIndustrial');
    if(!third||!stacks(third).length){c.findings.push('precondition: the manifest needs loose stacks of a third allowed def');return;}
    const count=async(def:string)=>Number((await op({op:'lab-zone-count',zoneId,thing:def})).count);
    const thirdBefore=await count(third);
    await accept(w,P,{quota:20});await accept(k,B,{thing:'ComponentIndustrial',quota:10});await exclude(w,B,'refuse');
    // Round 1 and the strict run left this to chance: Pedro took all the steel after his wood,
    // Beatrice chose ordinary components and wood. So, while her wood refusal binds (the wood
    // intent open, before any tick): the patched native storage search for Beatrice admits the
    // third def to this pile and refuses wood (Pedro's wood search is the control); then her
    // third-def trip starts from the native factory's job and must store here.
    const probe=async(who:string,def:string)=>await op({op:'lab-store-probe',actor:who,thing:def}) as {found:boolean;zoneId:number;thing:string};
    const probes={thirdForRefuser:await probe(B,third),woodForRefuser:await probe(B,'WoodLog'),woodForPedro:await probe(P,'WoodLog')};c.data.probes=probes;
    expect(c,probes.thirdForRefuser.found&&probes.thirdForRefuser.zoneId===zoneId,`the refuser's ${third} search did not find the pile: ${JSON.stringify(probes.thirdForRefuser)}`);
    expect(c,probes.woodForRefuser.zoneId!==zoneId,`the refuser's wood search found the tagged pile: ${JSON.stringify(probes.woodForRefuser)}`);
    expect(c,probes.woodForPedro.found&&probes.woodForPedro.zoneId===zoneId,`control failed: Pedro's wood search did not find the pile: ${JSON.stringify(probes.woodForPedro)}`);
    expect(c,view(w)?.status==='open'&&!!view(w)?.excluded.includes(B),'the wood refusal was not binding at the third-def trip');
    const started=await op({op:'lab-haul-to-storage',actor:B,thing:third}) as {job:number;started:boolean;zoneId:number;jobDef:string};c.data.thirdTrip=started;
    const thirdEnd=()=>kinds('job-end',B).find(e=>Number(field(e,'job'))===started.job);
    await run(()=>done(w)()&&done(k)()&&!!thirdEnd(),360000);
    const vw=invariants(c,w),vk=invariants(c,k);if(!vw||!vk)return;
    expect(c,vw.status==='met'&&vw.delivered===20&&vk.status==='met'&&vk.delivered===10,'both item quotas must complete');
    const thirdStart=kinds('job-start',B).find(e=>Number(field(e,'job'))===started.job);
    const thirdAfter=await count(third);c.data.third={def:third,before:thirdBefore,after:thirdAfter,start:thirdStart?.detail,end:thirdEnd()?.detail};
    expect(c,started.started&&started.jobDef==='HaulToCell'&&started.zoneId===zoneId&&field(thirdStart,'def')===third&&!field(thirdStart,'intent'),`the refuser's ${third} trip did not start untagged into the pile: ${JSON.stringify(started)} ${thirdStart?.detail??''}`);
    expect(c,/Succeeded/.test(thirdEnd()?.detail??'')&&thirdAfter>thirdBefore,`the wood refuser did not store ${third}: ${thirdEnd()?.detail??'no job-end'}, zone ${thirdBefore} -> ${thirdAfter}`);
    expect(c,vw.byPawn.every(p=>p.pawn!==B),'refusing pawn credited on wood');
    expect(c,vk.drops.every(d=>d.kind!=='incidental'||d.source!=='haul'),'component intent recorded wood or steel');
    const zoneStock=(state.stockpiles??[]).find(z=>z.zoneId===zoneId);c.data.zone=zoneStock;
  });

  // --- Fable's pre-tag rule: a haul already running toward the pile when the tag lands is
  // pre-agreement work: never credited, never counted against the quota, never trimmed.
  await scenario('pretag-running-haul',base,async c=>{
    // Ordinary hauling into the mixed pile runs untagged first; tag when Beatrice carries wood toward it.
    const onWay=()=>{const e=kinds('job-start',B).filter(e=>field(e,'def')==='WoodLog'&&!field(e,'intent')).pop();
      return !!e&&pawn('Beatrice').job==='HaulToCell'&&(pawn('Beatrice').carryingCount??0)>0?Number(field(e,'job')):undefined;};
    if(!await run(()=>onWay()!==undefined,120000)){c.findings.push('precondition: no ordinary wood trip under way before tagging');return;}
    const job=onWay()!,carried=pawn('Beatrice').carryingCount??0,id=randomUUID();
    await accept(id,P,{quota:10});await exclude(id,B,'refuse');await poll();
    const marked=kinds('intent-pretag-marked',B).find(e=>Number(field(e,'job'))===job);c.data.marked=marked?.detail;
    if(!marked){c.findings.push(`precondition: Beatrice's trip ${job} was not heading into the pile at tag time`);return;}
    // Phase 1: the captured trip ends (any condition, from its own receipt).
    const ended=()=>kinds('job-end',B).find(e=>Number(field(e,'job'))===job);
    if(!await run(()=>!!ended(),120000)){c.findings.push(`no job-end receipt for the captured trip ${job} within the window (Beatrice's job now ${pawn('Beatrice').job} ${pawn('Beatrice').jobId})`);return;}
    c.data.capturedEnd=ended()!.detail;
    // Phase 2 needs post-tag supply Pedro can haul now; otherwise the quota cannot be required.
    const supply=(await loose('WoodLog',P)).filter(s=>!s.forbidden&&s.haulable);c.data.supplyAfterCapture=supply;
    const units=supply.reduce((n,s)=>n+s.count,0);
    const current=view(id)!,remaining=Math.max(0,10-current.delivered-current.reserved);
    c.data.remainingUnreserved=remaining;
    if(units<remaining){c.findings.push(`precondition: ${units} wood haulable by Pedro after the captured trip, ${remaining} still unreserved`);return;}
    await run(()=>done(id)()&&!(view(id)?.jobs??[]).some(j=>j.preTag),240000);
    const v=invariants(c,id);if(!v)return;
    const before=(v.preTagByPawn??[]).find(p=>p.pawn===B)?.count??0;c.data.before=before;c.data.carriedAtTag=carried;
    const placed=v.drops.filter(d=>d.job===job&&d.kind==='pretag').reduce((n,d)=>n+d.count,0);
    const allBefore=v.drops.filter(d=>d.pawn===B&&d.kind==='pretag').reduce((n,d)=>n+d.count,0);
    expect(c,placed>=carried&&before===allBefore,`pre-tag job placed ${placed}, carried ${carried}, before bucket ${before}, raw total ${allBefore} (trimmed, lost or miscounted)`);
    expect(c,!v.byPawn.some(p=>p.pawn===B)&&v.drops.every(d=>d.job!==job||d.kind==='pretag'),'pre-tag work was credited');
    expect(c,v.status==='met'&&v.delivered===10&&v.overshoot===0,`quota after pre-tag work: ${v.delivered} ${v.status}, overshoot ${v.overshoot}`);
    expect(c,(v.preTagAtStart??[]).some(j=>j.job===job&&j.pawn===B),'pre-tag job not reported at acceptance');
  });

  // --- B4: after retirement, placements are ordinary work; credit never changes.
  await scenario('archive-after-retirement',base,async c=>{
    const id=randomUUID();await accept(id,P,{quota:10});await run(done(id),180000);
    const at=view(id)!;expect(c,at.status==='met'&&at.delivered===10,'initial quota did not complete');await run(()=>((view(id)?.ordinaryByPawn??[]).reduce((n,p)=>n+p.count,0))>0,180000);
    const v=view(id);if(!v){c.findings.push('intent missing');return;}
    expect(c,v.delivered===at.delivered,'credit changed after retirement');
    expect(c,(v.ordinaryByPawn??[]).length>0,'no ordinary work counted after retirement');c.data.archive={ordinary:v.ordinaryByPawn,unattributed:v.ordinaryUnattributed};
  });

  // --- B2: zone edits stop the agreement plainly; re-tagging closes the archive.
  await scenario('zone-edits',base,async c=>{
    const id=randomUUID();await accept(id,P,{quota:30});
    await op({op:'lab-zone-disallow',intentId:id});await run(done(id),10000);
    const v=view(id);expect(c,v?.status==='stopped'&&/no longer accepts/.test(v.stopReason??''),`expected a plain stop, got ${v?.status} ${v?.stopReason}`);
    const label=(state.stockpiles??[]).find(z=>z.zoneId===zoneId)?.label;expect(c,label===m.zone.label,`zone label not restored: ${label}`);
  });
  await scenario('retag-new-generation',base,async c=>{
    const a=randomUUID();await accept(a,P,{quota:5});await run(done(a),120000);
    const b2=randomUUID();await accept(b2,P,{quota:5});
    expect(c,view(a)?.archiveOpen===false,'re-tag left the previous archive open');
    expect(c,view(b2)?.status==='open','re-tag did not open a new generation');
  });

  // --- B7 in the game: a carrying native agreement replaced by a rescue. Separate fixture save
  // (fixture script with `rescue`): the patient is anesthetized, Doctor is 0 for everyone.
  // Authored answers only: Pedro asks, the core offers the requested rescue, Pedro accepts.
  let rescueBase:string|undefined;
  if(f.rescueSave&&m.rescue&&(!only||only==='rescue-handover-in-game')){
    await b.load(f.rescueSave);await b.admin('pause');await poll();
    for(const p of state!.pawns)await op({op:'lab-interrupt',actor:p.id,reason:'idle'});
    rescueBase='lab-concord-hm-rescue-base-'+Date.now();await b.save(rescueBase);
  }
  await scenario('rescue-handover-in-game',rescueBase??base,async c=>{
    if(!rescueBase){c.findings.push('precondition: no rescue fixture save (run the fixture script with `rescue`, set rescueSave)');return;}
    const target=m.rescue.target as string;
    if(!state.pawns.find(x=>x.id===target)?.downed){c.findings.push('precondition: the fixture patient is not downed');return;}
    const s=new Store(root+`/.runtime/hauling-migration-rescue-${runId}.db`),co=new Coordinator(s,b);
    try{
      await co.open();await co.initializeCore('Scripted core for the rescue handover; every answer is authored.');
      const [e]=await co.configureNativeHauls([{intentId:randomUUID(),thing:'WoodLog',thingLabel:'wood',label:m.zone.label,zoneId,quota:30,maxTicks:30000,variant:'attribution',hold}],{experimentalGrowing:hold==='growing'});
      const haul=await co.core().propose(P,intentAction(e!),'The wood by the wall is getting wet.');
      await co.pawn(P).decide(haul.id,scripted({kind:'accept',reason:'Authored acceptance'}));
      // Pedro carries on a tagged trip and has seen the patient.
      const saw=()=>events.some(x=>x.pawn===P&&x.kind==='casualty'&&x.subject===target);
      const carrying=()=>pawn('Pedro').job==='HaulToCell'&&(pawn('Pedro').carryingCount??0)>0;
      if(!await run(()=>saw()&&carrying(),180000,()=>co.reconcile().then(()=>{}))){c.findings.push(`precondition: no carrying tagged trip with a sighting of the patient (sighted ${saw()}, carrying ${carrying()})`);return;}
      const tripJob=pawn('Pedro').jobId!,cargo=pawn('Pedro').carryingCount??0;c.data.trip={job:tripJob,cargo};
      await co.attend(P,{name:'scripted',async reflect(){return {kind:'request_rescue',agreementId:haul.id,target,reason:'Someone is down near the pile; can I help?'};}});
      const request=co.core().requests().find(r=>r.pawn===P&&r.agreementId===haul.id&&r.status==='pending');
      if(!request){c.findings.push('the carrying pawn could not raise a rescue request');return;}
      await poll();const option=pawn('Pedro').rescueHandover?.options?.find(o=>o.target===target);c.data.option=option;
      if(!option){c.findings.push('no rescue option in the handover projection while carrying');return;}
      const offer=await co.core().offerRequestedRescue(request.id,option,'They need a bed.');
      await co.pawn(P).decide(offer.id,scripted({kind:'accept',reason:'Authored acceptance'}));
      const h=()=>Object.values(co.inspect().handovers??{}).find(x=>x.proposalId===offer.id);
      const outcome=()=>{const id=h()?.dispatchId;return id?co.inspect().outcomes[id]:undefined;};
      await run(()=>h()?.step==='stopped'||(!!outcome()&&outcome()!.status!=='started'),240000,()=>co.reconcile().then(()=>{}));
      await co.reconcile();await poll();
      const handover=h();c.data.handover=handover;c.data.outcome=outcome();
      const steps=s.events().map(x=>x.event).filter(x=>['replacement-consented','handover-started','handover-owned','intention-stopped','handover-excluded','handover-dispatching','handover-stopped'].includes(x.kind)).map(x=>x.kind);c.data.steps=steps;
      const tripEnd=kinds('job-end',P).find(x=>Number(field(x,'job'))===tripJob);c.data.tripEnd=tripEnd;
      const dispatched=(state.actions??[]).filter(a=>a.id===handover?.dispatchId);
      const rescueStart=events.find(x=>x.pawn===P&&x.kind==='job-start'&&!/HaulToCell/.test(x.detail)&&x.tick>=(tripEnd?.tick??Infinity)&&/Rescue|Concord/i.test(x.detail));
      expect(c,handover?.step==='dispatched','handover did not reach dispatch: '+JSON.stringify(handover));
      expect(c,steps.indexOf('handover-excluded')>steps.indexOf('replacement-consented')&&steps.indexOf('handover-dispatching')>steps.indexOf('handover-excluded')&&steps.filter(k=>k==='handover-dispatching').length===1,'handover steps out of order or repeated: '+steps.join(' > '));
      expect(c,!!view(e!.intentId)?.excluded.includes(P),'Pedro is not excluded from the wood agreement in the game');
      expect(c,!!tripEnd&&(!rescueStart||rescueStart.tick>=tripEnd.tick),'the rescue started before the carried trip ended');
      expect(c,dispatched.length===1,`expected one rescue action under the persisted id, got ${dispatched.length}`);
      expect(c,outcome()?.status==='completed'&&pawn(state.pawns.find(x=>x.id===target)!.name).currentBed===option.bed,`rescue ${outcome()?.status??'missing'}; patient bed ${state.pawns.find(x=>x.id===target)?.currentBed}`);
      const v=invariants(c,e!.intentId);
      if(v)expect(c,v.drops.filter(d=>d.job===tripJob&&d.kind==='participation').every(d=>d.pawn===P),'the carried trip was credited to someone else');
      const text=crewReport(co.inspect(),state.ticks).entries.map(x=>x.text);c.data.crew=text;
      expect(c,text.some(t=>/rescue now starts/.test(t)),'no crew record of the rescue starting');
    }finally{s.close();}
  });

  // --- B6: presentation while open, restored after retirement; offer record via the coordinator.
  await scenario('legibility',base,async c=>{
    const s=new Store(root+`/.runtime/hauling-migration-${runId}.db`),co=new Coordinator(s,b);
    try{
      await co.open();await co.initializeCore('Scripted core for the hauling migration; every answer is authored.');
      const entry:Partial<NativeHaulEntry>={intentId:randomUUID(),thing:'WoodLog',thingLabel:'wood',label:m.zone.label,zoneId,quota:20,maxTicks:30000,variant:'attribution',hold};
      const [e]=await co.configureNativeHauls([entry],{experimentalGrowing:hold==='growing'});
      const offer=await co.core().propose(B,intentAction(e!),'The wood by the wall is getting wet.');
      await co.pawn(B).decide(offer.id,scripted({kind:'accept',reason:'Authored acceptance'}));await poll();
      const open=(state.stockpiles??[]).find(z=>z.zoneId===zoneId)?.label??'';c.data.openLabel=open;
      expect(c,open.startsWith('Shared: '),`zone label while open: ${open}`);
      await run(()=>co.inspect().proposals[offer.id]?.standing?.status!=='running',300000,()=>co.reconcile());await co.reconcile();
      const closed=(state.stockpiles??[]).find(z=>z.zoneId===zoneId)?.label??'';expect(c,closed===m.zone.label,`zone label after retirement: ${closed}`);
      const text=crewReport(co.inspect(),state.ticks).entries.map(x=>x.text);c.data.crew=text;
      expect(c,text.includes(`Offer to Beatrice: haul up to 20 wood to the ${m.zone.label}; others may help.`),'offer record missing');
      expect(c,text.some(t=>t.startsWith('Agreement complete: 20 of 20 wood')),'completion record missing');
      invariants(c,e!.intentId);
    }finally{s.close();}
  });

  // --- B8 matched pair, per frozen def and quota (manifest `matched`): the ordered model on the
  // same save and stockpile, native Hauling off (as the ordered model always ran), the scripted
  // core offering every grounded haul of that def; then the native half with the same quota.
  const matched:{def:string;quota:number}[]=m.matched??[];
  if(!matched.some(x=>x.def==='WoodLog')||!matched.some(x=>x.def!=='WoodLog'))
    await scenario('matched-precondition',base,async c=>{c.findings.push('precondition: the manifest must freeze a wood and a small-stack-def matched quota');});
  for(const {def,quota} of matched){
    await scenario('matched-ordered-'+def,base,async c=>{
      const s=new Store(root+`/.runtime/hauling-migration-ordered-${def}-${runId}.db`),co=new Coordinator(s,b);
      try{
        await co.open();await co.initializeCore('Scripted core for the ordered baseline; every answer is authored.');
        for(const p of state.pawns)await op({op:'lab-work-priority',actor:p.id,count:0});
        const z=(state.stockpiles??[]).find(x=>x.zoneId===zoneId)!,start=state.ticks;
        const inZone=(x:number,zz:number)=>x>=z.x&&x<z.x+z.w&&zz>=z.z&&zz<z.z+z.h;
        // The ordered model sees a 13x13 square around the pawn: an option needs the source and a
        // stockpile cell both within 6 cells (Chebyshev). Stacks farther than 12 from the pile are
        // out of its reach whatever the core does; they are labelled, not counted against parity.
        const nearest=(x:number,zz:number)=>({x:Math.min(Math.max(x,z.x),z.x+z.w-1),z:Math.min(Math.max(zz,z.z),z.z+z.h-1)});
        const gap=(x:number,zz:number)=>{const n=nearest(x,zz);return Math.max(Math.abs(n.x-x),Math.abs(n.z-zz));};
        const supplyAt=async(who:string)=>(await loose(def,who)).filter(t=>!t.forbidden&&t.reachable);
        const initial=await supplyAt(P);
        const reachable=initial.filter(t=>gap(t.x,t.z)<=12),outOfReach=initial.filter(t=>gap(t.x,t.z)>12);
        const zoneBefore=Number((await op({op:'lab-zone-count',zoneId,thing:def})).count);
        c.data.orderedSupply={reachable:reachable.reduce((n,t)=>n+t.count,0),outOfReach:outOfReach.map(t=>({x:t.x,z:t.z,count:t.count}))};
        if(reachable.reduce((n,t)=>n+t.count,0)<quota){c.findings.push(`precondition: the ordered model can reach ${reachable.reduce((n,t)=>n+t.count,0)} ${def}, quota ${quota}; unmatched by fixture`);return;}
        const ours=new Set<string>(),hauls=new Set<string>();let offers=0,moves=0,idleSince=-1,stop='';
        const tries=new Map<string,number>();
        const outcomes=()=>Object.values(co.inspect().outcomes);
        const track=()=>{for(const p of Object.values(co.inspect().proposals))if(hauls.has(p.id))for(const step of p.standing?.steps??[])ours.add(step);};
        const delivered=()=>outcomes().filter(r=>r.kind==='haul'&&ours.has(r.id)&&r.status==='completed').reduce((n,r)=>n+(r.delivered??0),0);
        /** Units still coming from running ordered agreements: planned minus completed steps. */
        const inFlight=()=>Object.values(co.inspect().proposals).filter(p=>hauls.has(p.id)&&p.standing?.status==='running'&&p.action.kind==='haul').reduce((n,p)=>{
          const a=p.action as {count:number;trips:number},done=(p.standing?.steps??[]).map(id=>co.inspect().outcomes[id]).filter(r=>r?.status==='completed').reduce((k,r)=>k+(r!.delivered??0),0);
          return n+Math.max(0,a.count*a.trips-done);},0);
        await run(()=>delivered()>=quota||!!stop,300000,async()=>{
          await co.reconcile();await co.advanceIntentions();track();const d=co.inspect();
          const busy=(who:string)=>Object.values(d.proposals).some(p=>p.pawn===who&&(p.status==='pending'||p.standing?.status==='running'))||!!d.characters[who]?.commitment;
          // The ordered model's own 35 % needs stop: record it instead of waiting out the budget.
          const ready=[P,B].filter(w=>state.pawns.find(x=>x.id===w)?.workReady);
          if(!ready.length&&![P,B].some(busy)){if(idleSince<0)idleSince=state.ticks;else if(state.ticks-idleSince>2500)stop='ordered needs stop: no capable pawn ready for 2500 ticks';}else idleSince=-1;
          for(const who of ready){
            if(busy(who))continue;
            const need=quota-delivered()-inFlight();if(need<=0)break;
            const o=(await co.corePerspective()).opportunities.find(o=>o.pawn===who&&o.action.kind==='haul'&&new RegExp(def).test(o.action.thing)&&inZone(o.action.x,o.action.z));
            if(o&&o.action.kind==='haul'){
              // Exact quantity: never plan past the quota.
              const count=Math.min(o.action.count,need),trips=Math.max(1,Math.min(o.action.trips,Math.floor(need/count)));
              try{
                const p=await co.core().propose(who,{...o.action,count,trips},'Scripted ordered offer');offers++;hauls.add(p.id);
                await co.pawn(who).decide(p.id,scripted({kind:'accept',reason:'Authored acceptance'}));track();
              }catch(e){((c.data.orderedErrors??=[]) as string[]).push('haul: '+String(e).slice(0,200));}
              continue;
            }
            // No option in view: move to a spot seeing both the nearest reachable stack and the pile.
            const here=state.pawns.find(x=>x.id===who)!;
            const stack=(await supplyAt(who)).filter(t=>gap(t.x,t.z)<=12&&(tries.get(t.thing)??0)<2&&t.reservable!==false)
              .sort((u,v)=>Math.max(Math.abs(u.x-here.x),Math.abs(u.z-here.z))-Math.max(Math.abs(v.x-here.x),Math.abs(v.z-here.z)))[0];
            if(!stack)continue;
            const n=nearest(stack.x,stack.z),spot={x:Math.round((stack.x+n.x)/2),z:Math.round((stack.z+n.z)/2)};
            tries.set(stack.thing,(tries.get(stack.thing)??0)+1);
            try{
              const p=await co.core().propose(who,{kind:'move',...spot},'Scripted ordered move toward the pile');moves++;
              await co.pawn(who).decide(p.id,scripted({kind:'accept',reason:'Authored acceptance'}));
            }catch(e){((c.data.orderedErrors??=[]) as string[]).push('move: '+String(e).slice(0,200));}
          }
          for(const p of Object.values(co.inspect().proposals))if(hauls.has(p.id))for(const step of p.standing?.steps??[])ours.add(step);
          if(!stop&&delivered()+inFlight()<quota&&!(await supplyAt(P)).some(t=>gap(t.x,t.z)<=12&&(tries.get(t.thing)??0)<2)&&![P,B].some(busy))stop='no reachable supply left for the ordered model';
        });
        for(const p of Object.values(co.inspect().proposals))if(hauls.has(p.id))for(const step of p.standing?.steps??[])ours.add(step);
        const units=delivered(),trips=outcomes().filter(r=>r.kind==='haul'&&ours.has(r.id)).length;
        // Wood moved into the pile by ordinary (opportunistic) hauling during this half is not the ordered model's.
        const zoneAfter=Number((await op({op:'lab-zone-count',zoneId,thing:def})).count);
        expect(c,offers>0&&units===quota&&inFlight()===0,`ordered baseline delivered ${units} of ${quota} ${def} from ${offers} offers and ${moves} moves${stop?'; '+stop:''}; not a passing comparison`);
        c.data.matched={model:'ordered',def,quota,delivered:units,trips,offers,moves,stop:stop||null,ticks:state.ticks-start,ticksPerUnit:units?(state.ticks-start)/units:null,
          estimatedCoreTurnsIfLive:offers+moves,nativeUnitsDuringOrdered:Math.max(0,zoneAfter-zoneBefore-units),outOfReachUnits:outOfReach.reduce((n,t)=>n+t.count,0)};
      }finally{s.close();}
    });
    await scenario('matched-native-'+def,base,async c=>{
      await op({op:'lab-patch-cost',count:1});   // time every patch call in this half (wrapper cost)
      const id=randomUUID(),start=state.ticks;await accept(id,P,{thing:def,quota});await accept(id,B,{thing:def,quota});await run(done(id),300000);
      c.data.patchCost=await op({op:'lab-patch-cost',count:2});await op({op:'lab-patch-cost',count:0});
      const v=invariants(c,id);if(!v)return;
      expect(c,v.status==='met'&&v.delivered===quota,`native baseline delivered ${v.delivered} of ${quota} ${def}`);
      const perJob=new Map<number,number>();for(const d of v.drops.filter(d=>d.kind==='participation'))perJob.set(d.job,(perJob.get(d.job)??0)+d.count);
      c.data.matched={model:'native',hold,def,quota,delivered:v.delivered,trips:perJob.size,unitsPerTrip:[...perJob.values()],ticks:state.ticks-start,ticksPerUnit:v.delivered?(state.ticks-start)/v.delivered:null};
      if(def!=='WoodLog')expect(c,perJob.size>1,`small-stack def completed in ${perJob.size} trip(s); multiple trips not established`);
    });
  }
  receipt.passed=receipt.eventGaps===0&&receipt.cases.length>0&&receipt.cases.every(c=>c.passed);
}catch(e){receipt.error=String(e);}
finally{
  try{opDeadline=Date.now()+10000;await b.admin('pause');}catch(e){receipt.passed=false;receipt.error='Final pause failed: '+String(e);}
  if(!receipt.passed)process.exitCode=1;
  await writeFile(root+`/.runtime/hauling-migration-${hold}-${runId}.json`,JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({hold,passed:receipt.passed,cases:receipt.cases.map(c=>({name:c.name,passed:c.passed,findings:c.findings})),eventGaps:receipt.eventGaps,error:receipt.error}));
}
