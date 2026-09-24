/** Scripted native-haul sub-runs (docs/SPIKE_NATIVE_HAUL.md, Runs 1 and 2). Zero model
 * calls: the script plays the core and the pawns' answers through the mod's intent ops.
 * Every case starts from the same base save; raw events and failures are retained per case.
 * Deferred coverage is reported explicitly, never counted as a passed scenario. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {LabBridge} from '../src/lab-bridge.js';
import type {GameState,NativeEvent} from '../src/protocol.js';
import {IntentView,invariantFindings,topicOutcome,intentAction} from '../src/native-intents.js';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {scripted} from '../src/backends.js';
import {crewReport} from '../src/crew-log.js';
import {startNative} from './native-run.js';
if(process.env.CONCORD_NATIVE_HAUL_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname;
const mode=process.argv.includes('--meal')?'meal':'main';
const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
const deadline=Date.now()+(mode==='meal'?900000:1800000);
let opDeadline=deadline;const b=new LabBridge(undefined,()=>opDeadline);
type Case={name:string;passed:boolean;findings:string[];data:Record<string,unknown>};
const runId=randomUUID();
const receipt:{runId:string;unimplemented:string[];mode:string;fixture?:unknown;passed:boolean;inferenceCalls:0;cases:Case[];eventGaps:number;at:string;error?:string}=
  {runId,unimplemented:['cold coordinator restore mid-intent','forced opportunistic replacement','forced partial merge','work-options and patch cost measurements'],mode,passed:false,inferenceCalls:0,cases:[],eventGaps:0,at:new Date().toISOString()};
let events:NativeEvent[]=[],lastSeq=0,state:GameState;

async function poll(){
  state=await b.state();
  const fresh=(state.events??[]).filter(e=>e.seq>lastSeq);
  if(fresh.length&&fresh[0]!.seq>lastSeq+1&&lastSeq>0)receipt.eventGaps++;
  events.push(...fresh);if(fresh.length)lastSeq=fresh[fresh.length-1]!.seq;
  return state;
}
const view=(id:string)=>{const v=(state.intents??[]).find(i=>i.intentId===id);return v?IntentView.parse(v):undefined;};
const pawn=(name:string)=>{const p=state.pawns.find(p=>p.name===name);if(!p)throw Error('No pawn '+name);return p;};
const op=async(payload:Record<string,unknown>&{op:any})=>{const r=await b.intent({epoch:state.epoch,...payload});state=r.state;return r.receipt as any;};
async function run(until:()=>boolean,ms:number){
  const end=Math.min(deadline,Date.now()+ms);await startNative(b);
  try{while(Date.now()<end){await poll();if(until())return true;await delay(150);}return false;}
  finally{await b.admin('pause');await poll();}
}
/** Like run(), with the coordinator reconciling (and, for ordered work, the scripted core
 * offering) on every poll. No model is involved: every answer is authored. */
async function runWith(tick:()=>Promise<void>,until:()=>boolean,ms:number){
  const end=Math.min(deadline,Date.now()+ms);await startNative(b);
  try{while(Date.now()<end){await tick();await poll();if(until())return true;await delay(250);}return false;}
  finally{await b.admin('pause');await poll();}
}
async function coordinator(name:string){
  const s=new Store(root+`/.runtime/native-haul-${name}-${runId}.db`),co=new Coordinator(s,b);
  await co.open();await co.initializeCore('Scripted core for the native-haul spike; every answer is authored.');return {s,co};
}
const since=(from:number,kind:string,who?:string)=>events.filter(e=>e.seq>from&&e.kind===kind&&(!who||e.pawn===who));

async function scenario(name:string,base:string,body:(c:Case)=>Promise<void>){
  if(only&&only!==name)return;
  const c:Case={name,passed:false,findings:[],data:{}};receipt.cases.push(c);const gapsBefore=receipt.eventGaps;
  try{
    opDeadline=deadline;lastSeq=0;events=[];await b.load(base);await b.admin('pause');await poll();events=[];lastSeq=state.eventSeq??0;
    await body(c);
  }catch(e){c.findings.push('error: '+String(e));}
  finally{
    try{await b.admin('pause');await poll();}catch(e){c.findings.push('final capture: '+String(e));}
    c.data.events=[...events];c.data.finalState=state;
    if(receipt.eventGaps>gapsBefore)c.findings.push('native event gap: evidence incomplete');
    c.passed=c.findings.length===0;
  }
  console.error(`${c.passed?'PASS':'FAIL'} ${name} ${c.findings.join('; ')}`);
}
function expect(c:Case,ok:boolean,finding:string){if(!ok)c.findings.push(finding);}
function invariants(c:Case,id:string,opts={}){const v=view(id);if(!v){c.findings.push('intent missing');return undefined;}c.findings.push(...invariantFindings(v,opts));c.data.intent=v;return v;}

try{
  const f=JSON.parse(await readFile(root+'/.runtime/native-haul-fixture.json','utf8'));receipt.fixture=f;
  const cfg=mode==='meal'?f.meal:f.main;
  await b.load(cfg.save);await b.admin('pause');await poll();
  const base='lab-concord-nh-base-'+Date.now();await b.save(base);
  const roles=JSON.parse(await readFile(root+'/scripts/native-haul-roles.json','utf8'));
  receipt.fixture={...f,roleSheet:roles};
  const primary=roles.primary as string;
  const A=pawn(primary).id,B=pawn(roles.secondary).id;
  if(primary!=='Pedro'||roles.secondary!=='Beatrice')throw Error('unexpected fixture role sheet');
  const accept=(intentId:string,actor:string,o:Record<string,unknown>={})=>op({op:'intent-accept',intentId,actor,thing:'WoodLog',...cfg.area,quota:30,maxTicks:30000,variant:'attribution',...o});
  const exclude=(intentId:string,actor:string,reason:string)=>op({op:'intent-exclude',intentId,actor,reason});
  const done=(id:string)=>()=>view(id)?.status!=='open';
  /** Ordered-job model on the same save: every offer here stands for a core turn in live play. */
  async function orderedHalf(c:Case,ms:number){
    const {s,co}=await coordinator('ordered');
    try{
      c.data.zone=await op({op:'lab-plain-zone',actor:A,...cfg.area});
      for(const p of state.pawns)await op({op:'lab-work-priority',actor:p.id,count:0});
      let offers=0,noOption=0,offersAfterMeal=0;const from=lastSeq,startTick=state.ticks,quota=mode==='meal'?75:30;
      const samples:{tick:number;id:string;status:string;delivered:number}[]=[];
      const observed=new Set<string>();
      const outcomes=()=>{const d=co.inspect(),ids=new Set(Object.values(d.proposals).filter(p=>p.pawn===A&&p.action.kind==='haul').flatMap(p=>p.standing?.steps??[]));return Object.values(d.outcomes).filter(r=>r.actor===A&&r.kind==='haul'&&ids.has(r.id));};
      const delivered=()=>outcomes().reduce((n,r)=>n+(r.delivered??0),0);
      const ate=()=>since(from,'ingested',A).length>0;
      await runWith(async()=>{
        await co.reconcile();await co.advanceIntentions();
        for(const r of outcomes()){const key=r.id+':'+r.status;if(!observed.has(key)){observed.add(key);samples.push({tick:state.ticks,id:r.id,status:r.status,delivered:r.delivered??0});}}
        if(delivered()>=quota)return;
        const d=co.inspect();
        if(Object.values(d.proposals).some(p=>p.pawn===A&&(p.status==='pending'||p.standing?.status==='running'))||d.characters[A]?.commitment)return;
        const o=(await co.corePerspective()).opportunities.find(o=>o.pawn===A&&o.action.kind==='haul'&&/^(?:Thing_)?WoodLog\d+$/.test(o.action.thing)&&o.action.x>=cfg.area.x&&o.action.x<cfg.area.x+cfg.area.w&&o.action.z>=cfg.area.z&&o.action.z<cfg.area.z+cfg.area.h);
        if(!o){noOption++;return;}
        if(o.action.kind!=='haul')throw Error('Expected wood hauling');
        const count=Math.min(o.action.count,quota-delivered()),trips=Math.min(o.action.trips,Math.floor((quota-delivered())/count));
        const p=await co.core().propose(A,{...o.action,count,trips},'Scripted ordered offer');offers++;if(ate())offersAfterMeal++;
        await co.pawn(A).decide(p.id,scripted({kind:'accept',reason:'Authored acceptance'}));
      },()=>delivered()>=quota,ms);
      await co.reconcile();
      const d=co.inspect(),mine=Object.values(d.proposals).filter(p=>p.pawn===A&&p.action.kind==='haul');
      const receipts=outcomes();
      const starts=since(from,'job-start',A).filter(e=>e.detail.startsWith('ConcordHaul;')),meal=since(from,'ingested',A)[0],first=starts[0],afterMeal=meal&&starts.find(e=>e.seq>meal.seq),beforeMeal=meal&&starts.some(e=>e.seq<meal.seq);
      c.data.receipts=receipts;c.data.observedOutcomes=samples;
      expect(c,offers>0&&delivered()>0,'ordered baseline did not execute and deliver scoped wood');
      expect(c,delivered()===quota,`ordered baseline delivered ${delivered()}/${quota}`);
      if(mode==='meal'){expect(c,!!meal,'ordered meal baseline never ate');expect(c,!!afterMeal,'ordered meal baseline has no post-meal haul start');}
      return {startTick,firstWorkTick:first?.tick??null,mealTick:meal?.tick??null,postMealWorkTick:afterMeal?.tick??null,
        ticksToFirstWork:first?first.tick-startTick:null,ticksMealToFirstWork:meal&&afterMeal?afterMeal.tick-meal.tick:null,
        resumedEarlierWork:!!beforeMeal&&!!afterMeal,ticksMealToResume:beforeMeal&&meal&&afterMeal?afterMeal.tick-meal.tick:null,offers,offersAfterMeal,pollsWithoutGroundedOption:noOption,ate:ate(),
        delivered:delivered(),
        staleRejections:receipts.filter(r=>r.status==='failed').map(r=>r.reason),
        stops:mine.filter(p=>p.standing?.status==='stopped').map(p=>p.standing!.reason),
        estimatedCoreOfferTurnsIfLive:offers,actualModelCalls:0};
    }finally{s.close();}
  }

  if(mode==='main'){
    await scenario('stale-lab-command',base,async c=>{
      const old=state.epoch;await b.load(base);await b.admin('pause');lastSeq=0;events=[];await poll();
      expect(c,state.epoch!==old,'load did not advance timeline');
      let rejected=false;
      try{await b.intent({op:'lab-fault-escape',epoch:old,actor:A});}catch(e){rejected=String(e).includes('Stale timeline');}
      expect(c,rejected,'stale lab operation was not rejected');
    });
    for(const variant of ['exclusive','attribution'] as const)await scenario('variant-'+variant,base,async c=>{
      const id=randomUUID();if(variant==='exclusive')await exclude(id,B,'refuse');await accept(id,A,{variant});
      c.data.roles=roles.scripted[variant];c.data.notOffered=roles.notOffered;
      await run(done(id),240000);const v=invariants(c,id);if(!v)return;
      expect(c,v.status==='met'&&v.delivered===30,`expected 30 met, got ${v.delivered} ${v.status}`);
      if(variant==='exclusive')expect(c,!v.byPawn.some(p=>p.pawn!==A),'non-accepted/refusing pawn credited in exclusive variant');
      else expect(c,v.byPawn.some(p=>p.pawn===B&&p.count>0),'unasked helper Beatrice did not receive delivery credit');
      c.data.helpers=v.byPawn.filter(p=>p.pawn!==A);c.data.topic=topicOutcome(v);
    });
    await scenario('concurrent-quota',base,async c=>{
      const id=randomUUID();await accept(id,A);await accept(id,B);
      await run(done(id),240000);const v=invariants(c,id);if(!v)return;
      expect(c,v.delivered===30&&v.overshoot===0,`credited ${v.delivered}, overshoot ${v.overshoot}`);
      c.data.byPawn=v.byPawn;c.data.rejectedStarts=v.rejectedStarts;
    });
    await scenario('withdraw-walking',base,async c=>{
      const id=randomUUID();await accept(id,A,{variant:'exclusive'});
      const walking=()=>{const p=pawn(primary);return p.job==='HaulToCell'&&!p.carrying;};
      if(!await run(walking,60000))throw Error('precondition: Pedro never started a tagged trip');
      const from=lastSeq;await exclude(id,A,'withdraw');await poll();
      expect(c,pawn(primary).job!=='HaulToCell','tagged job not ended on withdrawal');
      await run(()=>false,15000);const v=invariants(c,id);if(!v)return;
      expect(c,!v.byPawn.some(p=>p.pawn===A),'withdrawn pawn credited after walking-phase withdrawal');
      c.data.jobEnds=since(from,'job-end',A).map(e=>e.detail);c.data.incidental=v.drops.filter(d=>d.kind!=='participation');
    });
    await scenario('withdraw-carrying',base,async c=>{
      const id=randomUUID();await accept(id,A,{variant:'exclusive'});
      const carrying=()=>{const p=pawn(primary);return p.job==='HaulToCell'&&!!p.carrying;};
      if(!await run(carrying,60000))throw Error('precondition: Pedro never carried on a tagged trip');
      await exclude(id,A,'withdraw');
      await run(()=>pawn(primary).job!=='HaulToCell',30000);await run(()=>false,5000);
      const v=invariants(c,id);if(!v)return;
      expect(c,v.finishedAfterExclusion>=1,'carried trip not finished and flagged');
      expect(c,v.drops.filter(d=>d.pawn===A&&d.kind==='participation').every(d=>d.startedBeforeExclusion),'unflagged participation after withdrawal');
    });
    await scenario('forced-cancel-in-zone',base,async c=>{
      const id=randomUUID();await accept(id,A,{variant:'exclusive'});const a=cfg.area;
      const inZone=()=>{const p=pawn(primary);return !!p.carrying&&p.x>=a.x&&p.x<a.x+a.w&&p.z>=a.z&&p.z<a.z+a.h;};
      const reached=await run(inZone,90000);
      if(!reached){c.findings.push('Pedro never stood in the zone while carrying (retry with a larger area)');return;}
      const before=view(id)!.delivered;c.data.interrupt=await op({op:'lab-interrupt',actor:A});await poll();
      const v=invariants(c,id);if(!v)return;
      expect(c,v.delivered===before,'cleanup drop credited');c.data.drops=v.drops.slice(-3);
    });
    for(const [quota,carry] of [[5,20],[30,10]] as const)await scenario('pre-carried-'+carry+'-quota-'+quota,base,async c=>{
      const id=randomUUID();await accept(id,A,{quota,variant:'exclusive'});
      const injected=await op({op:'lab-carry',intentId:id,actor:A,count:carry});c.data.carry=injected;
      if(injected.carried!==carry)throw Error('precondition: wrong pre-carried count');
      // Queue a fresh job while already carrying; its target A is another loose stack.
      const queued=await op({op:'lab-queue-haul',intentId:id,actor:A});c.data.queued=queued;
      const kind=carry>quota?'intent-rejected-start':'intent-admitted-start';
      const admitted=()=>events.some(e=>e.kind===kind&&e.pawn===A&&e.detail.includes(';job='+queued.queuedJob+';')&&e.detail.includes(';carried='+carry+';'));
      // Rejection detail ends at carried; match the field at either separator or end.
      const observed=()=>admitted()||events.some(e=>e.kind===kind&&e.pawn===A&&e.detail.includes(';job='+queued.queuedJob+';')&&e.detail.endsWith(';carried='+carry));
      if(!await run(observed,60000))throw Error('precondition: queued job did not reach admission with injected load');
      if(carry<=quota&&!await run(()=>view(id)?.status==='met',60000))throw Error('admitted load did not finish');
      const v=invariants(c,id);if(!v)return;
      if(carry>quota)expect(c,v.delivered===0,`oversized carried load credited (${v.delivered})`);
      else expect(c,v.delivered>=carry,`admitted carried load not credited (${v.delivered})`);
    });
    await scenario('restore-mid-intent',base,async c=>{
      const id=randomUUID();await accept(id,A,{quota:75});await accept(id,B,{quota:75});
      if(!await run(()=>{const v=view(id);return !!v&&v.delivered>0&&v.reserved>0&&v.status==='open';},120000))throw Error('precondition: no in-flight haul after a first delivery');
      const before=view(id)!;const name='lab-concord-nh-mid-'+Date.now();await b.save(name);c.data.eventsBeforeLoad=[...events];lastSeq=0;events=[];await b.load(name);await b.admin('pause');await poll();
      const after=view(id);if(!after){c.findings.push('intent lost on load');return;}
      for(const k of ['status','quota','delivered','overshoot','incidental','unattributed','removed','violations'] as const)expect(c,after[k]===before[k],`${k} changed on load`);
      expect(c,JSON.stringify(after.byPawn)===JSON.stringify(before.byPawn),'credit changed on load');
      expect(c,JSON.stringify(after.drops)===JSON.stringify(before.drops),'drop history changed on load');
      await run(done(id),240000);invariants(c,id);c.data.before=before;c.data.afterLoadReserved=after.reserved;
    });
    await scenario('candidate-discarded',base,async c=>{
      const id=randomUUID();await accept(id,A);const r=await op({op:'lab-haul-candidate',intentId:id,actor:B});
      expect(c,r.made===true,'candidate was not created');expect(c,r.remainingBefore===r.remainingAfter,'candidate creation changed remaining');c.data.candidate=r;
    });
    await scenario('queued-removed-on-exclusion',base,async c=>{
      const id=randomUUID();await accept(id,A);await accept(id,B);
      c.data.queued=await op({op:'lab-queue-haul',intentId:id,actor:B});const reservedBefore=view(id)!.reserved;
      await exclude(id,B,'withdraw');const q=await op({op:'lab-queue-count',intentId:id,actor:B});
      expect(c,q.tagged===0,'tagged queued job survived exclusion');expect(c,view(id)!.reserved===reservedBefore,'dequeue changed the ledger');
    });
    await scenario('excluded-forced-start',base,async c=>{
      const id=randomUUID();await accept(id,A,{variant:'exclusive'});await exclude(id,B,'refuse');
      await op({op:'lab-queue-haul',intentId:id,actor:B});await run(()=>(view(id)?.rejectedStarts??0)>0,30000);
      const v=invariants(c,id);if(!v)return;
      expect(c,v.rejectedStarts>0,'excluded queued start not rejected');expect(c,!v.byPawn.some(p=>p.pawn===B),'excluded pawn credited');
    });
    await scenario('expiry-partial',base,async c=>{
      const id=randomUUID();await accept(id,A,{maxTicks:900,variant:'exclusive'});await run(done(id),60000);
      const v=invariants(c,id);if(!v)return;
      expect(c,v.status==='expired'&&topicOutcome(v)==='expired',`expected expired, got ${v.status}`);c.data.delivered=v.delivered;
    });
    await scenario('escape-injection',base,async c=>{
      const id=randomUUID();await op({op:'lab-fault-escape',actor:A});await accept(id,A,{quota:5,variant:'exclusive'});
      await run(()=>since(0,'quota-escape').length>0||done(id)(),90000);
      const v=invariants(c,id,{escapeInjected:true});if(!v)return;
      expect(c,since(0,'quota-escape').length>0,'no quota-escape event');c.data.overshoot=v.overshoot;
    });
    await scenario('arrival-coverage',base,async c=>{
      const id=randomUUID();await accept(id,A,{quota:75,variant:'exclusive'});
      await run(()=>(view(id)?.delivered??0)>=30,120000);
      c.data.spawn=await op({op:'lab-zone-spawn',intentId:id,count:3});c.data.merge=await op({op:'lab-zone-merge',intentId:id,count:2});
      await run(()=>false,6000); // at least one 250-tick reconciliation
      const v=invariants(c,id);if(!v)return;
      const part=v.drops.filter(d=>d.kind==='participation').reduce((n,d)=>n+d.count,0);
      expect(c,part===v.delivered,'participation drops do not sum to delivered');
      expect(c,v.drops.some(d=>d.kind==='unattributed'&&d.source==='spawn'&&d.count===3),'fresh spawn not seen by hook 5');
      expect(c,v.drops.some(d=>d.kind==='unattributed'&&d.source==='reconcile'&&d.count===2),'merge not caught by reconciliation');
      expect(c,!v.drops.some(d=>d.kind==='unattributed'&&d.source==='reconcile'&&d.count!==2),'reconciliation reported an unexpected difference');
    });
    await scenario('core-offers',base,async c=>{
      // The scripted core offers the frozen intent; Alvin is never offered (native capability).
      const {s,co}=await coordinator('core');
      try{
        const setup={intentId:randomUUID(),area:cfg.area,quota:30,maxTicks:30000,variant:'exclusive' as const},alvin=pawn('Alvin').id;
        await co.configureNativeHaul(setup);
        const v=await co.corePerspective();
        expect(c,!v.opportunities.some(o=>o.pawn===alvin),'Alvin was offered hauling');
        expect(c,v.availability.some(a=>a.pawn===alvin&&/cannot do hauling/.test(a.status)),'no visible not-offered reason for the core');
        let refused=false;try{await co.core().propose(alvin,intentAction(setup),'Scripted offer');}catch(e){refused=/Not offered: cannot do hauling/.test(String(e));}
        expect(c,refused,'direct offer to Alvin was not refused');
        // Beatrice refuses; Pedro counters 20 before anyone accepts; the core adopts it; Pedro accepts.
        const ob=await co.core().propose(B,intentAction(setup),'Scripted: stock wood in the new stockpile');
        await co.pawn(B).decide(ob.id,scripted({kind:'refuse',reason:'Authored refusal'}));
        const first=await co.core().propose(A,intentAction(setup),'Scripted: stock wood in the new stockpile');
        await co.pawn(A).decide(first.id,scripted({kind:'counter',reason:'Twenty is enough',action:intentAction(setup,20)}));
        const adopted=await co.core().revise(first.id,'Scripted: adopt twenty');
        await co.pawn(A).decide(adopted.id,scripted({kind:'accept',reason:'Authored acceptance'}));await poll();
        expect(c,view(setup.intentId)?.quota===20,'adopted pre-acceptance counter did not set the quota');
        expect(c,!!view(setup.intentId)?.excluded.includes(B),'refusal not binding in the game');
        // Paired checkpoint while the intent is open (no Concord job exists to block it).
        const mid=await runWith(()=>co.reconcile(),()=>{const v=view(setup.intentId);return v?.status==='open'&&v.reserved>0;},120000);
        if(mid){
          await co.reconcile();const before=view(setup.intentId)!,name='lab-concord-nh-core-'+Date.now();
          if(before.status!=='open'||before.reserved<=0)throw Error('paired checkpoint requires an open in-flight intent');
          await co.checkpoint(name);c.data.eventsBeforeLoad=[...events];events=[];lastSeq=0;await co.restore(name);await poll();
          const after=view(setup.intentId);
          expect(c,!!after&&after.quota===before.quota&&after.delivered===before.delivered&&after.status===before.status,'intent changed across paired restore');
          expect(c,co.inspect().proposals[adopted.id]?.standing?.status==='running','standing lost across paired restore');
          c.data.pairedRestore={name,before:{delivered:before.delivered,reserved:before.reserved},afterReserved:after?.reserved};
        }else c.findings.push('no open in-flight haul before the paired checkpoint window closed');
        await runWith(()=>co.reconcile(),()=>co.inspect().proposals[adopted.id]?.standing?.status!=='running',240000);
        await co.reconcile();
        const iv=invariants(c,setup.intentId);if(!iv)return;
        expect(c,iv.status==='met'&&iv.delivered===20,`expected 20 met, got ${iv.delivered} ${iv.status}`);
        expect(c,!iv.byPawn.some(p=>p.pawn!==A),'credit outside the accepting pawn in the exclusive variant');
        expect(c,co.inspect().proposals[adopted.id]?.standing?.status==='completed','accepting standing not completed');
        const crew=crewReport(co.inspect(),state.ticks).entries.map(e=>e.text);c.data.crew=crew;
        expect(c,crew.includes('Alvin: not offered: cannot do hauling.'),'crew log lacks the not-offered line');
        expect(c,crew.some(t=>t.startsWith('Stockpile haul quota met: 20/20 wood')),'crew log lacks the quota line');
      }finally{s.close();}
    });
    await scenario('ordered-main',base,async c=>{
      // Matched ordered-job half for stale rejections: the same area as an ordinary stockpile,
      // native Hauling off for everyone so only ordered jobs haul, the scripted core offering
      // Pedro every grounded haul it sees. Same wall-clock budget as the native variants.
      c.data.result=await orderedHalf(c,240000);
    });
    await scenario('quota-immutability-only',base,async c=>{
      // Only native quota immutability; model counter/adoption transitions are deferred.
      const id=randomUUID();await accept(id,A,{quota:20});
      expect(c,view(id)?.quota===20,'pre-acceptance quota not adopted');
      // A second acceptance cannot change the quota. This is not a counteroffer test.
      await accept(id,B,{quota:10});expect(c,view(id)?.quota===20,'quota changed after acceptance');
    });
  }else{
    await scenario('meal-resumption',base,async c=>{
      const id=randomUUID(),startTick=state.ticks,from=lastSeq;await accept(id,A,{quota:75,variant:'exclusive',maxTicks:60000});
      const ate=()=>since(0,'ingested',A).length>0;
      await run(()=>ate()||done(id)(),600000);
      const meal=since(0,'ingested',A)[0];
      if(!meal){c.findings.push('invalid: Pedro never ate before the intent closed');return;}
      const at=view(id)!;c.data.atMeal={tick:meal.tick,delivered:at.delivered,status:at.status,remaining:at.remaining};
      if(at.status!=='open'||at.remaining<=0){c.findings.push('invalid: intent not open with work left when hunger triggered');return;}
      const next=()=>events.some(e=>e.seq>meal.seq&&e.pawn===A&&e.kind==='job-start'&&e.detail.includes('intent='+id));
      expect(c,await run(next,300000),'Pedro did not start another tagged haul after eating');
      const resumed=events.find(e=>e.seq>meal.seq&&e.pawn===A&&e.kind==='job-start'&&e.detail.includes('intent='+id));
      const first=since(from,'job-start',A).find(e=>e.detail.includes('intent='+id));
      c.data.firstWorkTick=first?.tick??null;c.data.ticksToFirstWork=first?first.tick-startTick:null;
      c.data.workStartedBeforeMeal=!!first&&first.seq<meal.seq;
      expect(c,!!first&&first.seq<meal.seq,'invalid: no tagged work before the meal; this is initial work, not resumption');
      c.data.ticksMealToResume=resumed&&first&&first.seq<meal.seq?resumed.tick-meal.tick:null;c.data.modelCalls=0;invariants(c,id);
    });
    await scenario('ordered-meal',base,async c=>{
      // Matched ordered-job half: same start state (Pedro's Food 0.33). The ordered model stops
      // work below 0.35 and never resumes an agreement; every restart needs a new offer.
      c.data.result=await orderedHalf(c,600000);
    });
  }
  receipt.passed=receipt.eventGaps===0&&receipt.cases.length>0&&receipt.cases.every(c=>c.passed);
}catch(e){receipt.error=String(e);}
finally{
  try{opDeadline=Date.now()+10000;await b.admin('pause');}catch{}
  if(!receipt.passed)process.exitCode=1;
  await writeFile(root+`/.runtime/native-haul-${mode}-${runId}.json`,JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({mode,passed:receipt.passed,cases:receipt.cases.map(c=>({name:c.name,passed:c.passed,findings:c.findings})),eventGaps:receipt.eventGaps,error:receipt.error}));
}
