/** Authored, paused plumbing check; requires two built single beds and a campfire. No model calls.
 * Native message-list acceptance is not the separate sealed recording-only legibility measure. */
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {LabBridge} from '../src/lab-bridge.js';
import type {Snapshot} from '../src/harness/perception.js';
import type {Receipt} from '../src/harness/actions.js';
if(process.env.CONCORD_HARNESS_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname,args=process.argv.slice(2),save=args[0]?.split('=')[1];
if(args.length!==1||!args[0]?.startsWith('--save=')||!save||!/^lab-[a-zA-Z0-9-]+$/.test(save))throw Error('Usage: harness-a1-scripted --save=lab-...');
const runId=randomUUID(),t0=Date.now(),b=new LabBridge(undefined,()=>t0+180000);
await mkdir(root+'/.runtime',{recursive:true});
const prefix=root+`/.runtime/harness-a1-scripted-${runId}`;
const record=async(kind:string,data:unknown)=>appendFile(prefix+'.jsonl',JSON.stringify({at:Date.now(),kind,data})+'\n');
const findings:string[]=[],notes:string[]=[],receipts:Receipt[]=[];
const check=(ok:unknown,what:string)=>{if(!ok)findings.push(what);};
let timeline!:Snapshot['meta'];
const read=async()=>{const s=await b.perceive();timeline=s.meta;await record('snapshot',s);return s;};
const act=async(action:unknown,requestId:string=randomUUID())=>{await record('request',{action,requestId,timeline});const r=await b.act(action,timeline,requestId);receipts.push(r);await record('receipt',r);return r;};
const messages=async()=>{const m=(await b.intent({op:'lab-messages',epoch:timeline.epoch})).receipt as {live:string[];archived:string[]};await record('messages',m);return m;};
const count=(list:string[],text:string|null|undefined)=>list.filter(x=>x===text).length;
const expected=new Map<string,number>();
const narrated=async(r:Receipt,pattern:RegExp,what:string)=>{
  check(!!r.narration&&pattern.test(r.narration),what+': unexpected narration '+r.narration);
  check(r.narrated==='shown',what+': narrated='+r.narrated);
  const n=(expected.get(r.narration??'')??0)+1;expected.set(r.narration??'',n);
  check(count((await messages()).archived,r.narration)===n,what+': native archive count differs from distinct request count');
  await delay(300); // Explicit recording observation padding, not controller timing.
};
let start:Snapshot|undefined,restored:Snapshot|undefined;
try{
  await b.load(save);await b.admin('pause');start=await read();const s=start;
  const beds=s.map.things.filter(t=>t.bed&&t.slots===1&&t.def==='Bed'&&t.faction==='player'&&!t.medical&&!t.prisoner&&!t.slave);
  const bench=s.map.things.find(t=>t.def==='Campfire'&&t.workbench);
  const rock=s.map.things.find(t=>/^(Granite|Slate|Marble|Sandstone|Limestone|Mineable)/.test(t.def)&&t.kind==='building');
  const item=s.map.things.find(t=>t.kind==='item'&&!t.forbidden);
  const cook=s.pawns.find(p=>p.work.some(w=>w.def==='Cooking'&&!w.disabled));
  if(s.pawns.length<2||beds.length<2||!bench||!rock||!item||!cook)throw Error('Fixture requires two colonists, two ordinary built single beds, campfire, visible mineable rock, loose allowed item and capable cook; no coverage is skipped');
  for(const text of (await messages()).archived)expected.set(text,(expected.get(text)??0)+1);
  const refused=await act({action:'place_blueprint',def:'Campfire',x:rock.x,z:rock.z});check(!refused.ok&&refused.source==='game','native placement refusal missing');await narrated(refused,/^The game refused/,'game refusal');
  const notBed=await act({action:'assign_bed',bed:bench.id,pawn:s.pawns[0]!.id});check(!notBed.ok&&notBed.source==='harness','non-bed must be harness-refused');await narrated(notBed,/was rejected \(harness check\)/,'harness refusal');
  const stale=await b.act({action:'assign_bed',bed:beds[0]!.id,pawn:s.pawns[0]!.id},{...timeline,epoch:'stale'},randomUUID());await record('stale-receipt',stale);
  check(!stale.ok&&!stale.narration,'stale request must not narrate or assign');check((await read()).receipts.length===s.receipts.length+2,'stale request created a saved receipt');
  const q=await b.placement({by:'placement',def:'Campfire',x:bench.x+3,z:bench.z},timeline.epoch);await record('placement',q);
  const cell=q.ok?{x:q.x,z:q.z}:q.nearest[0];if(!cell)throw Error('no valid placement cell');
  const action={action:'place_blueprint',def:'Campfire',...cell};const placed=await act(action);check(placed.ok,'placement failed');await narrated(placed,/^The core placed a campfire blueprint/,'placement');
  const again=await act(action,placed.requestId);check(JSON.stringify(again)===JSON.stringify(placed),'retry receipt changed');check(count((await messages()).archived,placed.narration)===expected.get(placed.narration!),'retry duplicated narration');
  const mine=await act({action:'designate',kind:'mine',thing:rock.id});check(mine.ok,'mine request failed');await narrated(mine,/marked the .+ for mining/,'cell-target mining');
  check((await read()).designations.some(d=>d.def==='Mine'&&d.x===rock.x&&d.z===rock.z),'native cell mining order absent');
  const cancel=await act({action:'designate',kind:'cancel',thing:rock.id});check(cancel.ok,'cancel failed');await narrated(cancel,/cancelled 1 recorded orders/,'cancel mining');
  check(!(await read()).designations.some(d=>d.def==='Mine'&&d.x===rock.x&&d.z===rock.z),'mine order survived cancellation');
  const priority=await act({action:'work_priority',pawn:cook.id,work:'Cooking',priority:1});check(priority.ok,'work priority failed');
  const effective=(await read()).pawns.find(p=>p.id===cook.id)!.work.find(w=>w.def==='Cooking')!.priority;
  await narrated(priority,new RegExp('cooking priority to '+effective+'[.]'),'effective work priority');
  for(const forbidden of [true,true,false]){const r=await act({action:'forbid',thing:item.id,forbidden});check(r.ok,'forbid/allow failed');await narrated(r,forbidden?/^The core forbade/:/^The core allowed/,'forbid/allow');check((await read()).map.things.find(t=>t.id===item.id)?.forbidden===forbidden,'forbid state mismatch');if(forbidden&&receipts.at(-2)?.action==='forbid')check(r.detail==='no change','repeat forbid omitted no-change');}
  // Identical new requests really add two distinct bills AND two native history lines.
  const billAction={action:'bill',bench:bench.id,recipe:'CookMealSimple',repeat:'count',count:3};
  const bill1=await act(billAction),bill2=await act(billAction);check(bill1.ok&&bill2.ok&&bill1.id!==bill2.id,'distinct bill requests did not create distinct bills');
  // Both are already published: inspect the total in one assertion.
  check(bill1.narration===bill2.narration&&bill1.narrated==='shown'&&bill2.narrated==='shown','identical bill lines not accepted');
  expected.set(bill1.narration!, (expected.get(bill1.narration!)??0)+2);
  check(count((await messages()).archived,bill1.narration)===expected.get(bill1.narration!),'native messages coalesced distinct bills');
  const bills=(await read()).bills.find(x=>x.bench===bench.id)!.bills;check(bills.some(x=>x.loadId===bill1.id)&&bills.some(x=>x.loadId===bill2.id),'bill readback missing');
  const [p1,p2]=[s.pawns[0]!,s.pawns[1]!], [bed,previous]=beds;
  const initial=await act({action:'assign_bed',bed:previous!.id,pawn:p1.id});check(initial.ok,'previous-bed setup failed');await narrated(initial,/^The core (assigned|left)/,'previous bed');
  const assigned=await act({action:'assign_bed',bed:bed!.id,pawn:p1.id});check(assigned.ok&&assigned.detail?.includes('released bed '+previous!.id),'previous bed release absent');await narrated(assigned,/^The core assigned/,'assign bed');
  check((await read()).pawns.find(p=>p.id===p1.id)?.bed===bed!.id,'pawn does not own target bed');
  const same=await act({action:'assign_bed',bed:bed!.id,pawn:p1.id});check(same.ok&&same.detail==='no change','repeat assignment not no-change');await narrated(same,/already an owner/,'no-change bed');
  const displaced=await act({action:'assign_bed',bed:bed!.id,pawn:p2.id});check(displaced.ok&&displaced.detail?.includes('displaced:'),'displaced owner missing');await narrated(displaced,/no longer owns it/,'displacement');
  const after=await read();check(after.pawns.find(p=>p.id===p2.id)?.bed===bed!.id&&after.pawns.find(p=>p.id===p1.id)?.bed!==bed!.id,'displacement readback wrong');
  check(after.meta.tick===s.meta.tick,'paused check advanced game time');
  const archiveBefore=(await messages()).archived;const name='lab-concord-a1-'+Date.now();await b.save(name);await b.load(name);await b.admin('pause');restored=await read();
  check(JSON.stringify(restored.receipts)===JSON.stringify(after.receipts),'saved receipts changed after load');
  const archiveAfter=(await messages()).archived;for(const text of expected.keys())check(count(archiveAfter,text)===count(archiveBefore,text),'reload duplicated/lost archived narration: '+text);
  const retry=await act(action,placed.requestId);check(JSON.stringify(retry)===JSON.stringify(placed),'post-load retry changed receipt');
  check(JSON.stringify((await messages()).archived)===JSON.stringify(archiveAfter),'post-load retry changed message archive');
  notes.push('checkpoint '+name);
}catch(e){findings.push('error: '+String(e));await record('failure',String(e));}
finally{
  try{await new LabBridge().admin('pause');}catch(e){findings.push('cleanup pause failed: '+String(e));}
  const summary={runId,save,wallMs:Date.now()-t0,actions:receipts.length,uniqueNarratedRequests:new Set(receipts.filter(r=>r.narrated==='shown').map(r=>r.requestId)).size,findings,notes,passed:findings.length===0};
  await writeFile(prefix+'.json',JSON.stringify({summary,receipts,start,restored},null,1),{flag:'wx'});console.log(JSON.stringify(summary));if(!summary.passed)process.exitCode=1;
}
