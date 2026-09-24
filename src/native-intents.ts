/** Native-intent agreements (docs/SPIKE_NATIVE_HAUL.md): the mod owns the tagged zone and
 * its ledger; the coordinator reads aggregate progress, decides core wakes and topic
 * outcomes, and asserts the invariants. No model call depends on per-trip events. */
import { z } from 'zod';

const Drop = z.object({seq:z.number().int(),tick:z.number().int(),count:z.number().int(),escape:z.number().int(),job:z.number().int(),
  kind:z.enum(['participation','incidental','unattributed','removed']),pawn:z.string().optional().default(''),source:z.string().optional().default(''),
  startedBeforeExclusion:z.boolean(),violation:z.boolean()});
export const IntentView = z.object({
  intentId:z.string().min(1),thingDef:z.string().optional().default(''),variant:z.string().optional().default(''),
  status:z.enum(['pending','open','met','expired','stopped']),
  zoneId:z.number().int(),quota:z.number().int(),delivered:z.number().int(),reserved:z.number().int(),remaining:z.number().int(),
  overshoot:z.number().int(),incidental:z.number().int(),unattributed:z.number().int(),removed:z.number().int(),
  violations:z.number().int(),rejectedStarts:z.number().int(),finishedAfterExclusion:z.number().int(),
  createdTick:z.number().int(),untilTick:z.number().int(),lastDeliveryTick:z.number().int(),
  accepted:z.array(z.string()),excluded:z.array(z.string()),
  byPawn:z.array(z.object({pawn:z.string(),count:z.number().int()})),drops:z.array(Drop)});
export type IntentView = z.infer<typeof IntentView>;

/** The candidate area is flat (x, z origin; w, h size), matching the bridge request. */
const Area = {x:z.number().int().nonnegative(),z:z.number().int().nonnegative(),w:z.number().int().min(1).max(8),h:z.number().int().min(1).max(8)};
export const HaulZone = z.object({kind:z.literal('haul-zone'),intentId:z.string().uuid(),thing:z.literal('WoodLog'),...Area,
  quota:z.number().int().min(1).max(75),maxTicks:z.number().int().min(600).max(60000),
  variant:z.enum(['exclusive','attribution'])}).strict();
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

/** Operator-frozen setup for the one shared intent the core may offer (fixture data). */
export const NativeHaulConfig = z.object({intentId:z.string().uuid(),area:z.object(Area).strict(),quota:z.number().int().min(1).max(75),
  maxTicks:z.number().int().min(600).max(60000),variant:z.enum(['exclusive','attribution'])}).strict();
export type NativeHaulConfig = z.infer<typeof NativeHaulConfig>;

/** Native capability decides whether the option exists at all: a pawn whose Hauling work
 * type is disabled is never offered hauling, and the reason is visible. */
export function notOfferedReason(own:{haulingCapable?:boolean}|undefined):string|undefined{
  if(!own)return 'unavailable';
  return own.haulingCapable===false?'cannot do hauling':undefined;
}
export function intentAction(c:NativeHaulConfig,quota=c.quota):HaulZone{
  return {kind:'haul-zone',intentId:c.intentId,thing:'WoodLog',...c.area,quota,maxTicks:c.maxTicks,variant:c.variant};
}
/** Validates a haul-zone offer against the frozen setup and the live intent. */
export function planIntentOffer(c:NativeHaulConfig|undefined,own:{haulingCapable?:boolean}|undefined,a:HaulZone,live?:IntentView){
  if(!c)throw Error('No native haul setup configured');
  const reason=notOfferedReason(own);if(reason)throw Error('Not offered: '+reason);
  if(a.intentId!==c.intentId||a.x!==c.area.x||a.z!==c.area.z||a.w!==c.area.w||a.h!==c.area.h||a.variant!==c.variant||a.maxTicks!==c.maxTicks)throw Error('Offer differs from the frozen intent setup');
  if(live&&live.status!=='pending'&&live.status!=='open')throw Error('Intent already closed: '+live.status);
  if(live&&live.status==='open'&&a.quota!==live.quota)throw Error('Quota is fixed after the first acceptance');
}
