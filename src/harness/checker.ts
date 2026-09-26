import type {Snapshot} from './perception.js';

/** Shared observer-only checker. Neither arm supplies receipts or model testimony as proof. */
export type CheckResult={task:string;completed:boolean;evidence:Record<string,unknown>;missing:string[]};
/** Native bills retain remaining count, not completed-iteration history. Require an observed
 * count-three configuration and the same bill at zero, plus native meal-production records.
 * T1's common rules prohibit intervening count edits or unrelated cooking; the recording/input
 * audit must enforce those rules. These snapshots alone cannot certify their absence. */
export function checkT1(start:Snapshot,end:Snapshot,configured?:Snapshot):CheckResult{
 const missing:string[]=[];
 const same=(s:Snapshot)=>s.meta.world===start.meta.world&&s.meta.epoch===start.meta.epoch&&s.meta.mapId===start.meta.mapId;
 if(!same(end)||end.meta.tick<start.meta.tick||configured&&(!same(configured)||configured.meta.tick<start.meta.tick||configured.meta.tick>end.meta.tick))
  return {task:'T1',completed:false,evidence:{},missing:['snapshots must share a world, load and map with ordered ticks']};
 const before=new Set(start.map.things.map(t=>t.id));
 const campfires=end.map.things.filter(t=>t.def==='Campfire'&&t.kind==='building'&&t.faction==='player'&&!before.has(t.id));
 if(!campfires.length)missing.push('no campfire built during the run');
 const bills=(s:Snapshot)=>s.bills.flatMap(b=>b.bills.map(x=>({...x,bench:b.bench})));
 const startIds=new Set(bills(start).map(b=>b.loadId));
 const configuredBills=configured?bills(configured).filter(b=>b.recipe==='CookMealSimple'&&!startIds.has(b.loadId)&&b.repeatMode==='RepeatCount'&&b.repeatCount===3&&campfires.some(c=>c.id===b.bench)):[];
 if(!configuredBills.length)missing.push('no observed new three-iteration simple-meal bill on the new campfire');
 const done=bills(end).filter(b=>b.recipe==='CookMealSimple'&&b.repeatMode==='RepeatCount'&&b.repeatCount===0&&configuredBills.some(c=>c.loadId===b.loadId&&c.bench===b.bench));
 if(configuredBills.length&&!done.length)missing.push('the observed three-iteration bill has not counted down to zero');
 const a=new Map(start.pawns.map(p=>[p.id,p.records?.mealsCooked]));let delta=0,unknown=start.pawns.length!==end.pawns.length;
 for(const p of end.pawns){const n=p.records?.mealsCooked,old=a.get(p.id);if(n==null||old==null||n<old){unknown=true;continue;}delta+=n-old;}
 if(unknown)missing.push('comparable meal records unavailable');else if(delta<3)missing.push(`only ${delta} meals cooked since the start`);
 return {task:'T1',completed:missing.length===0,evidence:{campfires:campfires.map(c=>c.id),configuredBills:configuredBills.map(b=>b.loadId),completedBills:done.map(b=>b.loadId),mealsCookedSinceStart:unknown?null:delta,
  startTick:start.meta.tick,configuredTick:configured?.meta.tick??null,endTick:end.meta.tick,
  qualification:'Native state observations; the common recording/input audit must exclude intervening count edits and unrelated cooking.'},missing};
}
