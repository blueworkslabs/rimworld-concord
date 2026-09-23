import type {Domain,GameState} from './protocol.js';
export type NeedBand='satisfied'|'low'|'urgent'|'unknown';
export type LinkStatus={source:'shared-link-telemetry';epoch:string;tick:number;food:NeedBand;rest:NeedBand};
export type SharedStatus=LinkStatus&{pawn:string;name:string;fresh:boolean};
const band=(x:unknown):NeedBand=>['satisfied','low','urgent'].includes(String(x))?x as NeedBand:'unknown';
/** Explicitly shared telemetry, never inferred from private facts or appearance.
 * Old epochs, future readings and observations older than 120 ticks are unknown. */
export function sharedStatus(d:Domain,g:GameState):SharedStatus[]{
 return Object.values(d.characters).map(c=>{
  const s=g.pawns.find(p=>p.id===c.id)?.linkStatus;
  const fresh=!!s&&s.source==='shared-link-telemetry'&&s.epoch===g.epoch&&Number.isInteger(s.tick)&&s.tick>=0&&s.tick<=g.ticks&&g.ticks-s.tick<=120;
  return {pawn:c.id,name:c.name,source:'shared-link-telemetry',epoch:g.epoch,tick:fresh?s!.tick:g.ticks,fresh,
   food:fresh?band(s!.food):'unknown',rest:fresh?band(s!.rest):'unknown'};
 });
}
