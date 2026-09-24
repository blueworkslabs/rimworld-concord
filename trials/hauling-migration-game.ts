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
const hold=process.argv.includes('--strict')?'strict':'growing';
const deadline=Date.now()+2400000;
let opDeadline=deadline;const b=new LabBridge(undefined,()=>opDeadline);
type Case={name:string;passed:boolean;findings:string[];data:Record<string,unknown>};
const runId=randomUUID();
const receipt:{runId:string;hold:string;unimplemented:string[];needsRecordedEvidence:string[];fixture?:unknown;passed:boolean;inferenceCalls:0;cases:Case[];eventGaps:number;at:string;error?:string}=
  {runId,hold,unimplemented:['full-load retarget with insufficient destination quota','pending-extra retarget','re-target between two tagged zones','nested reserve failure and job recycling inside the duplicate check (observed only)'],
   // Game cases this runner cannot observe: recorded by the operator, never counted as passed here.
   needsRecordedEvidence:['rescue handover in the game (consent, exclusion, drained cargo, one dispatch)','crew-log clock per event map and the Show button','zone label/colour on screen while open and after retirement'],
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
  const base='lab-concord-hm-base-'+Date.now();await b.save(base);
  const P=pawn('Pedro').id,B=pawn('Beatrice').id;
  const stacks=(def:string)=>m.stacks.filter((s:any)=>s.def===def);
  const accept=(intentId:string,actor:string,o:Record<string,unknown>={})=>op({op:'intent-accept',intentId,actor,thing:'WoodLog',zoneId,label:m.zone.label,quota:30,maxTicks:30000,variant:'attribution',hold,...o});
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
    const id=randomUUID();await accept(id,P,{quota:25});await accept(id,B,{quota:25});await run(done(id),300000);
    const v=invariants(c,id);if(!v)return;
    expect(c,v.peakHolders>=2,'no overlapping reservation holders: contention not exercised');
    expect(c,v.status==='met'&&v.delivered===25&&v.overshoot===0,`credited ${v.delivered}, overshoot ${v.overshoot}`);c.data.byPawn=v.byPawn;c.data.peakHolders=v.peakHolders;
  });
  await scenario('carried-cargo-plus-source',base,async c=>{
    const id=randomUUID();await accept(id,P,{quota:30});
    c.data.carry=await op({op:'lab-carry',intentId:id,actor:P,count:5});
    c.data.queued=await op({op:'lab-queue-haul',intentId:id,actor:P});
    const completed=await run(done(id),240000),v=invariants(c,id);
    const initial=(c.data.carry as {carried?:number}).carried??0,job=(c.data.queued as {queuedJob?:number}).queuedJob;
    const admitted=kinds('intent-admitted-start',P).find(e=>e.detail.includes(';job='+job+';')&&e.detail.includes(';carried='+initial+';'));
    expect(c,initial===5&&Number.isInteger(job)&&!!admitted,'positive cargo and linked queued-job admission were not established');
    expect(c,!!v&&completed&&v.status==='met'&&v.delivered===30,'carried-cargo scenario did not complete 30 units');
    expect(c,!!v&&v.drops.filter(d=>d.kind==='participation'&&d.job===job&&d.pawn===P).reduce((n,d)=>n+d.count,0)>initial,'queued job did not deliver existing cargo plus additional source');
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

  // --- B3: (map, zone, def): independent balances; a refusing pawn stores a third def freely.
  await scenario('mixed-zone-independent',base,async c=>{
    const w=randomUUID(),k=randomUUID();
    const third=m.zone.allow.find((d:string)=>d!=='WoodLog'&&d!=='ComponentIndustrial');
    if(!third||!stacks(third).length){c.findings.push('precondition: the manifest needs loose stacks of a third allowed def');return;}
    const count=async(def:string)=>Number((await op({op:'lab-zone-count',zoneId,thing:def})).count);
    const thirdBefore=await count(third);
    await accept(w,P,{quota:20});await accept(k,B,{thing:'ComponentIndustrial',quota:10});await exclude(w,B,'refuse');
    // Beatrice's own untagged trips of the third def, ended normally.
    const thirdJobs=()=>kinds('job-start',B).filter(e=>field(e,'def')===third&&!field(e,'intent')).map(e=>Number(field(e,'job')));
    const thirdDone=()=>thirdJobs().some(j=>kinds('job-end',B).some(e=>Number(field(e,'job'))===j&&/Succeeded/.test(e.detail)));
    await run(()=>done(w)()&&done(k)()&&thirdDone(),360000);
    const vw=invariants(c,w),vk=invariants(c,k);if(!vw||!vk)return;
    expect(c,vw.status==='met'&&vw.delivered===20&&vk.status==='met'&&vk.delivered===10,'both item quotas must complete');
    const thirdAfter=await count(third);c.data.third={def:third,before:thirdBefore,after:thirdAfter,jobs:thirdJobs()};
    expect(c,thirdDone()&&thirdAfter>thirdBefore,`the wood refuser did not store ${third}: jobs ${thirdJobs().join(',')}, zone ${thirdBefore} -> ${thirdAfter}`);
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
    await accept(id,P,{quota:10});await poll();
    const marked=kinds('intent-pretag-marked',B).find(e=>Number(field(e,'job'))===job);c.data.marked=marked?.detail;
    if(!marked){c.findings.push(`precondition: Beatrice's trip ${job} was not heading into the pile at tag time`);return;}
    const drained=await run(()=>done(id)()&&pawn('Beatrice').jobId!==job&&!(view(id)?.jobs??[]).some(j=>j.preTag),240000);
    expect(c,drained,'pre-tag trip did not finish within the observation window');
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

  // --- B6: presentation while open, restored after retirement; offer record via the coordinator.
  await scenario('legibility',base,async c=>{
    const s=new Store(root+`/.runtime/hauling-migration-${runId}.db`),co=new Coordinator(s,b);
    try{
      await co.open();await co.initializeCore('Scripted core for the hauling migration; every answer is authored.');
      const entry:Partial<NativeHaulEntry>={intentId:randomUUID(),thing:'WoodLog',thingLabel:'wood',label:m.zone.label,zoneId,quota:20,maxTicks:30000,variant:'attribution',hold};
      const [e]=await co.configureNativeHauls([entry]);
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
        const z=(state.stockpiles??[]).find(x=>x.zoneId===zoneId)!,start=state.ticks,ours=new Set<string>();let offers=0;
        const inZone=(x:number,zz:number)=>x>=z.x&&x<z.x+z.w&&zz>=z.z&&zz<z.z+z.h;
        const hauls=()=>Object.values(co.inspect().outcomes).filter(r=>r.kind==='haul'&&ours.has(r.id));
        const delivered=()=>hauls().filter(r=>r.status==='completed').reduce((n,r)=>n+(r.delivered??0),0);
        await run(()=>delivered()>=quota,300000,async()=>{
          await co.reconcile();await co.advanceIntentions();const d=co.inspect();
          for(const who of [P,B]){
            if(Object.values(d.proposals).some(p=>p.pawn===who&&(p.status==='pending'||p.standing?.status==='running'))||d.characters[who]?.commitment)continue;
            const o=(await co.corePerspective()).opportunities.find(o=>o.pawn===who&&o.action.kind==='haul'&&new RegExp(def).test(o.action.thing)&&inZone(o.action.x,o.action.z));
            if(!o)continue;const p=await co.core().propose(who,o.action,'Scripted ordered offer');offers++;
            await co.pawn(who).decide(p.id,scripted({kind:'accept',reason:'Authored acceptance'}));
            const accepted=co.inspect().proposals[p.id];if(accepted?.actionId)ours.add(accepted.actionId);
            for(const step of accepted?.standing?.steps??[])ours.add(step);
          }
          for(const p of Object.values(co.inspect().proposals))if(p.action.kind==='haul'&&new RegExp(def).test(p.action.thing))for(const step of p.standing?.steps??[])ours.add(step);
        });
        const units=delivered(),trips=hauls().length;
        expect(c,offers>0&&units===quota,`ordered baseline delivered ${units} of ${quota} ${def} from ${offers} offers; not a passing comparison`);
        // Exact quantities: a whole-stack ordered trip may carry past the quota; that part is labelled, not matched.
        c.data.matched={model:'ordered',def,quota,delivered:units,unmatchedUnits:Math.max(0,units-quota),trips,offers,ticks:state.ticks-start,ticksPerUnit:units?(state.ticks-start)/units:null,estimatedCoreTurnsIfLive:offers};
      }finally{s.close();}
    });
    await scenario('matched-native-'+def,base,async c=>{
      const id=randomUUID(),start=state.ticks;await accept(id,P,{thing:def,quota});await accept(id,B,{thing:def,quota});await run(done(id),300000);
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
