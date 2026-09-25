import {z} from 'zod';
import {trimToFit} from '../prompt-limit.js';
/** The digest's own budget: the rest of the 24,000-byte prompt carries instructions, the task,
 * history and receipts (Fable, after the first capture). */
export const DIGEST_LIMIT=14000;

/** The harness's perception half (docs/HARNESS.md): the mod's read-only snapshot of the player's
 * picture (`perceive`), and the two conveniences computed here from snapshots, never from engine
 * hooks: `since` (a diff) and `look` (queries). `digest` is what a model is shown; the full
 * snapshot stays in the record. */
const id=z.number().int();
const Cell=z.object({x:z.number().int(),z:z.number().int()});
export const Thing=z.object({id,kind:z.string(),def:z.string(),label:z.string().nullable(),x:z.number().int(),z:z.number().int(),rot:z.number().int(),
  stack:z.number().int(),forbidden:z.boolean(),faction:z.string().nullable(),quality:z.string().optional(),hp:z.number().int().optional(),maxHp:z.number().int().optional(),
  builds:z.string().nullable().optional(),workDone:z.number().nullable().optional(),workToBuild:z.number().nullable().optional(),
  held:z.array(z.object({def:z.string(),count:z.number().int()})).optional(),growth:z.number().nullable().optional(),harvestable:z.boolean().optional(),
  nutrition:z.number().nullable().optional(),bed:z.boolean().optional(),medical:z.boolean().optional(),owners:z.number().int().optional(),workbench:z.boolean().optional()});
const Pawn=z.object({id,loadId:z.string(),name:z.string(),x:z.number().int(),z:z.number().int(),drafted:z.boolean(),downed:z.boolean(),
  job:z.object({def:z.string().nullable(),report:z.string().nullable(),target:id.optional()}),
  health:z.object({summary:z.number().nullable(),hediffs:z.array(z.object({label:z.string(),part:z.string().nullable(),severity:z.number().nullable(),bleeding:z.number().nullable()}))}),
  needs:z.array(z.object({def:z.string(),label:z.string(),level:z.number().nullable()})),
  mood:z.object({level:z.number().nullable().optional(),thoughts:z.array(z.object({label:z.string(),mood:z.number().nullable()})).optional()}),
  traits:z.array(z.string()),skills:z.array(z.object({def:z.string(),level:z.number().int(),passion:z.string(),disabled:z.boolean()})),
  work:z.array(z.object({def:z.string(),priority:z.number().int(),disabled:z.boolean()})),schedule:z.array(z.string()),
  carrying:z.object({id,def:z.string(),count:z.number().int()}).optional(),inventory:z.array(z.object({id,def:z.string(),count:z.number().int()})),bed:id});
export const Snapshot=z.object({
  meta:z.object({world:z.string(),epoch:z.string(),mapId:id,tick:id,snapshotId:id,format:z.literal('concord-perception-v1')}),
  time:z.object({tick:id,hour:id,dayOfSeason:id,quadrum:z.string(),season:z.string(),year:id,daysPassed:id,speed:z.string(),paused:z.boolean(),clock:z.string().nullable()}),
  weather:z.object({def:z.string().nullable(),label:z.string().nullable(),outdoorTemp:z.number().nullable()}),
  alerts:z.array(z.object({label:z.string(),priority:z.string(),type:z.string(),targets:z.array(id)})),
  letters:z.array(z.object({label:z.string(),def:z.string().nullable(),tick:id,text:z.string().nullable(),targets:z.array(id)})),
  resources:z.array(z.object({def:z.string(),label:z.string().nullable(),category:z.string().nullable(),count:id})),
  map:z.object({width:id,height:id,biome:z.string().nullable(),things:z.array(Thing)}),
  zones:z.array(z.object({id,label:z.string().nullable(),kind:z.string(),cells:z.array(Cell),priority:z.string().optional(),allowed:z.array(z.string()).optional(),
    contents:z.array(z.object({def:z.string(),count:id})).optional(),plant:z.string().nullable().optional(),allowSow:z.boolean().optional()})),
  bills:z.array(z.object({bench:id,benchDef:z.string(),x:id,z:id,bills:z.array(z.object({loadId:z.string(),recipe:z.string().nullable(),suspended:z.boolean(),ingredientRadius:z.number().nullable(),
    restrictedTo:id,slavesOnly:z.boolean().optional(),mechsOnly:z.boolean().optional(),nonMechsOnly:z.boolean().optional(),skillRange:z.object({min:id,max:id}).optional(),repeatMode:z.string().nullable().optional(),repeatCount:id.optional(),targetCount:id.optional(),paused:z.boolean().optional()}))})),
  designations:z.array(z.object({def:z.string(),thing:id.optional(),x:id.optional(),z:id.optional()})),
  research:z.object({project:z.string().nullable(),label:z.string().nullable(),progress:z.number().nullable()}),
  pawns:z.array(Pawn),
  threats:z.array(z.object({id,def:z.string(),label:z.string(),x:id,z:id,hostile:z.boolean(),manhunter:z.boolean(),predator:z.boolean(),downed:z.boolean()})),
  receipts:z.array(z.unknown()),
  omitted:z.array(z.string()),
});
export type Snapshot=z.infer<typeof Snapshot>;
export type SnapshotThing=z.infer<typeof Thing>;
export type SnapshotPawn=z.infer<typeof Pawn>;

// ---- since ----------------------------------------------------------------------------------
const band=(level:number|null|undefined)=>level==null?'unknown':level<0.2?'urgent':level<0.5?'low':'satisfied';
/** Resource thresholds a diff reports crossing (either way). */
export const RESOURCE_THRESHOLDS=[1,10,25,50,100,250,500,1000];
const crossed=(a:number,b:number)=>RESOURCE_THRESHOLDS.filter(t=>(a<t)!==(b<t));
export type Since={reset:true;reason:string}|{reset:false;fromTick:number;toTick:number;
  things:{appeared:SnapshotThing[];disappeared:{id:number;def:string;x:number;z:number}[];changed:{id:number;def:string;from:Partial<SnapshotThing>;to:Partial<SnapshotThing>}[]};
  alerts:{raised:string[];cleared:string[]};letters:{label:string;tick:number}[];
  bills:{added:string[];removed:string[];changed:string[]};zones:{added:number[];removed:number[];changed:number[]};
  pawns:{id:number;name:string;changes:string[]}[];resources:{def:string;from:number;to:number;crossed:number[]}[];designations:{added:number;removed:number}};
/** Diff between two snapshots of the same world, load and map; otherwise a reset (never compare stale IDs). */
export function since(prev:Snapshot,next:Snapshot):Since{
  if(prev.meta.world!==next.meta.world)return {reset:true,reason:'different world'};
  if(prev.meta.epoch!==next.meta.epoch)return {reset:true,reason:'the game was loaded since the previous snapshot'};
  if(prev.meta.mapId!==next.meta.mapId)return {reset:true,reason:'different map'};
  if(next.meta.tick<prev.meta.tick)return {reset:true,reason:'time went backwards'};
  const a=new Map(prev.map.things.map(t=>[t.id,t])),b=new Map(next.map.things.map(t=>[t.id,t]));
  const changed:{id:number;def:string;from:Partial<SnapshotThing>;to:Partial<SnapshotThing>}[]=[];
  for(const [k,t] of b){const o=a.get(k);if(!o)continue;const from:Partial<SnapshotThing>={},to:Partial<SnapshotThing>={};
    for(const f of new Set([...Object.keys(o),...Object.keys(t)])){if(f==='id')continue;const before=(o as any)[f],after=(t as any)[f];if(JSON.stringify(before)!==JSON.stringify(after)){(from as any)[f]=before??null;(to as any)[f]=after??null;}}
    if(Object.keys(to).length)changed.push({id:k,def:t.def,from,to});}
  const alertKey=(x:{type:string;label:string})=>x.type+':'+x.label;
  const pa=new Set(prev.alerts.map(alertKey)),na=new Set(next.alerts.map(alertKey));
  const letterKey=(l:{label:string;tick:number})=>l.tick+':'+l.label;const pl=new Set(prev.letters.map(letterKey));
  const billsOf=(s:Snapshot)=>new Map(s.bills.flatMap(x=>x.bills.map(bl=>[bl.loadId,JSON.stringify({...bl,bench:x.bench})] as const)));
  const pb=billsOf(prev),nb=billsOf(next);
  const zoneSig=(zz:Snapshot['zones'][number])=>JSON.stringify(zz);
  const pz=new Map(prev.zones.map(zz=>[zz.id,zoneSig(zz)])),nz=new Map(next.zones.map(zz=>[zz.id,zoneSig(zz)]));
  const pp=new Map(prev.pawns.map(p=>[p.id,p]));
  const pawns=next.pawns.map(p=>{const o=pp.get(p.id);const changes:string[]=[];if(!o)return {id:p.id,name:p.name,changes:['appeared']};
    if(o.job.def!==p.job.def)changes.push(`job ${o.job.def} -> ${p.job.def}`);
    else if(o.job.target!==p.job.target)changes.push('job target changed');
    for(const n of p.needs){const on=o.needs.find(x=>x.def===n.def);if(on&&band(on.level)!==band(n.level))changes.push(`${n.def} ${band(on.level)} -> ${band(n.level)}`);}
    if(band(o.mood.level)!==band(p.mood.level))changes.push(`mood ${band(o.mood.level)} -> ${band(p.mood.level)}`);
    if(JSON.stringify(o.health)!==JSON.stringify(p.health))changes.push('health changed');
    if(o.downed!==p.downed)changes.push(p.downed?'downed':'no longer downed');
    return {id:p.id,name:p.name,changes};}).filter(p=>p.changes.length);
  for(const o of prev.pawns)if(!next.pawns.some(p=>p.id===o.id))pawns.push({id:o.id,name:o.name,changes:['left the map or died']});
  const pr=new Map(prev.resources.map(r=>[r.def,r.count]));const resources:{def:string;from:number;to:number;crossed:number[]}[]=[];
  for(const r of next.resources){const from=pr.get(r.def)??0;const c=crossed(from,r.count);if(c.length)resources.push({def:r.def,from,to:r.count,crossed:c});pr.delete(r.def);}
  for(const [def,from] of pr){const c=crossed(from,0);if(c.length)resources.push({def,from,to:0,crossed:c});}
  const desKey=(d:Snapshot['designations'][number])=>d.def+':'+(d.thing??`${d.x},${d.z}`);const pd=new Set(prev.designations.map(desKey)),nd=new Set(next.designations.map(desKey));
  return {reset:false,fromTick:prev.meta.tick,toTick:next.meta.tick,
    things:{appeared:next.map.things.filter(t=>!a.has(t.id)),disappeared:prev.map.things.filter(t=>!b.has(t.id)).map(t=>({id:t.id,def:t.def,x:t.x,z:t.z})),changed},
    alerts:{raised:[...na].filter(k=>!pa.has(k)),cleared:[...pa].filter(k=>!na.has(k))},
    letters:next.letters.filter(l=>!pl.has(letterKey(l))).map(l=>({label:l.label,tick:l.tick})),
    bills:{added:[...nb.keys()].filter(k=>!pb.has(k)),removed:[...pb.keys()].filter(k=>!nb.has(k)),changed:[...nb.keys()].filter(k=>pb.has(k)&&pb.get(k)!==nb.get(k))},
    zones:{added:[...nz.keys()].filter(k=>!pz.has(k)),removed:[...pz.keys()].filter(k=>!nz.has(k)),changed:[...nz.keys()].filter(k=>pz.has(k)&&pz.get(k)!==nz.get(k))},
    pawns,resources,designations:{added:[...nd].filter(k=>!pd.has(k)).length,removed:[...pd].filter(k=>!nd.has(k)).length}};
}

// ---- look -----------------------------------------------------------------------------------
export const Look=z.discriminatedUnion('by',[
  z.object({by:z.literal('section'),section:z.enum(['zones','letters','bills','designations','research','weather','time','alerts','resources','threats','omitted','receipts'])}).strict(),
  z.object({by:z.literal('area'),x:z.number().int().optional(),z:z.number().int().optional(),thing:id.optional(),radius:z.number().min(0).max(60)}).strict(),
  z.object({by:z.literal('category'),category:z.enum(['food','wood','beds','workbenches','blueprints','items','buildings','plants','corpses'])}).strict(),
  z.object({by:z.literal('capability'),work:z.string().min(1)}).strict(),
  z.object({by:z.literal('pawn'),pawn:z.union([id,z.string().min(1)])}).strict(),
  z.object({by:z.literal('def'),def:z.string().min(1)}).strict(),
]);
export type Look=z.infer<typeof Look>;
const CATEGORY:Record<string,(t:SnapshotThing)=>boolean>={
  food:t=>t.kind==='item'&&(t.nutrition??0)>0,wood:t=>t.def==='WoodLog',beds:t=>!!t.bed,workbenches:t=>!!t.workbench,
  blueprints:t=>t.kind==='blueprint'||t.kind==='frame',items:t=>t.kind==='item',buildings:t=>t.kind==='building',plants:t=>t.kind==='plant',corpses:t=>t.kind==='corpse'};
/** A named filter over one snapshot: the slice the agent asked for, nothing else. */
export function look(s:Snapshot,raw:unknown){
  const q=Look.parse(raw);
  if(q.by==='section')return {query:q,meta:s.meta,value:s[q.section]};
  if(q.by==='area'){
    const anchor=q.thing!==undefined?[...s.map.things,...s.pawns,...s.threats].find(t=>t.id===q.thing):q.x!==undefined&&q.z!==undefined?{x:q.x,z:q.z}:undefined;
    if(!anchor)throw Error('look: area needs a known thing or a cell');
    const near=(t:{x:number;z:number})=>(t.x-anchor.x)**2+(t.z-anchor.z)**2<=q.radius**2;
    return {query:q,things:s.map.things.filter(near),pawns:s.pawns.filter(near).map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,job:p.job.def})),threats:s.threats.filter(near)};
  }
  if(q.by==='category'){const f=CATEGORY[q.category]!;return {query:q,things:s.map.things.filter(f)};}
  if(q.by==='def')return {query:q,things:s.map.things.filter(t=>t.def===q.def)};
  if(q.by==='capability'){
    const who=s.pawns.map(p=>({p,w:p.work.find(w=>w.def===q.work)})).filter(x=>x.w&&!x.w.disabled);
    return {query:q,pawns:who.map(({p,w})=>({id:p.id,name:p.name,priority:w!.priority,skill:p.skills.find(sk=>sk.def===q.work||(q.work==='Construction'&&sk.def==='Construction')||(q.work==='Cooking'&&sk.def==='Cooking'))?.level??null}))};
  }
  const p=s.pawns.find(x=>x.id===q.pawn||x.loadId===q.pawn||x.name===q.pawn);if(!p)throw Error('look: unknown pawn');
  return {query:q,pawn:p};
}

// ---- digest ---------------------------------------------------------------------------------
/** What the model is shown, within DIGEST_LIMIT. Loose items and plants are shown the way a player
 * sees them at a glance, aggregated by def (total, stacks, rough location), never as individual
 * stacks; `look` (by def, category or area) gives the stacks. Everything else is kept and fitted
 * with the shared loop, least relevant first (filth and corpse groups, far things, old letters,
 * zone cells, each pawn's weakest thoughts); the fitted note states what was left out. The caller
 * keeps the full snapshot in the record. */
const fitted=(t:Record<string,number>,fits:boolean,changed:boolean)=>({omitted:Object.fromEntries(Object.entries(t).filter(([,n])=>n>0)),fits,
  ...(changed?{note:'State was omitted to fit. Use look (by area, category, def, capability, pawn or section) to retrieve it.'}:{})});
type Group={def:string;label:string|null;total:number;stacks:number;forbidden:number;center:{x:number;z:number};box:{minX:number;minZ:number;maxX:number;maxZ:number};harvestable?:number};
export function aggregate(things:SnapshotThing[]):Group[]{
  const by=new Map<string,SnapshotThing[]>();for(const t of things){const l=by.get(t.def);if(l)l.push(t);else by.set(t.def,[t]);}
  return [...by.entries()].map(([def,l])=>{
    const g:Group={def,label:l[0]!.label,total:l.reduce((n,t)=>n+t.stack,0),stacks:l.length,forbidden:l.filter(t=>t.forbidden).length,
      center:{x:Math.round(l.reduce((n,t)=>n+t.x,0)/l.length),z:Math.round(l.reduce((n,t)=>n+t.z,0)/l.length)},
      box:{minX:Math.min(...l.map(t=>t.x)),minZ:Math.min(...l.map(t=>t.z)),maxX:Math.max(...l.map(t=>t.x)),maxZ:Math.max(...l.map(t=>t.z))}};
    if(l[0]!.kind==='plant')g.harvestable=l.filter(t=>t.harvestable).length;
    return g;
  }).sort((a,b)=>b.total-a.total||a.def.localeCompare(b.def));
}
/** A colonist the way the needs, health, character and work tabs show them, compacted for the
 * digest: every need and every thought is kept; `look` by pawn returns the full entry. */
export function compactPawn(p:SnapshotPawn){
  const r2=(n:number|null|undefined)=>n==null?null:Math.round(n*100)/100;
  const runs:string[]=[];p.schedule.forEach((a,h)=>{const last=runs.at(-1);const m=last?/^(\d+)-(\d+) (.+)$/.exec(last):null;
    if(m&&m[3]===a&&Number(m[2])===h-1)runs[runs.length-1]=`${m[1]}-${h} ${a}`;else runs.push(`${h}-${h} ${a}`);});
  return {id:p.id,name:p.name,x:p.x,z:p.z,...(p.drafted?{drafted:true}:{}),...(p.downed?{downed:true}:{}),
    job:p.job.report??p.job.def,health:r2(p.health.summary),hediffs:p.health.hediffs.map(h=>h.label+(h.part?` (${h.part})`:'')+((h.bleeding??0)>0?' bleeding':'')),
    needs:Object.fromEntries(p.needs.map(n=>[n.def,r2(n.level)])),mood:r2(p.mood.level??null),thoughts:(p.mood.thoughts??[]).map(t=>`${t.label} ${t.mood==null?'':(t.mood>0?'+':'')+Math.round(t.mood)}`.trim()),
    traits:p.traits,skills:Object.fromEntries(p.skills.filter(k=>!k.disabled).map(k=>[k.def,k.level+(k.passion==='None'?'':` ${k.passion}`)])),
    work:Object.fromEntries(p.work.filter(w=>w.priority>0).map(w=>[w.def,w.priority])),cannot:p.work.filter(w=>w.disabled).map(w=>w.def),
    schedule:runs,...(p.carrying?{carrying:`${p.carrying.count} ${p.carrying.def}`}:{}),...(p.inventory.length?{inventory:p.inventory.map(i=>`${i.count} ${i.def}`)}:{}),
    bed:p.bed>=0?p.bed:null};
}
const individual=(t:SnapshotThing)=>t.kind==='blueprint'||t.kind==='frame'||t.faction==='player'||!!t.bed||!!t.workbench;
export function digest(s:Snapshot,limit=DIGEST_LIMIT){
  const d:any=structuredClone(s);d.fitted=fitted({},true,false);
  const colony=d.pawns.length?{x:d.pawns.reduce((n:number,p:any)=>n+p.x,0)/d.pawns.length,z:d.pawns.reduce((n:number,p:any)=>n+p.z,0)/d.pawns.length}:{x:0,z:0};
  const dist=(t:{x:number;z:number})=>(t.x-colony.x)**2+(t.z-colony.z)**2;
  const of=(k:string)=>s.map.things.filter(t=>t.kind===k);
  d.map.items=aggregate(of('item'));d.map.plants=aggregate(of('plant'));
  // Least relevant groups first: the ones farthest from the colony.
  d.map.filth=aggregate(of('filth')).sort((a,b)=>dist(b.center)-dist(a.center));d.map.corpses=aggregate(of('corpse')).sort((a,b)=>dist(b.center)-dist(a.center));
  const rest=s.map.things.filter(t=>!['plant','filth','corpse','item'].includes(t.kind));
  // Unowned structures (natural rock, ruins) are scenery at a glance: grouped by def, farthest first.
  d.map.structures=aggregate(rest.filter(t=>!individual(t))).sort((a,b)=>dist(b.center)-dist(a.center));
  d.map.things=rest.filter(individual).sort((a,b)=>dist(b)-dist(a));
  d.map.note='items, plants and unowned structures are aggregated by def; look by def, category or area for individual things';
  d.pawns=s.pawns.map(compactPawn);
  // Zone geometry remains unless budget trimming explicitly removes cells.
  for(const z of d.zones)z.cellCount=z.cells.length;
  d.letters.sort((a:any,b:any)=>a.tick-b.tick);
  const r=trimToFit([['filthGroups',()=>d.map.filth,0],['corpseGroups',()=>d.map.corpses,0],['structureGroups',()=>d.map.structures,0],['plantGroups',()=>d.map.plants,5],
    ['things',()=>d.map.things,20],['letters',()=>d.letters,3],['zoneCells',()=>d.zones.find((z:any)=>z.cells.length)?.cells,0],['itemGroups',()=>d.map.items,10]] as const,
    ()=>Buffer.byteLength(JSON.stringify(d)),limit,{},t=>{d.fitted=fitted(t,false,true);});
  d.fitted=fitted(r.trimmed,r.fits,r.changed);
  return d as Omit<Snapshot,'map'>&{map:any;fitted:{omitted:Record<string,number>;fits:boolean;note?:string}};
}
