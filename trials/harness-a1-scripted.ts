/** Scripted check of phase 2 step A.1 (docs/PHASE2.md, docs/HARNESS.md): receipt-backed narration,
 * `assign_bed` and `forbid` both ways, on staging with a fixed script and zero model calls. The game
 * stays paused throughout; nothing needs to be built. Plumbing evidence, not a benchmark arm.
 * Lab-only `lab-messages` reads the game's own message lists to confirm each line reached the screen. */
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {LabBridge} from '../src/lab-bridge.js';
import type {Snapshot} from '../src/harness/perception.js';
import type {Receipt} from '../src/harness/actions.js';
if(process.env.CONCORD_HARNESS_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname;
const args=process.argv.slice(2);const save=args.find(a=>a.startsWith('--save='))?.slice(7);
if(!save||!/^lab-[a-zA-Z0-9-]+$/.test(save)||args.length!==1)throw Error('Usage: harness-a1-scripted --save=lab-...');
const b=new LabBridge(undefined,()=>Date.now()+120000);
await mkdir(root+'/.runtime',{recursive:true});
const runId=randomUUID(),t0=Date.now();
const findings:string[]=[],notes:string[]=[],receipts:Receipt[]=[];
const check=(ok:unknown,what:string)=>{if(!ok)findings.push(what);};
let timeline!:Snapshot['meta'];
const read=async()=>{const s=await b.perceive();timeline=s.meta;return s;};
const act=async(action:unknown,requestId:string=randomUUID())=>{const r=await b.act(action,timeline,requestId);receipts.push(r);return r;};
const messages=async()=>(await b.intent({op:'lab-messages',epoch:timeline.epoch})).receipt as {live:string[];archived:string[]};
/** One narrated line, shown once: on the receipt, marked shown, and in the game's message history. */
const narrated=async(r:Receipt,pattern:RegExp,what:string)=>{
  check(r.narration&&pattern.test(r.narration),what+': narration '+JSON.stringify(r.narration)+' does not match '+pattern);
  check(r.narrated==='shown',what+': narrated='+r.narrated);
  const m=await messages();const seen=m.archived.filter(t=>t===r.narration).length;
  check(seen===1,what+': line appears '+seen+' times in the message history');
};
let start:Snapshot|undefined,restored:Snapshot|undefined;
try{
  await b.load(save);await b.admin('pause');start=await read();const s=start;
  if(s.pawns.length<2)throw Error('needs two colonists');
  const cx=Math.round(s.pawns.reduce((n,p)=>n+p.x,0)/s.pawns.length),cz=Math.round(s.pawns.reduce((n,p)=>n+p.z,0)/s.pawns.length);

  // Refusal by the game: a blueprint on rock or a wall.
  const rock=s.map.things.find(t=>t.kind==='building'&&t.faction!=='player');
  if(rock){const r=await act({action:'place_blueprint',def:'Campfire',x:rock.x,z:rock.z});check(!r.ok&&r.source==='game','rock placement not refused by the game');
    await narrated(r,/^The game refused the core's request to place a campfire blueprint: /,'game refusal');}
  else notes.push('no rock/wall fixture; game-refusal line unexercised');
  // Refusal by the harness: a non-bed as a bed.
  const notBed=s.map.things.find(t=>t.kind==='building'&&!(t as any).bed);
  if(notBed){const r=await act({action:'assign_bed',bed:notBed.id,pawn:s.pawns[0]!.id});check(!r.ok&&r.source==='harness','non-bed not refused by the harness');
    await narrated(r,/^The core's request to assign a bed was not sent to the game \(harness check\): /,'harness refusal');}

  // Accepted placement at a cell the placement query offers, then the same request ID again.
  const q=await b.placement({by:'placement',def:'Campfire',x:cx,z:cz},timeline.epoch);
  const cell=q.ok?{x:q.x,z:q.z}:q.nearest[0];if(!cell)throw Error('placement query offered no campfire cell');
  const placed=await act({action:'place_blueprint',def:'Campfire',...cell});check(placed.ok,'offered campfire cell refused: '+placed.reason);
  await narrated(placed,/^The core placed a campfire blueprint (outdoors|indoors|in the )/,'placement');
  const again=await act({action:'place_blueprint',def:'Campfire',...cell},placed.requestId);
  check(JSON.stringify(again)===JSON.stringify(placed),'repeated request ID returned a different receipt');
  check((await messages()).archived.filter(t=>t===placed.narration).length===1,'repeated request ID showed its line again');

  // Work priority: the line reports the priority read back.
  const cook=s.pawns.find(p=>!p.work.find(w=>w.def==='Cooking')?.disabled);
  if(cook){const r=await act({action:'work_priority',pawn:cook.id,work:'Cooking',priority:1});check(r.ok,'cooking priority refused');
    await narrated(r,/^The core set .+'s cooking priority to 1/,'work priority');}

  // Forbid both ways on a loose item, with a no-change repeat in between.
  const item=(await read()).map.things.find(t=>t.kind==='item'&&!t.forbidden);
  if(!item)findings.push('no unforbidden loose item fixture');
  else{
    const f=await act({action:'forbid',thing:item.id,forbidden:true});check(f.ok,'forbid refused');await narrated(f,/^The core forbade the /,'forbid');
    check((await read()).map.things.find(t=>t.id===item.id)?.forbidden===true,'item not forbidden after accept');
    const same=await act({action:'forbid',thing:item.id,forbidden:true});check(same.ok&&same.detail==='no change','repeat forbid not reported as no change');
    await narrated(same,/\(no change: it already was\)\.$/,'no-change forbid');
    const a=await act({action:'forbid',thing:item.id,forbidden:false});check(a.ok,'allow refused');await narrated(a,/^The core allowed the .+ to be used/,'allow');
    check((await read()).map.things.find(t=>t.id===item.id)?.forbidden===false,'item still forbidden after allow');
  }

  // assign_bed: an ordinary colonist bed, then a second colonist onto a full single bed (native displacement).
  const beds=(await read()).map.things.filter(t=>(t as any).bed&&t.faction==='player'&&!(t as any).medical&&!(t as any).prisoner);
  if(!beds.length)notes.push('no colonist bed in this save; assign_bed accepted path unexercised here (use the T2 save)');
  else{
    const bed=beds[0]!,[p1,p2]=[s.pawns[0]!,s.pawns[1]!];
    const r1=await act({action:'assign_bed',bed:bed.id,pawn:p1.id});check(r1.ok,'assign_bed refused: '+r1.reason);
    await narrated(r1,/^The core assigned .+ to the /,'assign bed');
    check((await read()).pawns.find(p=>p.id===p1.id)?.bed===bed.id,'pawn does not own the bed after accept');
    const r2=await act({action:'assign_bed',bed:bed.id,pawn:p1.id});check(r2.ok&&r2.detail==='no change','repeat assignment not reported as no change');
    if((bed as any).slots===1){
      const r3=await act({action:'assign_bed',bed:bed.id,pawn:p2.id});check(r3.ok,'second assignment refused: '+r3.reason);
      check(/displaced: /.test(r3.detail??''),'displaced owner not reported: '+r3.detail);
      const after=await read();check(after.pawns.find(p=>p.id===p2.id)?.bed===bed.id&&after.pawns.find(p=>p.id===p1.id)?.bed!==bed.id,'native displacement not reflected');
      await narrated(r3,/no longer owns it/,'displacement');
    }else notes.push('first bed has '+(bed as any).slots+' slots; displacement unexercised');
  }

  // Save and reload: lines stay on the receipts and are not shown again.
  const before=await read();const shownBefore=(await messages()).live;
  const name='lab-concord-a1-'+Date.now();await b.save(name);await b.load(name);await b.admin('pause');
  restored=await read();
  check(JSON.stringify(restored.receipts)===JSON.stringify(before.receipts),'receipts (with narration) changed across save/load');
  const count=(list:string[],t:string)=>list.filter(x=>x===t).length,m=await messages();
  check(!restored.receipts.some(r=>r.narration&&count(m.live,r.narration)>count(shownBefore,r.narration)),'a narrated line was shown again after reload');
  const retry=await act({action:'place_blueprint',def:'Campfire',...cell},placed.requestId);
  check(JSON.stringify(retry)===JSON.stringify(placed),'retry after reload returned a different receipt');
  check(count((await messages()).live,placed.narration!)<=count(m.live,placed.narration!),'retry after reload showed the line again');
  notes.push('checkpoint '+name);
}catch(e){findings.push('error: '+String(e));}
finally{
  try{await new LabBridge().admin('pause');}catch(e){findings.push('cleanup pause failed: '+String(e));}
  const summary={runId,save,wallMs:Date.now()-t0,actions:receipts.length,narrated:receipts.filter(r=>r.narrated==='shown').length,findings,notes,passed:findings.length===0};
  await writeFile(root+`/.runtime/harness-a1-scripted-${runId}.json`,JSON.stringify({summary,receipts,start,restored},null,1),{flag:'wx'});
  console.log(JSON.stringify(summary));if(!summary.passed)process.exitCode=1;
}
