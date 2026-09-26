/** Scripted harness walk-through of T1 (docs/HARNESS.md): exercises actions v1, receipts,
 * idempotency, refusals and the T1 checker on staging with a fixed script and zero model calls.
 * It is plumbing evidence for the harness, not the benchmark's harness arm (that one is a model). */
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {LabBridge} from '../src/lab-bridge.js';
import {checkT1} from '../src/harness/checker.js';
import type {Snapshot} from '../src/harness/perception.js';
import type {Receipt} from '../src/harness/actions.js';
import {startNative} from './native-run.js';
import assert from 'node:assert/strict';
if(process.env.CONCORD_HARNESS_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname;
const args=process.argv.slice(2);const save=args.find(a=>a.startsWith('--save='))?.slice(7);
if(!save||!/^lab-[a-zA-Z0-9-]+$/.test(save)||args.length!==1)throw Error('Usage: harness-t1-scripted --save=lab-...');
const deadline=Date.now()+17*60*1000;const b=new LabBridge(undefined,()=>deadline);
await mkdir(root+'/.runtime',{recursive:true});
const runId=randomUUID();const t0=Date.now();
const log:{receipts:Receipt[];reads:number;findings:string[];notes:string[]}={receipts:[],reads:0,findings:[],notes:[]};
let timeline:Snapshot['meta'];
let issued=0;
const act=async(action:unknown,requestId:string=randomUUID(),context=timeline)=>{
 const journal=root+`/.runtime/harness-t1-scripted-${runId}.actions.jsonl`;
 await appendFile(journal,JSON.stringify({event:'issued',at:new Date().toISOString(),action,requestId,timeline:context})+'\n');issued++;
 try{const r=await b.act(action,context,requestId);log.receipts.push(r);await appendFile(journal,JSON.stringify({event:'receipt',at:new Date().toISOString(),requestId,receipt:r})+'\n');return r;}
 catch(error){await appendFile(journal,JSON.stringify({event:'error',at:new Date().toISOString(),requestId,error:String(error),outcome:'may have executed; inspect state'})+'\n');throw error;}
};
const read=async()=>{log.reads++;return await b.perceive();};
let start:Snapshot|undefined,end:Snapshot|undefined,configured:Snapshot|undefined,result:unknown,checkpoint:unknown,restored:unknown;
try{
  await b.load(save);await b.admin('pause');
  start=await read();const s=start;timeline=s.meta;
  if(!s.pawns.length)throw Error('T1 needs colonists');
  const cx=Math.round(s.pawns.reduce((n,p)=>n+p.x,0)/s.pawns.length),cz=Math.round(s.pawns.reduce((n,p)=>n+p.z,0)/s.pawns.length);
  // Capable pawns build, cook and haul first; a disabled work type is refused by the game, which is fine.
  for(const p of s.pawns)for(const [work,priority] of [['Construction',1],['Cooking',1],['Hauling',2]] as const){const r=await act({action:'work_priority',pawn:p.id,work,priority});const disabled=p.work.find(w=>w.def===work)?.disabled;if(r.ok===!!disabled)throw Error('work-setting outcome disagrees with native capability');}
  // Refusals: an occupied cell (a pawn's own cell is often fine for a campfire, so use a wall or rock if any), and an unknown recipe.
  const rock=s.map.things.find(t=>t.kind==='building'&&t.faction!=='player');
  if(!rock)throw Error('occupied-cell refusal fixture absent');
  if(rock){const r=await act({action:'place_blueprint',def:'Campfire',x:rock.x,z:rock.z});if(r.ok||r.source!=='game')log.findings.push('placing on a rock/wall was not refused by the game: '+JSON.stringify(r));}
  // Place the campfire on the nearest cell the game accepts, spiralling out from the colonists.
  let placed:Receipt|undefined;const tried:Receipt[]=[];const reqId=randomUUID();
  outer:for(let radius=2;radius<12;radius++)for(let dx=-radius;dx<=radius;dx++)for(const dz of [-radius,radius]){
    const r=await act({action:'place_blueprint',def:'Campfire',x:cx+dx,z:cz+dz},reqId+'-'+radius+'-'+dx+'-'+dz);
    if(r.ok){placed=r;break outer;}tried.push(r);if(tried.length>40)break outer;
  }
  if(!placed)throw Error('no campfire placement accepted: '+tried.slice(-3).map(r=>r.reason).join(' | '));
  // Idempotency: the same request ID returns the same receipt and places nothing new.
  const again=await act({action:'place_blueprint',def:'Campfire',x:0,z:0},placed.requestId);
  if(JSON.stringify(again)!==JSON.stringify(placed))log.findings.push('repeated requestId returned a different receipt');
  const afterPlace=await read();
  if(afterPlace.map.things.filter(t=>t.kind==='blueprint'&&t.builds==='Campfire').length!==1)log.findings.push('expected exactly one campfire blueprint');
  await b.intent({op:'lab-speed',epoch:s.meta.epoch,count:3} as any);
  const until=async(ok:(x:Snapshot)=>boolean,ms:number)=>{const stop=Date.now()+ms;await startNative(b);try{while(Date.now()<stop){const x=await read();if(ok(x))return x;await delay(2000);}return undefined;}finally{await b.admin('pause');}};
  const built=await until(x=>x.map.things.some(t=>t.def==='Campfire'&&t.kind==='building'),300000);
  if(!built)throw Error('campfire not built within 300 s');
  const fire=built.map.things.find(t=>t.def==='Campfire'&&t.kind==='building')!;
  const bad=await act({action:'bill',bench:fire.id,recipe:'NoSuchRecipe',repeat:'count',count:3});if(bad.ok||bad.source!=='harness')log.findings.push('unknown recipe not refused by the harness');
  const bill=await act({action:'bill',bench:fire.id,recipe:'CookMealSimple',repeat:'count',count:3});if(!bill.ok)throw Error('bill refused: '+bill.reason);
  configured=await read();
  if(!configured.bills.some(b=>b.bench===fire.id&&b.bills.some(v=>v.loadId===bill.id&&v.repeatCount===3)))throw Error('configured bill did not retain count three');
  end=await until(x=>checkT1(s,x,configured).completed,600000)??await read();
  result=checkT1(s,end,configured);
  if(!(result as any).completed)log.findings.push('T1 not completed: '+(result as any).missing.join('; '));
  // Separate paused API checks after the task observation; not benchmark actions or T1 evidence.
  const staleAction={action:'work_priority',pawn:s.pawns[0]!.id,work:'Construction',priority:0};
  const stale=await act(staleAction,randomUUID(),{...timeline,epoch:'stale'});
  assert(!stale.ok&&stale.seq===0,'stale command must be rejected without a durable mutation');
  const beforeZones=await read();
  const badZone=await act({action:'zone',kind:'stockpile',cells:[{x:cx,z:cz}],allow:['WoodLog','NoSuchDef']});
  assert(!badZone.ok);assert.deepEqual((await read()).zones,beforeZones.zones,'invalid settings must not create or edit a zone');
  let stock:Receipt|undefined,grow:Receipt|undefined;
  for(const kind of ['stockpile','growing'] as const){
    for(let dx=-4;dx<=4;dx++){for(let dz=-4;dz<=4;dz++){
      const r=await act({action:'zone',kind,cells:[{x:cx+dx,z:cz+dz}],...(kind==='stockpile'?{allow:['WoodLog']}: {})});
      if(r.ok){if(kind==='stockpile')stock=r;else grow=r;break;}
    }if(kind==='stockpile'?stock:grow)break;}
    assert(kind==='stockpile'?stock:grow,'native zone fixture could not find one suitable cell');
  }
  let current=await read();const stockId=Number(stock!.id),growId=Number(grow!.id);
  assert.notEqual(stockId,growId);assert.equal(current.zones.find(z=>z.id===stockId)!.kind,'stockpile');assert.equal(current.zones.find(z=>z.id===growId)!.kind,'growing');
  const preserved=structuredClone(current.zones);
  assert(!(await act({action:'zone',zone:stockId,allow:['WoodLog','NoSuchDef']})).ok);
  assert.deepEqual((await read()).zones,preserved,'rejected compound edit changed filters');
  assert((await act({action:'zone',zone:stockId,allow:[]})).ok);
  assert.deepEqual((await read()).zones.find(z=>z.id===stockId)!.allowed,[],'empty allow means Disallow all');
  const testBill=await act({action:'bill',bench:fire.id,recipe:'CookMealSimple',repeat:'count',count:1});assert(testBill.ok);
  assert((await act({action:'bill_edit',bill:testBill.id!,count:5})).ok);
  current=await read();assert.equal(current.bills.flatMap(b=>b.bills).find(b=>b.loadId===testBill.id)!.repeatCount,5);
  assert((await act({action:'bill_edit',bill:testBill.id!,repeat:'forever'})).ok);
  assert(!(await act({action:'bill_edit',bill:testBill.id!,count:7})).ok);
  assert.equal((await read()).bills.flatMap(b=>b.bills).find(b=>b.loadId===testBill.id)!.repeatMode,'Forever');
  assert((await act({action:'bill_delete',bill:testBill.id!})).ok);
  const p=s.pawns[0]!;
  assert((await act({action:'schedule',pawn:p.id,hour:12,assignment:p.schedule[12]})).ok);
  assert((await act({action:'allow_area',pawn:p.id,area:null})).ok);
  const wood=(await read()).map.things.find(t=>t.def==='WoodLog');assert(wood);
  assert((await act({action:'forbid',thing:wood.id,forbidden:true})).ok);
  assert((await read()).map.things.find(t=>t.id===wood.id)!.forbidden);
  assert((await act({action:'forbid',thing:wood.id,forbidden:wood.forbidden})).ok);
  checkpoint=await read();const checkpointName='lab-concord-harness-'+Date.now();await b.save(checkpointName);await b.load(checkpointName);await b.admin('pause');
  const fresh=await read();restored=fresh;timeline=fresh.meta;
  assert.notEqual(fresh.meta.epoch,(checkpoint as Snapshot).meta.epoch,'reload needs a new epoch');
  assert.deepEqual(fresh.receipts,(checkpoint as Snapshot).receipts,'native save/load must retain receipts');
  assert.deepEqual(fresh.bills,(checkpoint as Snapshot).bills,'native save/load must retain bills');
  const retry=await act({action:'bill',bench:fire.id,recipe:'CookMealSimple',repeat:'count',count:1},testBill.requestId);
  assert.deepEqual(retry,testBill,'duplicate request must return saved receipt even after bill deletion');
  assert(!(await read()).bills.flatMap(b=>b.bills).some(b=>b.loadId===testBill.id),'retry recreated a deleted bill');
  log.notes.push('Post-task paused API checks and same-game-process save/load passed; checkpoint '+checkpointName);
  const latest=await read();const inSnapshot=latest.receipts.map(r=>r.requestId),floor=Math.min(...latest.receipts.map(r=>r.seq));if(!log.receipts.filter(r=>r.seq>=floor).every(r=>inSnapshot.includes(r.requestId)))log.findings.push('receipts missing from the snapshot');
}catch(e){log.findings.push('error: '+String(e));}
finally{
  try{await new LabBridge().admin('pause');}catch(e){log.findings.push('cleanup pause failed: '+String(e));}
  const summary={runId,save,wallMs:Date.now()-t0,actions:issued,receivedReceipts:log.receipts.length,refused:log.receipts.filter(r=>!r.ok).length,reads:log.reads,result,findings:log.findings,notes:log.notes,passed:log.findings.length===0};
  await writeFile(root+`/.runtime/harness-t1-scripted-${runId}.json`,JSON.stringify({summary,receipts:log.receipts,start,configured,end,checkpoint,restored},null,1),{flag:'wx'});
  console.log(JSON.stringify(summary));if(!summary.passed)process.exitCode=1;
}
