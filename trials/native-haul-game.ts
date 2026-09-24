/** Scripted native-haul sub-runs (docs/SPIKE_NATIVE_HAUL.md, Runs 1 and 2). Zero model
 * calls: the script plays the core and the pawns' answers through the mod's intent ops.
 * Every case starts from the same base save; raw events and failures are retained per case.
 * Deferred coverage is reported explicitly, never counted as a passed scenario. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {LabBridge} from '../src/lab-bridge.js';
import type {GameState,NativeEvent} from '../src/protocol.js';
import {IntentView,invariantFindings,topicOutcome} from '../src/native-intents.js';
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
  {runId,unimplemented:['core offer/counter standing transitions','matched ordered-job halves','paired coordinator/cold restore','forced opportunistic replacement','forced partial merge','work-options and patch cost measurements'],mode,passed:false,inferenceCalls:0,cases:[],eventGaps:0,at:new Date().toISOString()};
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
  const A=pawn('Alvin').id,B=pawn('Beatrice').id,P=pawn('Pedro').id;
  const accept=(intentId:string,actor:string,o:Record<string,unknown>={})=>op({op:'intent-accept',intentId,actor,thing:'WoodLog',...cfg.area,quota:30,maxTicks:30000,variant:'attribution',...o});
  const exclude=(intentId:string,actor:string,reason:string)=>op({op:'intent-exclude',intentId,actor,reason});
  const done=(id:string)=>()=>view(id)?.status!=='open';

  if(mode==='main'){
    await scenario('stale-lab-command',base,async c=>{
      const old=state.epoch;await b.load(base);await b.admin('pause');lastSeq=0;events=[];await poll();
      expect(c,state.epoch!==old,'load did not advance timeline');
      let rejected=false;
      try{await b.intent({op:'lab-fault-escape',epoch:old,actor:A});}catch(e){rejected=String(e).includes('Stale timeline');}
      expect(c,rejected,'stale lab operation was not rejected');
    });
    for(const variant of ['exclusive','attribution'] as const)await scenario('variant-'+variant,base,async c=>{
      const id=randomUUID();await exclude(id,B,'refuse');await accept(id,A,{variant});
      await run(done(id),240000);const v=invariants(c,id);if(!v)return;
      expect(c,v.status==='met'&&v.delivered===30,`expected 30 met, got ${v.delivered} ${v.status}`);
      expect(c,!v.byPawn.some(p=>p.pawn===B),'refusing pawn credited');
      if(variant==='exclusive')expect(c,!v.byPawn.some(p=>p.pawn===P),'non-accepted pawn credited in exclusive variant');
      c.data.helpers=v.byPawn.filter(p=>p.pawn!==A);c.data.topic=topicOutcome(v);
    });
    await scenario('concurrent-quota',base,async c=>{
      const id=randomUUID();await accept(id,A);await accept(id,B);await accept(id,P);
      await run(done(id),240000);const v=invariants(c,id);if(!v)return;
      expect(c,v.delivered===30&&v.overshoot===0,`credited ${v.delivered}, overshoot ${v.overshoot}`);
      c.data.byPawn=v.byPawn;c.data.rejectedStarts=v.rejectedStarts;
    });
    await scenario('withdraw-walking',base,async c=>{
      const id=randomUUID();await accept(id,A,{variant:'exclusive'});
      const walking=()=>{const p=pawn('Alvin');return p.job==='HaulToCell'&&!p.carrying;};
      if(!await run(walking,60000))throw Error('precondition: Alvin never started a tagged trip');
      const from=lastSeq;await exclude(id,A,'withdraw');await poll();
      expect(c,pawn('Alvin').job!=='HaulToCell','tagged job not ended on withdrawal');
      await run(()=>false,15000);const v=invariants(c,id);if(!v)return;
      expect(c,!v.byPawn.some(p=>p.pawn===A),'withdrawn pawn credited after walking-phase withdrawal');
      c.data.jobEnds=since(from,'job-end',A).map(e=>e.detail);c.data.incidental=v.drops.filter(d=>d.kind!=='participation');
    });
    await scenario('withdraw-carrying',base,async c=>{
      const id=randomUUID();await accept(id,A,{variant:'exclusive'});
      const carrying=()=>{const p=pawn('Alvin');return p.job==='HaulToCell'&&!!p.carrying;};
      if(!await run(carrying,60000))throw Error('precondition: Alvin never carried on a tagged trip');
      await exclude(id,A,'withdraw');
      await run(()=>pawn('Alvin').job!=='HaulToCell',30000);await run(()=>false,5000);
      const v=invariants(c,id);if(!v)return;
      expect(c,v.finishedAfterExclusion>=1,'carried trip not finished and flagged');
      expect(c,v.drops.filter(d=>d.pawn===A&&d.kind==='participation').every(d=>d.startedBeforeExclusion),'unflagged participation after withdrawal');
    });
    await scenario('forced-cancel-in-zone',base,async c=>{
      const id=randomUUID();await accept(id,A,{variant:'exclusive'});const a=cfg.area;
      const inZone=()=>{const p=pawn('Alvin');return !!p.carrying&&p.x>=a.x&&p.x<a.x+a.w&&p.z>=a.z&&p.z<a.z+a.h;};
      const reached=await run(inZone,90000);
      if(!reached){c.findings.push('Alvin never stood in the zone while carrying (retry with a larger area)');return;}
      const before=view(id)!.delivered;c.data.interrupt=await op({op:'lab-interrupt',actor:A});await poll();
      const v=invariants(c,id);if(!v)return;
      expect(c,v.delivered===before,'cleanup drop credited');c.data.drops=v.drops.slice(-3);
    });
    for(const [quota,carry] of [[5,20],[30,10]] as const)await scenario('pre-carried-'+carry+'-quota-'+quota,base,async c=>{
      const id=randomUUID();await accept(id,A,{quota,variant:'exclusive'});
      c.data.carry=await op({op:'lab-carry',intentId:id,actor:A,count:carry});
      // Queue a fresh job while already carrying; its target A is another loose stack.
      c.data.queued=await op({op:'lab-queue-haul',intentId:id,actor:A});
      await run(()=>!pawn('Alvin').carrying,60000);
      const v=invariants(c,id);if(!v)return;
      if(carry>quota)expect(c,v.delivered===0,`oversized carried load credited (${v.delivered})`);
      else expect(c,v.delivered>=carry,`admitted carried load not credited (${v.delivered})`);
    });
    await scenario('restore-mid-intent',base,async c=>{
      const id=randomUUID();await accept(id,A,{quota:75});await accept(id,B,{quota:75});
      if(!await run(()=>{const v=view(id);return !!v&&v.delivered>0&&v.reserved>0&&v.status==='open';},120000))throw Error('precondition: no in-flight haul after a first delivery');
      const before=view(id)!;const name='lab-concord-nh-mid-'+Date.now();await b.save(name);c.data.eventsBeforeLoad=[...events];lastSeq=0;events=[];await b.load(name);await b.admin('pause');await poll();
      const after=view(id);if(!after){c.findings.push('intent lost on load');return;}
      for(const k of ['status','quota','delivered','overshoot','incidental','violations'] as const)expect(c,after[k]===before[k],`${k} changed on load`);
      expect(c,JSON.stringify(after.byPawn)===JSON.stringify(before.byPawn),'credit changed on load');
      await run(done(id),240000);invariants(c,id);c.data.before=before;c.data.afterLoadReserved=after.reserved;
    });
    await scenario('candidate-discarded',base,async c=>{
      const id=randomUUID();await accept(id,A);const r=await op({op:'lab-haul-candidate',intentId:id,actor:B});
      expect(c,r.made===true,'candidate was not created');expect(c,r.remainingBefore===r.remainingAfter,'candidate creation changed remaining');c.data.candidate=r;
    });
    await scenario('queued-removed-on-exclusion',base,async c=>{
      const id=randomUUID();await accept(id,A);await accept(id,P);
      c.data.queued=await op({op:'lab-queue-haul',intentId:id,actor:P});const reservedBefore=view(id)!.reserved;
      await exclude(id,P,'withdraw');const q=await op({op:'lab-queue-count',intentId:id,actor:P});
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
    await scenario('quota-immutability-only',base,async c=>{
      // Only native quota immutability; model counter/adoption transitions are deferred.
      const id=randomUUID();await accept(id,A,{quota:20});
      expect(c,view(id)?.quota===20,'pre-acceptance quota not adopted');
      // A second acceptance cannot change the quota. This is not a counteroffer test.
      await accept(id,B,{quota:10});expect(c,view(id)?.quota===20,'quota changed after acceptance');
    });
  }else{
    await scenario('meal-resumption',base,async c=>{
      const id=randomUUID();await accept(id,A,{quota:75,variant:'exclusive',maxTicks:60000});
      const ate=()=>since(0,'ingested',A).length>0;
      await run(()=>ate()||done(id)(),600000);
      const meal=since(0,'ingested',A)[0];
      if(!meal){c.findings.push('invalid: Alvin never ate before the intent closed');return;}
      const at=view(id)!;c.data.atMeal={tick:meal.tick,delivered:at.delivered,status:at.status,remaining:at.remaining};
      if(at.status!=='open'||at.remaining<=0){c.findings.push('invalid: intent not open with work left when hunger triggered');return;}
      const next=()=>events.some(e=>e.seq>meal.seq&&e.pawn===A&&e.kind==='job-start'&&e.detail.includes('intent='+id));
      expect(c,await run(next,300000),'Alvin did not start another tagged haul after eating');
      const resumed=events.find(e=>e.seq>meal.seq&&e.pawn===A&&e.kind==='job-start'&&e.detail.includes('intent='+id));
      c.data.ticksMealToResume=resumed?resumed.tick-meal.tick:null;c.data.modelCalls=0;invariants(c,id);
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
