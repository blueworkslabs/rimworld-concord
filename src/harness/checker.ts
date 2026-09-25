import type {Snapshot} from './perception.js';

/** Task checkers (docs/HARNESS.md, task set v1). A checker reads only the game state at the start
 * and at the end of a run, never the controller's messages or receipts, so both arms are judged
 * the same way. Each returns what it found and, if incomplete, what is missing. */
export type CheckResult={task:string;completed:boolean;evidence:Record<string,unknown>;missing:string[]};

/** T1: one campfire built, and a simple-meal bill configured during the run completed three
 * iterations. "Completed" is read from the game's own records: the new bill in repeat-count mode
 * is at zero, and the colonists' Records tab shows at least three meals cooked since the start
 * (consumption afterwards is allowed, so meals on the ground are not counted). */
export function checkT1(start:Snapshot,end:Snapshot):CheckResult{
  const missing:string[]=[];
  if(start.meta.world!==end.meta.world||start.meta.mapId!==end.meta.mapId)return {task:'T1',completed:false,evidence:{},missing:['start and end snapshots are not the same world and map']};
  const before=new Set(start.map.things.map(t=>t.id));
  const campfires=end.map.things.filter(t=>t.def==='Campfire'&&t.kind==='building'&&t.faction==='player'&&!before.has(t.id));
  if(!campfires.length)missing.push('no campfire built during the run');
  const startBills=new Set(start.bills.flatMap(b=>b.bills.map(x=>x.loadId)));
  const newBills=end.bills.flatMap(b=>b.bills.map(x=>({...x,bench:b.bench,benchDef:b.benchDef}))).filter(x=>x.recipe==='CookMealSimple'&&!startBills.has(x.loadId));
  const done=newBills.filter(x=>x.repeatMode==='RepeatCount'&&x.repeatCount===0);
  if(!newBills.length)missing.push('no simple-meal bill configured during the run');
  else if(!done.length)missing.push('the new simple-meal bill has not counted down to zero');
  const cooked=(s:Snapshot)=>new Map(s.pawns.map(p=>[p.id,p.records?.mealsCooked]));
  const a=cooked(start),b=cooked(end);let delta=0,unknown=false;
  for(const [pid,n] of b){if(n==null){unknown=true;continue;}delta+=n-(a.get(pid)??0);}
  if(unknown)missing.push('meal records unavailable');
  else if(delta<3)missing.push(`only ${delta} meals cooked since the start`);
  return {task:'T1',completed:missing.length===0,
    evidence:{campfires:campfires.map(c=>c.id),bills:newBills.map(x=>({loadId:x.loadId,bench:x.bench,repeatMode:x.repeatMode,repeatCount:x.repeatCount})),mealsCookedSinceStart:unknown?null:delta,
      startTick:start.meta.tick,endTick:end.meta.tick},missing};
}
