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
const receipt:{runId:string;hold:string;unimplemented:string[];fixture?:unknown;passed:boolean;inferenceCalls:0;cases:Case[];eventGaps:number;at:string;error?:string}=
  {runId,hold,unimplemented:['full-load retarget with insufficient destination quota','pending-extra retarget','re-target between two tagged zones','nested reserve failure and job recycling inside the duplicate check (observed only)'],
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
    if((pawn('Pedro').carryingCount??0)>0){c.findings.push('precondition: pickup occurred before source mutation');return;}
    const hold0=Number(/;reserved=(\d+)/.exec(admitted()!.detail)?.[1]);c.data.initialHold=hold0;
    await op({op:'lab-stack-set',intentId:id,thing:admitted()!.detail.split(';source=')[1],count:to});
    await run(()=>(pawn('Pedro').carryingCount??0)>0||done(id)(),60000);
    const carried=pawn('Pedro').carryingCount??0;c.data.firstPickup=carried;
    expect(c,carried>0&&carried<=hold0,`first pickup ${carried} exceeded the initial hold ${hold0}`);
    await run(done(id),240000);invariants(c,id);
  });
  await scenario('withdraw-after-duplicate-selection',base,async c=>{
    // Exclude while carrying: the carried trip may finish, but nothing more is collected.
    const id=randomUUID();await accept(id,P,{quota:30});
    if(!await run(()=>pawn('Pedro').job==='HaulToCell'&&(pawn('Pedro').carryingCount??0)>0,120000)){c.findings.push('precondition: Pedro never carried on a tagged trip');return;}
    c.findings.push('coverage gap: carrying alone does not prove a duplicate was selected; needs a selection receipt');
    const exclusionTick=state.ticks;
    const atExclusion=pawn('Pedro').carryingCount??0;await exclude(id,P,'withdraw');
    await run(()=>pawn('Pedro').job!=='HaulToCell',60000);
    const v=invariants(c,id);if(!v)return;
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
    c.findings.push('coverage gap: aggregate reservations do not prove this job has pending growth; per-job hold and budget evidence required');
    // Mid-growth: the hold covers more than the cargo (an admitted extra is pending).
    const growing=()=>{const v=view(id);return !!v&&v.status==='open'&&v.reserved>(pawn('Pedro').carryingCount??0)&&(pawn('Pedro').carryingCount??0)>0;};
    const reached=await run(growing,120000);c.data.midGrowthReached=reached;
    if(!reached&&hold==='growing')c.findings.push('precondition: no pending extra observed (geometry)');
    const before=view(id)!,name='lab-concord-hm-mid-'+Date.now();await b.save(name);c.data.eventsBeforeLoad=[...events];events=[];lastSeq=0;await b.load(name);await b.admin('pause');await poll();
    const after=view(id);expect(c,!!after&&after.delivered===before.delivered&&after.quota===before.quota&&after.reserved===before.reserved,'intent changed across save/load');
    await run(done(id),240000);invariants(c,id);
  });

  // --- B3: (map, zone, def): independent balances; a refusing pawn stores a third def freely.
  await scenario('mixed-zone-independent',base,async c=>{
    const w=randomUUID(),k=randomUUID();
    await accept(w,P,{quota:20});await accept(k,B,{thing:'ComponentIndustrial',quota:10});await exclude(w,B,'refuse');
    await run(()=>done(w)()&&done(k)(),360000);
    const vw=invariants(c,w),vk=invariants(c,k);if(!vw||!vk)return;
    expect(c,vw.status==='met'&&vw.delivered===20&&vk.status==='met'&&vk.delivered===10,'both item quotas must complete');
    c.findings.push('coverage gap: no actor-specific receipt proves the wood refuser stored an unrelated third def');
    expect(c,vw.byPawn.every(p=>p.pawn!==B),'refusing pawn credited on wood');
    expect(c,vk.drops.every(d=>d.kind!=='incidental'||d.source!=='haul'),'component intent recorded wood or steel');
    const zoneStock=(state.stockpiles??[]).find(z=>z.zoneId===zoneId);c.data.zone=zoneStock;
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

  // --- B8 matched pair: the ordered model on the same save and stockpile, native Hauling off
  // (as the ordered model always ran), the scripted core offering every grounded wood haul.
  await scenario('matched-ordered',base,async c=>{
    const s=new Store(root+`/.runtime/hauling-migration-ordered-${runId}.db`),co=new Coordinator(s,b);
    try{
      await co.open();await co.initializeCore('Scripted core for the ordered baseline; every answer is authored.');
      for(const p of state.pawns)await op({op:'lab-work-priority',actor:p.id,count:0});
      const z=(state.stockpiles??[]).find(x=>x.zoneId===zoneId)!,start=state.ticks;let offers=0;
      const inZone=(x:number,zz:number)=>x>=z.x&&x<z.x+z.w&&zz>=z.z&&zz<z.z+z.h;
      const delivered=()=>Object.values(co.inspect().outcomes).filter(r=>r.kind==='haul'&&r.status==='completed').reduce((n,r)=>n+(r.delivered??0),0);
      await run(()=>delivered()>=30,300000,async()=>{
        await co.reconcile();await co.advanceIntentions();const d=co.inspect();
        for(const who of [P,B]){
          if(Object.values(d.proposals).some(p=>p.pawn===who&&(p.status==='pending'||p.standing?.status==='running'))||d.characters[who]?.commitment)continue;
          const o=(await co.corePerspective()).opportunities.find(o=>o.pawn===who&&o.action.kind==='haul'&&/WoodLog/.test(o.action.thing)&&inZone(o.action.x,o.action.z));
          if(!o)continue;const p=await co.core().propose(who,o.action,'Scripted ordered offer');offers++;
          await co.pawn(who).decide(p.id,scripted({kind:'accept',reason:'Authored acceptance'}));
        }
      });
      expect(c,offers>0&&delivered()>=30,`ordered baseline delivered ${delivered()} from ${offers} offers; not a passing comparison`);
      const trips=Object.values(co.inspect().outcomes).filter(r=>r.kind==='haul').length;
      c.data.matched={model:'ordered',delivered:delivered(),trips,offers,ticks:state.ticks-start,ticksPerUnit:delivered()?(state.ticks-start)/delivered():null,estimatedCoreTurnsIfLive:offers};
    }finally{s.close();}
  });
  // --- B8 native half.
  await scenario('matched-native',base,async c=>{
    const id=randomUUID(),start=state.ticks;await accept(id,P,{quota:30});await accept(id,B,{quota:30});await run(done(id),300000);
    const v=invariants(c,id);if(!v)return;
    expect(c,v.status==='met'&&v.delivered===30,'native baseline did not complete 30 units');
    const trips=new Set(v.drops.filter(d=>d.kind==='participation').map(d=>d.job)).size;
    c.data.matched={hold,delivered:v.delivered,trips,ticks:state.ticks-start,ticksPerUnit:v.delivered?(state.ticks-start)/v.delivered:null};
  });
  receipt.passed=receipt.eventGaps===0&&receipt.cases.length>0&&receipt.cases.every(c=>c.passed);
}catch(e){receipt.error=String(e);}
finally{
  try{opDeadline=Date.now()+10000;await b.admin('pause');}catch(e){receipt.passed=false;receipt.error='Final pause failed: '+String(e);}
  if(!receipt.passed)process.exitCode=1;
  await writeFile(root+`/.runtime/hauling-migration-${hold}-${runId}.json`,JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({hold,passed:receipt.passed,cases:receipt.cases.map(c=>({name:c.name,passed:c.passed,findings:c.findings})),eventGaps:receipt.eventGaps,error:receipt.error}));
}
