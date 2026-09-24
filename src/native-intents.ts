/** Native-intent agreements (docs/SPIKE_NATIVE_HAUL.md): the mod owns the tagged zone and
 * its ledger; the coordinator reads aggregate progress, decides core wakes and topic
 * outcomes, and asserts the invariants. No model call depends on per-trip events. */
import { z } from 'zod';

const Drop = z.object({seq:z.number().int(),tick:z.number().int(),count:z.number().int(),escape:z.number().int(),job:z.number().int(),
  kind:z.enum(['participation','incidental','unattributed','removed','ordinary','pretag']),pawn:z.string().optional().default(''),source:z.string().optional().default(''),
  startedBeforeExclusion:z.boolean(),violation:z.boolean()});
export const IntentView = z.object({
  intentId:z.string().min(1),thingDef:z.string().optional().default(''),variant:z.string().optional().default(''),
  status:z.enum(['pending','open','met','expired','stopped']),
  zoneId:z.number().int(),quota:z.number().int(),delivered:z.number().int(),reserved:z.number().int(),remaining:z.number().int(),
  overshoot:z.number().int(),incidental:z.number().int(),unattributed:z.number().int(),removed:z.number().int(),
  violations:z.number().int(),rejectedStarts:z.number().int(),finishedAfterExclusion:z.number().int(),
  createdTick:z.number().int(),untilTick:z.number().int(),lastDeliveryTick:z.number().int(),
  /** Most pawns holding in-flight quota at once (overlap evidence); absent from older mods. */
  peakHolders:z.number().int().optional().default(0),
  /** Migration fields; absent from spike-era mods. */
  thingLabel:z.string().optional(),hold:z.string().optional(),label:z.string().optional(),zoneLabel:z.string().nullable().optional(),
  siteId:z.string().nullable().optional(),stopReason:z.string().nullable().optional(),archiveOpen:z.boolean().optional(),
  ordinaryUnattributed:z.number().int().optional(),ordinaryRemoved:z.number().int().optional(),
  ordinaryByPawn:z.array(z.object({pawn:z.string(),count:z.number().int()})).optional(),
  /** Event provenance: the intent's map (clock conversion uses it, never the viewed map). */
  mapId:z.number().int().optional(),
  /** Per-job evidence: hold, durable trip budget, and Fable's pre-tag mark. */
  jobs:z.array(z.object({job:z.number().int(),pawn:z.string(),hold:z.number().int(),trip:z.number().int(),preTag:z.boolean(),planned:z.number().int().optional()})).optional(),
  /** Hauls already on their way at tag time (never credited, never counted) and what they placed. */
  preTagAtStart:z.array(z.object({job:z.number().int(),pawn:z.string(),planned:z.number().int()})).optional(),
  preTagByPawn:z.array(z.object({pawn:z.string(),count:z.number().int()})).optional(),
  accepted:z.array(z.string()),excluded:z.array(z.string()),
  byPawn:z.array(z.object({pawn:z.string(),count:z.number().int()})),drops:z.array(Drop)});
export type IntentView = z.infer<typeof IntentView>;

/** The candidate area is flat (x, z origin; w, h size), matching the bridge request. */
const Area = {x:z.number().int().nonnegative(),z:z.number().int().nonnegative(),w:z.number().int().min(1).max(64),h:z.number().int().min(1).max(64)};
const ThingDefName=z.string().regex(/^[A-Za-z0-9_]{1,60}$/);
/** One shared stockpile haul. The migration generalizes the def and names the stockpile;
 * `zoneId` is the existing colony stockpile (-1 for an operator-declared candidate site,
 * whose rectangle is x/z/w/h). Spike-era actions without label/zoneId/hold stay readable. */
export const HaulZone = z.object({kind:z.literal('haul-zone'),intentId:z.string().uuid(),thing:ThingDefName,...Area,
  quota:z.number().int().min(1).max(75),maxTicks:z.number().int().min(600).max(60000),
  variant:z.enum(['exclusive','attribution']),label:z.string().trim().min(1).max(60).optional(),
  zoneId:z.number().int().min(-1).optional(),hold:z.enum(['strict','growing']).optional()}).strict();
export type HaulZone = z.infer<typeof HaulZone>;

/** Aggregate receipt: `overshoot` is the sum of escapes (participation beyond a reservation). */
export function progress(v:IntentView){
  return {delivered:v.delivered,quota:v.quota,overshoot:v.overshoot,incidental:v.incidental+v.unattributed,
    byPawn:Object.fromEntries(v.byPawn.map(p=>[p.pawn,p.count]))};
}

export type Wake = 'first-delivery'|'quota'|'expired'|'stopped'|'stall';
/** Core wakes on the intent's first delivery, quota reached, expiry, operator stop and stall
 * (no delivery for `stallTicks` while open). Per-trip deliveries never wake the core. */
export function intentWakes(prev:{view?:IntentView;tick:number},next:{view:IntentView;tick:number},stallTicks:number):Wake[]{
  if(!Number.isInteger(stallTicks)||stallTicks<1)throw Error('Invalid stall window');
  const p=prev.view,v=next.view,wakes:Wake[]=[];
  if((p?.delivered??0)===0&&v.delivered>0)wakes.push('first-delivery');
  if(p?.status!==v.status){
    if(v.status==='met')wakes.push('quota');
    if(v.status==='expired')wakes.push('expired');
    if(v.status==='stopped')wakes.push('stopped');
  }
  if(v.status==='open'){
    const since=Math.max(v.lastDeliveryTick,v.createdTick);
    // Fire once per quiet period: only when this poll crosses the threshold.
    if(next.tick-since>=stallTicks&&prev.tick-since<stallTicks)wakes.push('stall');
  }
  return wakes;
}

/** Topic closure on aggregate receipts: resolved only when the quota is met; a partial
 * expiry leaves the topic open for the core to re-offer or drop. Never a silent resolve. */
export function topicOutcome(v:IntentView):'open'|'resolved'|'expired'|'stopped'{
  return v.status==='met'?'resolved':v.status==='expired'?'expired':v.status==='stopped'?'stopped':'open';
}

/** Invariants the spike must hold; returned as findings, never clamped or hidden. */
export function invariantFindings(v:IntentView,opts:{escapeInjected?:boolean}={}):string[]{
  const f:string[]=[];
  if(v.violations>0)f.push(`consent violations: ${v.violations}`);
  if(v.overshoot>0&&!opts.escapeInjected)f.push(`quota escapes: ${v.overshoot}`);
  if(opts.escapeInjected&&v.overshoot===0)f.push('injected escape not detected');
  const credited=v.byPawn.reduce((a,p)=>a+p.count,0);
  if(credited!==v.delivered)f.push(`per-pawn credit ${credited} != delivered ${v.delivered}`);
  if(v.status==='open'&&v.delivered+v.reserved>v.quota&&!opts.escapeInjected)f.push('ledger exceeds quota while open');
  if(v.status!=='open'&&v.reserved!==0)f.push('reservations held after retirement');
  return f;
}

/** Counters are adoptable only before the first acceptance; afterwards they are recorded,
 * the pawn's standing stays none, and the core cannot adopt them. */
export function counterAdoptable(v:IntentView|undefined):boolean{return v===undefined||v.status==='pending';}

/** Spike-era singleton setup (kept for the frozen live-run harness and old stores). */
export const NativeHaulConfig = z.object({intentId:z.string().uuid(),area:z.object(Area).strict(),quota:z.number().int().min(1).max(75),
  maxTicks:z.number().int().min(600).max(60000),variant:z.enum(['exclusive','attribution'])}).strict();
export type NativeHaulConfig = z.infer<typeof NativeHaulConfig>;
/** Migration (B2/B5): the operator's list of stockpile hauls the core may offer. Each entry is
 * one (stockpile, def) intent: an existing colony stockpile (zoneId ≥ 0) or a candidate site. */
export const NativeHaulEntry = z.object({intentId:z.string().uuid(),thing:ThingDefName,label:z.string().trim().min(1).max(60),
  /** How the item is named in speech ("wood"); the def name stays in records. */
  thingLabel:z.string().trim().min(1).max(40).optional(),
  zoneId:z.number().int().min(-1),siteId:z.string().max(60).optional(),...Area,quota:z.number().int().min(1).max(75),
  maxTicks:z.number().int().min(600).max(60000),variant:z.enum(['exclusive','attribution']),hold:z.enum(['strict','growing'])}).strict()
  .refine(e=>e.zoneId>=0||e.w*e.h<=64,'A candidate site is at most 64 cells');
export type NativeHaulEntry = z.infer<typeof NativeHaulEntry>;
export function fromLegacy(c:NativeHaulConfig):NativeHaulEntry{
  return {intentId:c.intentId,thing:'WoodLog',thingLabel:'wood',label:'shared wood pile',zoneId:-1,siteId:'spike',...c.area,quota:c.quota,maxTicks:c.maxTicks,variant:c.variant,hold:'strict'};
}
/** The configured stockpile hauls (spike-era singleton stores become one entry). */
export function nativeEntries(d:{nativeHaul?:NativeHaulConfig;nativeHauls?:NativeHaulEntry[]}):NativeHaulEntry[]{
  return d.nativeHauls??(d.nativeHaul?[fromLegacy(d.nativeHaul)]:[]);
}
/** Entries in the fixed order the core sees them: label, def, then stable ids for ties. */
export function orderedEntries(entries:NativeHaulEntry[]):NativeHaulEntry[]{
  const key=(e:NativeHaulEntry)=>[e.label,e.thing,String(e.zoneId).padStart(8,'0'),e.siteId??'',e.intentId];
  return [...entries].sort((a,b)=>{const x=key(a),y=key(b);for(let i=0;i<x.length;i++){const c=x[i]!.localeCompare(y[i]!);if(c)return c;}return 0;});
}

/** Native capability decides whether the option exists at all: a pawn whose Hauling work
 * type is disabled is never offered hauling, and the reason is visible. */
export function notOfferedReason(own:{haulingCapable?:boolean}|undefined):string|undefined{
  if(!own)return 'unavailable';
  return own.haulingCapable===false?'cannot do hauling':undefined;
}
export function intentAction(c:NativeHaulConfig|NativeHaulEntry,quota=c.quota):HaulZone{
  if('area' in c)return {kind:'haul-zone',intentId:c.intentId,thing:'WoodLog',...c.area,quota,maxTicks:c.maxTicks,variant:c.variant};
  return {kind:'haul-zone',intentId:c.intentId,thing:c.thing,x:c.x,z:c.z,w:c.w,h:c.h,quota,maxTicks:c.maxTicks,variant:c.variant,label:c.label,zoneId:c.zoneId,hold:c.hold};
}
/** Validates a haul-zone offer against the frozen setup and the live intent. */
export function planIntentOffer(c:NativeHaulConfig|NativeHaulEntry[]|undefined,own:{haulingCapable?:boolean}|undefined,a:HaulZone,live?:IntentView){
  if(!c||Array.isArray(c)&&!c.length)throw Error('No native haul setup configured');
  const reason=notOfferedReason(own);if(reason)throw Error('Not offered: '+reason);
  const e=Array.isArray(c)?c.find(x=>x.intentId===a.intentId):undefined;
  if(Array.isArray(c)){
    if(!e)throw Error('Offer differs from the frozen intent setup');
    // Field by field: spike-era actions omit label/zoneId/hold and mean the defaults.
    if(a.thing!==e.thing||a.x!==e.x||a.z!==e.z||a.w!==e.w||a.h!==e.h||a.variant!==e.variant||a.maxTicks!==e.maxTicks||
      (a.label??e.label)!==e.label||(a.zoneId??-1)!==e.zoneId||(a.hold??'strict')!==e.hold)throw Error('Offer differs from the frozen intent setup');
  }else if(a.intentId!==c.intentId||a.x!==c.area.x||a.z!==c.area.z||a.w!==c.area.w||a.h!==c.area.h||a.variant!==c.variant||a.maxTicks!==c.maxTicks)throw Error('Offer differs from the frozen intent setup');
  if(live&&live.status!=='pending'&&live.status!=='open')throw Error('Intent already closed: '+live.status);
  if(live&&live.status==='open'&&a.quota!==live.quota)throw Error('Quota is fixed after the first acceptance');
}
