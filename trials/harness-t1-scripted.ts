/** Scripted harness walk-through of T1 (docs/HARNESS.md): exercises actions v1, receipts,
 * idempotency, refusals and the T1 checker on staging with a fixed script and zero model calls.
 * It is plumbing evidence for the harness, not the benchmark's harness arm (that one is a model). */
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {LabBridge} from '../src/lab-bridge.js';
import {checkT1} from '../src/harness/checker.js';
import type {Snapshot} from '../src/harness/perception.js';
import type {Receipt} from '../src/harness/actions.js';
import {startNative} from './native-run.js';
if(process.env.CONCORD_HARNESS_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname;
const args=process.argv.slice(2);const save=args.find(a=>a.startsWith('--save='))?.slice(7);
if(!save||args.length!==1)throw Error('Usage: harness-t1-scripted --save=lab-...');
const b=new LabBridge(undefined,()=>Date.now()+120000);
const runId=randomUUID();const t0=Date.now();
const log:{receipts:Receipt[];reads:number;findings:string[];notes:string[]}={receipts:[],reads:0,findings:[],notes:[]};
const act=async(action:unknown,requestId=randomUUID())=>{const r=await b.act(action,requestId);log.receipts.push(r);return r;};
const read=async()=>{log.reads++;return await b.perceive();};
let start:Snapshot|undefined,end:Snapshot|undefined,result:unknown;
try{
  await b.load(save);await b.admin('pause');
  start=await read();const s=start;
  const cx=Math.round(s.pawns.reduce((n,p)=>n+p.x,0)/s.pawns.length),cz=Math.round(s.pawns.reduce((n,p)=>n+p.z,0)/s.pawns.length);
  // Capable pawns build, cook and haul first; a disabled work type is refused by the game, which is fine.
  for(const p of s.pawns)for(const [work,priority] of [['Construction',1],['Cooking',1],['Hauling',2]] as const)await act({action:'work_priority',pawn:p.id,work,priority});
  // Refusals: an occupied cell (a pawn's own cell is often fine for a campfire, so use a wall or rock if any), and an unknown recipe.
  const rock=s.map.things.find(t=>t.kind==='building'&&t.faction!=='player');
  if(rock){const r=await act({action:'place_blueprint',def:'Campfire',x:rock.x,z:rock.z});if(r.ok||r.source!=='game')log.findings.push('placing on a rock/wall was not refused by the game: '+JSON.stringify(r));}
  // Place the campfire on the nearest cell the game accepts, spiralling out from the colonists.
  let placed:Receipt|undefined;const tried:Receipt[]=[];const reqId=randomUUID();
  outer:for(let radius=2;radius<12;radius++)for(let dx=-radius;dx<=radius;dx++)for(const dz of [-radius,radius]){
    const r=await b.act({action:'place_blueprint',def:'Campfire',x:cx+dx,z:cz+dz},reqId+'-'+radius+'-'+dx+'-'+dz);log.receipts.push(r);
    if(r.ok){placed=r;break outer;}tried.push(r);if(tried.length>40)break outer;
  }
  if(!placed)throw Error('no campfire placement accepted: '+tried.slice(-3).map(r=>r.reason).join(' | '));
  // Idempotency: the same request ID returns the same receipt and places nothing new.
  const again=await b.act({action:'place_blueprint',def:'Campfire',x:0,z:0},placed.requestId);
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
  end=await until(x=>checkT1(s,x).completed,600000)??await read();
  result=checkT1(s,end);
  if(!(result as any).completed)log.findings.push('T1 not completed: '+(result as any).missing.join('; '));
  const inSnapshot=end.receipts.map(r=>r.requestId);if(!log.receipts.filter(r=>r.ok).every(r=>inSnapshot.includes(r.requestId)||end!.receipts.length>=64))log.findings.push('receipts missing from the snapshot');
}catch(e){log.findings.push('error: '+String(e));}
finally{
  try{await b.admin('pause');}catch{}
  const summary={runId,save,wallMs:Date.now()-t0,actions:log.receipts.length,refused:log.receipts.filter(r=>!r.ok).length,reads:log.reads,result,findings:log.findings,passed:log.findings.length===0};
  await writeFile(root+`/.runtime/harness-t1-scripted-${runId}.json`,JSON.stringify({summary,receipts:log.receipts,start,end},null,1));
  console.log(JSON.stringify(summary));if(!summary.passed)process.exitCode=1;
}
