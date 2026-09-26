import type {z} from 'zod';
import type {Snapshot} from './perception.js';
import type {T2Rules,T3Rules} from './benchmark-task.js';
import type {CheckResult} from './checker.js';
const key=(c:{x:number;z:number})=>`${c.x},${c.z}`;
function timeline(start:Snapshot,end:Snapshot,history:Snapshot[]){
 let tick=start.meta.tick;return [...history,end].every(s=>{const ordered=s.meta.tick>=tick;tick=s.meta.tick;return ordered&&s.meta.world===start.meta.world&&s.meta.epoch===start.meta.epoch&&s.meta.mapId===start.meta.mapId&&s.meta.tick>=start.meta.tick&&s.meta.tick<=end.meta.tick;});
}
const roster=(s:Snapshot,ids:number[])=>s.pawns.length===ids.length&&new Set(s.pawns.map(p=>p.id)).size===ids.length&&ids.every(id=>s.pawns.some(p=>p.id===id));
const failure=(task:string,reason:string):CheckResult=>({task,completed:false,evidence:{},missing:[reason]});
const food=(p:Snapshot['pawns'][number])=>p.needs.find(n=>n.def==='Food')?.level;
/** A witnessed simultaneous state by the disclosed deadline, not an order or model claim.
 * Sleep is secondary: only actually observed sleeping in a built bed, not inferred from assignment. */
export function checkT2(start:Snapshot,end:Snapshot,r:z.infer<typeof T2Rules>,history:Snapshot[]=[]):CheckResult{
 if(!timeline(start,end,history))return failure('T2','snapshots must share world/load/map and ordered ticks');
 if(!roster(start,r.pawnIds)||start.meta.tick>=r.deadlineTick||start.pawns.some(p=>p.bed>=0||food(p)==null||(food(p)??-1)>=r.foodMinimum)||start.map.things.some(t=>t.bed))return failure('T2','frozen start must have the three specified unfed pawns and no beds');
 const states=[...history,end];
 const eligible=(s:Snapshot)=>s.meta.tick<=r.deadlineTick&&roster(s,r.pawnIds)&&s.pawns.every(p=>!p.downed);
 const beds=(s:Snapshot)=>s.map.things.filter(t=>t.kind==='building'&&['Bed','DoubleBed','RoyalBed'].includes(t.def)&&t.bed===true&&t.faction==='player'&&!t.forbidden&&t.medical===false&&t.prisoner===false&&t.slave===false&&t.slots!=null&&t.slots>0);
 const match=states.find(s=>eligible(s)&&s.pawns.every(p=>food(p)!=null&&(food(p)??-1)>=r.foodMinimum&&beds(s).some(b=>b.id===p.bed&&s.pawns.filter(q=>q.bed===b.id).length<=b.slots!&&b.owners!=null&&b.owners>=s.pawns.filter(q=>q.bed===b.id).length&&b.owners<=b.slots!)));
 const observedSleep=r.pawnIds.filter(id=>states.some(s=>eligible(s)&&s.pawns.some(p=>p.id===id&&p.asleep===true&&beds(s).some(b=>b.id===p.currentBed))));
 return {task:'T2',completed:!!match,evidence:{startTick:start.meta.tick,deadlineTick:r.deadlineTick,completionObservedTick:match?.meta.tick??null,foodMinimum:r.foodMinimum,pawns:(match??end).pawns.map(p=>({id:p.id,food:food(p),assignedBed:p.bed})),observedAsleepInBed:observedSleep,unobservedSleep:r.pawnIds.filter(id=>!observedSleep.includes(id)),qualification:'Sleep is observed-only, not a continuous history or a primary requirement.'},missing:match?[]:['no observed simultaneous fed state with suitable beds assigned to all three pawns by the deadline']};
}
/** Net physical wood in the exact disclosed cells, in storage and roofed/non-outdoor.
 * Frozen fixture supplies all 120 loose wood; no controller-provided totals or cargo count. */
export function checkT3(start:Snapshot,end:Snapshot,r:z.infer<typeof T3Rules>,history:Snapshot[]=[]):CheckResult{
 if(!timeline(start,end,history))return failure('T3','snapshots must share world/load/map and ordered ticks');
 const target=new Set(r.cells.map(key));const wood=(s:Snapshot)=>s.map.things.filter(t=>t.kind==='item'&&t.def==='WoodLog');
 if(!roster(start,r.pawnIds)||start.meta.tick>=r.deadlineTick||wood(start).reduce((n,t)=>n+t.stack,0)!==r.initialWood||wood(start).some(t=>target.has(key(t)))||start.pawns.some(p=>p.carrying?.def==='WoodLog'||p.inventory.some(t=>t.def==='WoodLog')))return failure('T3','frozen start must have the specified crew, initial loose wood total, empty destination and no carried/inventory wood');
 const count=(s:Snapshot)=>{const storage=new Set(s.zones.filter(z=>z.kind==='stockpile'&&z.allowed?.includes('WoodLog')).flatMap(z=>z.cells.map(key)));return wood(s).filter(t=>target.has(key(t))&&storage.has(key(t))&&t.roofed===true&&t.outdoors===false).reduce((n,t)=>n+t.stack,0);};
 const states=[...history,end];
 const match=states.find(s=>s.meta.tick<r.deadlineTick&&roster(s,r.pawnIds)&&count(s)>=r.woodRequired);
 return {task:'T3',completed:!!match,evidence:{startTick:start.meta.tick,deadlineTick:r.deadlineTick,completionObservedTick:match?.meta.tick??null,woodRequired:r.woodRequired,woodInside:count(match??end),initialWood:r.initialWood,cells:r.cells,qualification:'Physical roofed, non-outdoor stockpile contents; excludes carried wood. Input audit excludes prohibited interventions.'},missing:match?[]:['no observed required wood inside the specified indoor stockpile by the deadline']};
}
