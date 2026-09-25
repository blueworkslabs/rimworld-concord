/** Historical evaluation/rejection fixtures ONLY. Never import this adapter from runtime code. */
import type {Action,Pawn} from '../../src/protocol.js';
/** Retired ordered haul (Gate C, 2026-09-25): a read-only legacy record shape for stored
 * histories and frozen model-eval fixtures. Never offered, planned or dispatched: it is not an
 * Action. */
export type LegacyHaul = {kind:'haul';thing:string;x:number;z:number;count:number;trips:number;maxTicks:number};
/** Frozen model-eval fixtures only: the hauling view and readiness flag those historical pawn
 * perspectives carried. The mod no longer sends them. */
export type LegacyPawnFields = {hauling?:{epoch:string;tick:number;mapId?:number;status:'available'|'unavailable';options:LegacyHaul[];
  supplies?:{thing:string;label:string;x:number;z:number;sourceCount:number;destinationFree:number}[]};workReady?:boolean};
/** Frozen fixtures only: a retired ordered-haul record placed where an old perspective held an action. */
export const legacyAction=(a:LegacyHaul)=>a as unknown as Action;
/** Frozen fixtures only: read or author the legacy pawn fields of a historical perspective. */
export const legacyPawn=<T extends Pawn>(p:T)=>p as T&LegacyPawnFields;
