/** Scripted construction checks (docs/MIGRATION_PRODUCTION.md, P4 construction 1–17, amended by
 * #88). Zero model calls: build ops and lab ops only. Every case starts from the same quiet base
 * save; raw events, final state and failures are retained per case. What this runner cannot force
 * is listed as unimplemented or observed-only, never counted as passed. Round ledger: Astra.
 *
 * Needs .runtime/native-construction-fixture.json:
 *   {"save":"lab-...","site":{"x":..,"z":..},"site2":{"x":..,"z":..},"far":{"x":..,"z":..},
 *    "cost":{"WoodLog":20},"other":"Stool"}
 * site/site2: clear campfire cells within 8 cells of each other; far: a clear cell more than 8
 * cells from both; cost: the campfire's material cost on the pinned build; other: a different
 * 1x1 buildable for the replacement case. Three free colonists (Pedro, Beatrice, Alvin) and loose
 * wood within reach, as in the hauling-migration fixture. */
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {LabBridge} from '../src/lab-bridge.js';
import type {GameState,NativeEvent} from '../src/protocol.js';
import {BuildView} from '../src/native-build.js';
import {startNative} from './native-run.js';
if(process.env.CONCORD_NATIVE_CONSTRUCTION_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname;
const caseNames=['1-accept-build','2-helper-delivers','3-refusal-ordinary','4-nearby-untagged','5-shared-work','6-forced-failure','7-cancel','8-different-def','9-restore','10-fate','11-forbid','12-replace','13-forced-after-refusal','14-transitions','15-withdraw-in-flight','16-two-sites','17-generations'];
const args=process.argv.slice(2);
const only=args[0]?.slice(7);
if(args.length>1||(args.length===1&&(!args[0]!.startsWith('--case=')||!caseNames.includes(only!))))throw Error('Unknown construction case');
const deadline=Date.now()+3600000;
let opDeadline=deadline;const b=new LabBridge(undefined,()=>opDeadline);
type Case={name:string;passed:boolean;findings:string[];data:Record<string,unknown>};
const runId=randomUUID();
const receipt:{runId:string;unimplemented:string[];observedOnly:Record<string,unknown[]>;fixture?:unknown;passed:boolean;inferenceCalls:0;cases:Case[];eventGaps:number;patchCost?:unknown;at:string;error?:string}=
  {runId,unimplemented:[
    // Needs the coordinator PR: helper labels in the crew log, offer text, clock time on the fate line.
    'crew-log wording (helper label, completion record, fate line with clock time): coordinator PR',
    // Case 7's exact refunds: no leavings hook for Gate C (signature answer 4); the record says "not recorded".
    'exact returned units on cancel/failure (answer 4: "returned: not recorded")',
    'case 4: actual nearby-extension and queued-destination opportunity evidence',
    'case 5: work-share reconciliation against native deltas and failure-before-increment',
    'case 13: queued/restored forced provenance, ordinary continuation and stamp isolation',
    'case 14: absent/ambiguous successors and exception unwind',
    'case 15: current-frame withdrawal, queued/reserved candidates, unrelated current work and reentrancy',
    'case 16: restore between deposits followed by the next physical transfer',
    'case 17: post-retag effects and same-def physical replacement',
   ],observedOnly:{},passed:false,inferenceCalls:0,cases:[],eventGaps:0,at:new Date().toISOString()};
let events:NativeEvent[]=[],lastSeq=0,eventEpoch:string|undefined,state:GameState;
const persist=()=>writeFile(root+`/.runtime/native-construction-${runId}.json`,JSON.stringify(receipt,null,2));

async function poll(){
  state=await b.state();
  if(eventEpoch!==state.epoch){lastSeq=0;eventEpoch=state.epoch;}
  const fresh=(state.events??[]).filter(e=>e.seq>lastSeq);
  if(fresh.length&&fresh[0]!.seq>lastSeq+1&&lastSeq>0)receipt.eventGaps++;
  events.push(...fresh);if(fresh.length)lastSeq=fresh[fresh.length-1]!.seq;
  for(const v of state.buildIntents??[]) {
    if(v.violations>0||v.delivered?.some(r=>r.role==='violation')||v.work?.some(r=>r.role==='violation'))
      throw Error('construction consent violation: '+v.intentId);
  }
  return state;
}
const view=(id:string)=>{const v=(state.buildIntents??[]).find(i=>i.intentId===id);return v?BuildView.parse(v):undefined;};
const pawn=(name:string)=>{const p=state.pawns.find(p=>p.name===name);if(!p)throw Error('No pawn '+name);return p;};
const op=async(payload:Record<string,unknown>&{op:any})=>{const r=await b.intent({epoch:state.epoch,...payload});state=r.state;return r.receipt as any;};
async function run(until:()=>boolean,ms:number,tick?:()=>Promise<void>){
  const end=Math.min(deadline,Date.now()+ms);await startNative(b);
  try{while(Date.now()<end){if(tick)await tick();await poll();if(until())return true;await delay(150);}return false;}
  finally{await b.admin('pause');await poll();}
}
const kinds=(k:string,who?:string)=>events.filter(e=>e.kind===k&&(!who||e.pawn===who));
const field=(e:{detail:string}|undefined,k:string)=>e?new RegExp('(?:^|;)'+k+'=([^;]*)').exec(e.detail)?.[1]:undefined;
async function scenario(name:string,base:string,body:(c:Case)=>Promise<void>){
  if(only&&only!==name)return;
  const c:Case={name,passed:false,findings:[],data:{}};receipt.cases.push(c);const gapsBefore=receipt.eventGaps;
  try{
    opDeadline=deadline;lastSeq=0;events=[];await b.load(base);await b.admin('pause');await poll();events=[];lastSeq=state.eventSeq??0;
    await body(c);
  }catch(e){c.findings.push('error: '+String(e));}
  finally{
    try{await b.admin('pause');await poll();}catch(e){c.findings.push('final capture: '+String(e));}
    c.data.events=[...events];c.data.buildIntents=state?.buildIntents;
    if(receipt.eventGaps>gapsBefore)c.findings.push('native event gap: evidence incomplete');
    c.passed=c.findings.length===0;await persist();
  }
  console.error(`${c.passed?'PASS':'FAIL'} ${name} ${c.findings.join('; ')}`);
  if(!c.passed)throw Error('Stopped after failed construction case: '+name);
}
function expect(c:Case,ok:boolean,finding:string){if(!ok)c.findings.push(finding);}
const total=(v:BuildView,role?:string,pawnId?:string)=>v.delivered.filter(d=>(!role||d.role===role)&&(!pawnId||d.pawn===pawnId)).reduce((n,d)=>n+d.count,0);
const workOf=(v:BuildView,pawnId?:string,role?:string)=>v.work.filter(w=>(!pawnId||w.pawn===pawnId)&&(!role||w.role===role)).reduce((n,w)=>n+w.work,0);
/** Historical accepted work stands after withdrawal. Check recorded violations, not current
 * exclusion membership against all past shares; case 15 checks effects after the boundary. */
function consent(c:Case,v:BuildView){
  expect(c,v.violations===0&&!v.delivered.some(r=>r.role==='violation')&&!v.work.some(r=>r.role==='violation'),`violations: ${v.violations}`);
}

try{
  const f=JSON.parse(await readFile(root+'/.runtime/native-construction-fixture.json','utf8'));receipt.fixture=f;
  await b.load(f.save);await b.admin('pause');await poll();
  const P=pawn('Pedro').id,B=pawn('Beatrice').id,A=pawn('Alvin').id;
  // Quiet base: no job in flight; nobody constructs or hauls unless a case enables it.
  for(const who of [P,B,A]){await op({op:'lab-interrupt',actor:who,reason:'idle'});await op({op:'lab-build-priority',actor:who,count:0,quota:0});}
  const base='lab-concord-nc-base-'+Date.now();await b.save(base);
  const cost=f.cost.WoodLog as number;
  const prio=(who:string,construction:number,hauling:number)=>op({op:'lab-build-priority',actor:who,count:construction,quota:hauling});
  const open=(intentId:string,actor:string,o:Record<string,unknown>={})=>op({op:'build-accept',intentId,actor,thing:'Campfire',x:f.site.x,z:f.site.z,count:0,maxTicks:60000,siteId:'east-site',label:'campfire at the east site',...o});
  const exclude=(intentId:string,actor:string,reason:string)=>op({op:'build-exclude',intentId,actor,reason});
  const ended=(id:string)=>()=>{const v=view(id);return !!v&&v.status!=='open';};
  const stage=(id:string,s:string)=>()=>view(id)?.stage===s;
  const site=async(x:number,z:number)=>((await op({op:'lab-build-site',x,z})).things as {def:string;id:number;load:string;kind:string;forbidden:boolean;held?:string;workDone?:number}[]);
  const jobOf=async(who:string)=>await op({op:'lab-build-job',actor:who}) as {current:{job:number;def:string;forced:boolean;segments:number}|null;queued:unknown[];carrying:number};

  // 1. The accepting pawn delivers and builds (plus the patch-cost measurement for the ledger).
  await scenario('1-accept-build',base,async c=>{
    await op({op:'lab-build-cost',count:1});
    try {
    const id=randomUUID();await prio(P,1,1);await open(id,P);
    await run(ended(id),300000);const v=view(id)!;
    expect(c,v.status==='built'&&v.stage==='built',`expected built, got ${v.status}/${v.stage}`);
    expect(c,total(v,'accepted',P)===cost,`accepted delivery ${total(v,'accepted',P)} != ${cost}`);
    expect(c,workOf(v,P,'accepted')>0,'no accepted work recorded');
    expect(c,v.finisher===P,`finisher ${v.finisher}`);
    expect(c,kinds('build-stage').filter(e=>field(e,'stage')==='frame').length===1,'expected exactly one frame transition');
    consent(c,v);
    } finally {
      try { receipt.patchCost={scope:'incomplete handler-body instrumentation; not total patch overhead',
        limitations:['prefix-only for B1/B2/B4/B9/B10/B12; postfix/finalizer excluded','B8 includes the original native deposit action','active counts use the global Active flag, not tagged-handler hits'],
        values:await op({op:'lab-build-cost',count:2})}; }
      finally { await op({op:'lab-build-cost',count:0}); }
    }
  });
  // 2. An unasked pawn delivers: credited as a helper.
  await scenario('2-helper-delivers',base,async c=>{
    const id=randomUUID();await prio(B,0,1);await open(id,P);
    await run(()=>total(view(id)!)>=cost,240000);await prio(P,1,0);await run(ended(id),240000);
    const v=view(id)!;
    expect(c,total(v,'helper',B)>0,'Beatrice delivered nothing as helper');
    expect(c,!v.delivered.some(d=>d.pawn===B&&d.role!=='helper'),'Beatrice credited with a non-helper role');
    expect(c,v.status==='built'&&v.finisher===P,`expected built by Pedro, got ${v.status} ${v.finisher}`);consent(c,v);
  });
  // 3. Ordinary work: refusers never deliver or build (Construction-enabled, and Hauling-only).
  await scenario('3-refusal-ordinary',base,async c=>{
    // Alvin cannot haul in the unchanged fixture. Use the capable refuser in two
    // independent halves; do not interpret a disabled work type as refusal enforcement.
    c.data.halves=[];
    for(const construction of [1,0]) {
      if(construction===0){await b.load(base);await b.admin('pause');await poll();}
      const id=randomUUID();await open(id,P);await exclude(id,B,'Not now');
      const enabled=await prio(B,construction,1);
      if(enabled.construction!==construction||enabled.hauling!==1)throw Error('precondition: refuser cannot perform the selected work');
      await prio(P,1,1);await run(ended(id),300000);const v=view(id)!;
      expect(c,!v.delivered.some(d=>d.pawn===B)&&!v.work.some(w=>w.pawn===B),'a refuser contributed');
      expect(c,v.status==='built',`expected built, got ${v.status}`);consent(c,v);
      (c.data.halves as unknown[]).push({construction,hauling:1,refuser:B,view:v});
    }
  });
  // 4. An untagged blueprint within 8 cells: a refuser's delivery there never fills the tagged one.
  await scenario('4-nearby-untagged',base,async c=>{
    const id=randomUUID();await open(id,P);await exclude(id,B,'Not this one');
    await op({op:'lab-build-blueprint',actor:B,thing:'Campfire',x:f.site2.x,z:f.site2.z});await prio(B,1,1);
    await run(()=>(kinds('build-rejected-destination').length>0)||false,180000);
    const v=view(id)!;const tagged=await site(f.site.x,f.site.z),other=await site(f.site2.x,f.site2.z);c.data.sites={tagged,other};
    expect(c,!v.delivered.some(d=>d.pawn===B),'Beatrice filled the tagged site');
    expect(c,other.some(t=>t.kind==='frame'||t.def==='Campfire'),'Beatrice did not work the untagged site (precondition)');consent(c,v);
  });
  // 5. Work shared: the acceptor is interrupted mid-frame, a helper finishes.
  await scenario('5-shared-work',base,async c=>{
    const id=randomUUID();await prio(P,1,1);await open(id,P);
    await run(()=>view(id)?.stage==='frame'&&(kinds('build-work').length>0||(state.pawns.find(p=>p.id===P)?.job==='FinishFrame')),240000);
    await run(()=>false,3000);await op({op:'lab-interrupt',actor:P,reason:'idle'});await prio(P,0,0);await prio(B,1,1);
    await run(ended(id),240000);const v=view(id)!;const wp=workOf(v,P),wb=workOf(v,B);c.data.work={P:wp,B:wb};
    expect(c,wp>0,'no work settled for the interrupted acceptor');expect(c,wb>0,'no work for the helper');
    expect(c,v.finisher===B,`finisher ${v.finisher}`);expect(c,v.work.every(w=>w.role!=='accepted'||w.pawn===P),'role mixup');consent(c,v);
  });
  // 6. Forced construction failure: failed with what the frame held; the respawned blueprint is untagged.
  await scenario('6-forced-failure',base,async c=>{
    const id=randomUUID();await prio(P,1,1);await open(id,P);
    await run(()=>view(id)?.stage==='frame'&&total(view(id)!)>=cost,240000);await prio(P,0,0);
    await op({op:'lab-build-fail',intentId:id,actor:P});await poll();const v=view(id)!;
    expect(c,v.status==='failed'&&/construction failed/.test(v.stopReason??''),`expected failed, got ${v.status} ${v.stopReason}`);
    expect(c,/returned: not recorded/.test(v.stopReason??''),'refund line missing');
    const after=await site(f.site.x,f.site.z);c.data.after=after;
    expect(c,after.some(t=>t.kind==='blueprint'),'no respawned blueprint');
    expect(c,!after.some(t=>t.id===v.thingId&&t.kind==='blueprint'),'tag moved to the respawned blueprint');
    const again=randomUUID();await open(again,P,{x:undefined,z:undefined,target:after.find(t=>t.kind==='blueprint')!.load});
    expect(c,view(again)?.generation===v.generation+1,'a new offer did not open a new generation');
  });
  // 7. Player cancels the blueprint, then (separately) a partially filled frame.
  await scenario('7-cancel',base,async c=>{
    const id=randomUUID();await open(id,P);await op({op:'lab-build-destroy',intentId:id,reason:'Cancel'});await poll();
    const v=view(id)!;expect(c,v.status==='stopped'&&/cancelled by the player/.test(v.stopReason??''),`blueprint cancel: ${v.status} ${v.stopReason}`);
    await b.load(base);await b.admin('pause');await poll();
    const id2=randomUUID();await prio(P,1,1);await open(id2,P);
    await run(()=>view(id2)?.stage==='frame'&&total(view(id2)!)>0,240000);await prio(P,0,0);await op({op:'lab-interrupt',actor:P,reason:'idle'});
    expect(c,total(view(id2)!)>0&&total(view(id2)!)<cost,'unexercised: frame was not partially supplied');
    await op({op:'lab-build-destroy',intentId:id2,reason:'Cancel'});await poll();const v2=view(id2)!;c.data.frameCancel=v2;
    expect(c,v2.status==='stopped'&&/held .*WoodLog.*returned: not recorded/.test(v2.stopReason??''),`frame cancel: ${v2.status} ${v2.stopReason}`);
  });
  // 8. A different def appears on the footprint: failed, no re-tag.
  await scenario('8-different-def',base,async c=>{
    const id=randomUUID();await open(id,P);const before=view(id)!.thingId;
    await op({op:'lab-build-spawn',actor:P,thing:f.other,x:f.site.x,z:f.site.z});await run(()=>ended(id)(),5000);
    const v=view(id)!;expect(c,v.status==='failed',`expected failed, got ${v.status}`);expect(c,v.thingId===before,'the tag moved');
    expect(c,(state.buildIntents??[]).filter(i=>i.status==='open').length===0,'something was re-tagged');
  });
  // 9. Save and restore at blueprint and at frame: same process, then a new process (C3).
  await scenario('9-restore',base,async c=>{
    const id=randomUUID();await open(id,P);await poll();
    const checkpoint=async(label:string)=>{
      const before=view(id)!;if(before.stage!==label||before.status!=='open')throw Error(`${label}: checkpoint precondition not reached (${before.status}/${before.stage})`);const name=`lab-concord-nc-${label}-`+Date.now();await b.save(name);
      await b.load(name);await b.admin('pause');await poll();const same=view(id)!;
      expect(c,JSON.stringify(same)===JSON.stringify(before),`${label}: same-process restore changed the intent`);
      const {stdout}=await promisify(execFile)(process.execPath,[root+'/dist/trials/native-construction-restore.js',name,id],{env:process.env,timeout:120000});
      const cold=JSON.parse(stdout.trim().split('\n').pop()!);
      expect(c,Number.isInteger(cold.pid)&&cold.pid!==process.pid,`${label}: restore did not use a new process`);
      expect(c,JSON.stringify(cold.view)===JSON.stringify(before),`${label}: new-process restore changed the intent`);
      await b.load(name);await b.admin('pause');await poll();(c.data.restores??=[] as unknown[]) as unknown[];(c.data.restores as unknown[]).push({label,name,before,same,cold,parentPid:process.pid});
    };
    await checkpoint('blueprint');
    await prio(P,1,1);await run(()=>view(id)?.stage==='frame'&&total(view(id)!)>0,240000);await checkpoint('frame');
    await run(ended(id),300000);const v=view(id)!;
    expect(c,v.status==='built'&&total(v)===cost,`after restore: ${v.status} delivered ${total(v)} of ${cost}`);
    const occ=v.records.map(r=>r.occurrence).filter(Boolean);expect(c,new Set(occ).size===occ.length,'duplicate occurrence IDs');consent(c,v);
  });
  // 10. After built, deconstruction: the fate is recorded with its tick.
  await scenario('10-fate',base,async c=>{
    const id=randomUUID();await prio(P,1,1);await open(id,P);await run(ended(id),300000);
    expect(c,view(id)?.status==='built','precondition: not built');
    await op({op:'lab-build-deconstruct',intentId:id});await run(()=>view(id)?.fate!=='standing',180000);
    const v=view(id)!;expect(c,v.fate==='deconstructed'&&v.fateTick>0,`fate ${v.fate} ${v.fateTick}`);
  });
  // 11. Forbidden: ordinary work stops, the note shows, stage and deadline unchanged; unforbid resumes.
  await scenario('11-forbid',base,async c=>{
    const id=randomUUID();await open(id,P);await op({op:'lab-build-forbid',intentId:id,count:1});await prio(P,1,1);
    const before=view(id)!;await run(()=>false,20000);const mid=view(id)!;
    expect(c,mid.note==='forbidden by the player','note missing');expect(c,total(mid)===0&&mid.stage===before.stage&&mid.untilTick===before.untilTick,'work or state changed while forbidden');
    await op({op:'lab-build-forbid',intentId:id,count:0});await run(ended(id),300000);expect(c,view(id)?.status==='built','did not resume after unforbidding');
  });
  // 12. The player's build designator over the tagged frame: stopped, replaced by the player.
  await scenario('12-replace',base,async c=>{
    const id=randomUUID();await prio(P,1,1);await open(id,P);await run(()=>view(id)?.stage==='frame'&&total(view(id)!)>0,240000);
    await prio(P,0,0);await op({op:'lab-interrupt',actor:P,reason:'idle'});
    await op({op:'lab-build-designate',thing:f.other,x:f.site.x,z:f.site.z});await poll();
    const v=view(id)!;expect(c,v.status==='stopped'&&/replaced by the player/.test(v.stopReason??''),`expected replaced, got ${v.status} ${v.stopReason}`);
  });
  // 13. Forced by an order after refusal: delivery then construction; uncredited, not a violation.
  await scenario('13-forced-after-refusal',base,async c=>{
    const id=randomUUID();await open(id,P);await exclude(id,B,'No');
    const d=await op({op:'lab-build-forced',intentId:id,actor:B,reason:'delivery'});c.data.deliveryJob=d;
    await run(()=>total(view(id)!,'forced',B)>=cost||view(id)?.stage==='frame'&&total(view(id)!)>=cost,240000);
    const w=await op({op:'lab-build-forced',intentId:id,actor:B,reason:'work'});c.data.workJob=w;
    await run(ended(id),240000);const v=view(id)!;
    expect(c,v.status==='built'&&v.finisher===B,'forced construction did not finish');
    expect(c,total(v,'forced',B)>0&&workOf(v,B,'forced')>0,'forced delivery or work missing');
    expect(c,!v.delivered.some(r=>r.pawn===B&&r.role!=='forced')&&!v.work.some(r=>r.pawn===B&&r.role!=='forced'),'Beatrice credited or labelled');
    expect(c,v.violations===0,'forced work counted as a violation');
  });
  // 14. Transitions: one per replacement; a blocking thing makes conversion wait, then convert.
  await scenario('14-transitions',base,async c=>{
    const id=randomUUID();await open(id,P);await op({op:'lab-build-block',intentId:id,thing:'Steel',count:5});
    await prio(P,1,1);await run(ended(id),300000);const v=view(id)!;
    expect(c,v.status==='built',`expected built after unblocking, got ${v.status}`);
    expect(c,kinds('build-stage').filter(e=>field(e,'stage')==='frame').length===1&&kinds('build-stage').filter(e=>field(e,'stage')==='built').length===1,'expected exactly one frame and one built transition');
    c.data.conversionNotes=v.records.filter(r=>/conversion did not happen/.test(r.text));
    expect(c,(c.data.conversionNotes as unknown[]).length>0,'unexercised: no blocked false-return conversion observed');
  });
  // 15. Withdrawal in flight: carrying toward the site; and an already-excluded pawn at attachment.
  await scenario('15-withdraw-in-flight',base,async c=>{
    const id=randomUUID();await prio(P,0,1);await open(id,P);await open(id,B);
    // Beatrice stays idle but keeps the intent open after Pedro withdraws, so the
    // check cannot confuse ordinary post-retirement work with consent enforcement.
    const carrying=async()=>{const j=await jobOf(P);return j.current?.def==='HaulToContainer'&&j.carrying>0;};
    let seen=false;await run(()=>seen,180000,async()=>{seen=await carrying();});
    if(!seen)throw Error('precondition: Pedro never carried toward the site');
    await exclude(id,P,'Changed my mind');const tick=state.ticks;const j=await jobOf(P);c.data.afterExclude=j;
    expect(c,view(id)?.status==='open','precondition: withdrawal retired the intent');
    expect(c,j.current?.def!=='HaulToContainer','the delivery kept running');
    await run(()=>false,15000);const v=view(id)!;
    expect(c,!v.records.some(r=>r.kind==='delivery'&&r.pawn===P&&r.tick>=tick),'a post-withdrawal deposit happened');consent(c,v);
    // Already-excluded attachment: Beatrice delivers to an untagged blueprint, is excluded, then the tag lands.
    await b.load(base);await b.admin('pause');await poll();
    const bp=(await op({op:'lab-build-blueprint',actor:B,thing:'Campfire',x:f.site.x,z:f.site.z})).blueprint as string;
    const id2=randomUUID();await prio(B,0,1);
    let on=false;await run(()=>on,180000,async()=>{const jb=await jobOf(B);on=jb.current?.def==='HaulToContainer'&&jb.carrying>0;});
    if(!on)throw Error('precondition: Beatrice never carried toward the blueprint');
    await exclude(id2,B,'No');await open(id2,P,{target:bp,x:undefined,z:undefined});const jb=await jobOf(B);c.data.attachment=jb;
    expect(c,jb.current?.def!=='HaulToContainer','the excluded pawn kept delivering at attachment');
    await run(()=>false,15000);expect(c,!view(id2)!.delivered.some(d=>d.pawn===B),'excluded pawn deposited after attachment');
  });
  // 16. One job deposits into two independently tagged sites: once each, also after restore.
  await scenario('16-two-sites',base,async c=>{
    const a=randomUUID(),b2=randomUUID();await open(a,P);await open(b2,P,{x:f.site2.x,z:f.site2.z,siteId:'west-site'});await prio(P,0,1);
    await run(()=>total(view(a)!)>0&&total(view(b2)!)>0,300000);
    const name='lab-concord-nc-two-'+Date.now();const before=[view(a)!,view(b2)!];await b.save(name);await b.load(name);await b.admin('pause');await poll();
    expect(c,JSON.stringify([view(a),view(b2)])===JSON.stringify(before),'restore changed either site');
    const jobsA=new Set(view(a)!.records.filter(r=>r.kind==='delivery').map(r=>r.occurrence.split(':')[1])),jobsB=new Set(view(b2)!.records.filter(r=>r.kind==='delivery').map(r=>r.occurrence.split(':')[1]));
    c.data.sharedJobs=[...jobsA].filter(j=>jobsB.has(j));
    expect(c,(c.data.sharedJobs as unknown[]).length>0,'unexercised: no single job filled both sites');
    expect(c,total(view(a)!)>0&&total(view(b2)!)>0,'unexercised: missing delivery to one site');
    for(const v of [view(a)!,view(b2)!]){const occ=v.records.map(r=>r.occurrence).filter(Boolean);expect(c,new Set(occ).size===occ.length,'duplicate occurrence at '+v.intentId);}
  });
  // 17. Generations: a later intent at the same key never inherits; pre-tag work stays uncredited.
  await scenario('17-generations',base,async c=>{
    const bp=(await op({op:'lab-build-blueprint',actor:B,thing:'Campfire',x:f.site.x,z:f.site.z})).blueprint as string;await prio(B,0,1);
    let on=false;await run(()=>on,180000,async()=>{const jb=await jobOf(B);on=jb.current?.def==='HaulToContainer';});
    expect(c,on,'precondition: Beatrice never began a pre-tag delivery');
    const id=randomUUID();await open(id,P,{target:bp,x:undefined,z:undefined});
    await run(()=>total(view(id)!)>0,120000);const v1=view(id)!;
    expect(c,total(v1,'pretag',B)>0,'unexercised: no pre-tag delivery observed');
    expect(c,v1.delivered.filter(d=>d.pawn===B).every(d=>d.role==='pretag'),'pre-tag delivery was credited');
    await op({op:'build-stop',intentId:id,reason:'Scripted stop'});
    const id2=randomUUID();const cur=(await site(f.site.x,f.site.z)).find(t=>t.kind==='frame'||t.kind==='blueprint');
    if(!cur)throw Error('precondition: no carrier left for the second generation');
    await open(id2,P,{target:cur.load,x:undefined,z:undefined});const v2=view(id2)!;
    expect(c,v2.generation===v1.generation+1,`generation ${v2.generation} after ${v1.generation}`);
    expect(c,v2.records.every(r=>r.generation===v2.generation)&&total(v2)===0,'the new generation inherited records');
  });
  receipt.passed=receipt.cases.length>0&&receipt.cases.every(c=>c.passed);
}catch(e){receipt.error=String(e);}
finally{await persist();}
console.log(JSON.stringify({runId,passed:receipt.passed,cases:receipt.cases.map(c=>({name:c.name,passed:c.passed,findings:c.findings})),error:receipt.error}));
if(!receipt.passed)process.exitCode=1;
