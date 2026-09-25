/** Routing policy for captured native events; execution remains separately authorized. */
export type Trigger = {urgent:boolean;significant:boolean;conflictsWithCommitment:boolean;routine:boolean};
export type Route = 'native'|'appraisal'|'deliberation';
export function route(event:Trigger):{immediate:'native'|null;next:Route} {
  // An urgent native reaction must not suppress later reflection on that same event.
  const next=event.significant || event.conflictsWithCommitment ? 'deliberation' : event.routine?'native':'appraisal';
  return {immediate:event.urgent?'native':null,next};
}
export interface Appraisal {
  choice:'continue'|'act'|'deliberate'; confidence:number;
}
/** Gates consequential uncertainty; ties among harmless alternatives need not wake an LLM. */
export function afterAppraisal(a:Appraisal,threshold:number,consequential:boolean):Route {
  if(!Number.isFinite(a.confidence) || a.confidence<0 || a.confidence>1 || threshold<0 || threshold>1 || !Number.isFinite(threshold)) throw Error('Invalid confidence/threshold');
  if(a.choice==='deliberate' || (consequential && a.confidence<threshold)) return 'deliberation';
  return 'native'; // a selected intention still needs normal action validation
}

export const NATIVE_KINDS=new Set(['job-start','job-end','ingested','haul-delivered','quota-escape',
 'intent-opened','intent-excluded','intent-incidental','intent-ordinary','intent-admitted-start','intent-rejected-start','intent-retired','intent-trued-up','lab-fault','lab-drafted']);

/** Known low-stakes conversations wait without losing their attention record.
 * Other memories remain conservative; this is not general semantic appraisal.
 */
export function nativeAttention(event:{kind:string;detail:string}):{next:Route;interrupt:boolean} {
 // Observation updates memory without waking a model or cancelling unrelated thought.
 // Pending rescue questions still use their own fresh-subject invalidation checks.
 if(event.kind==='casualty-recovered')return {next:'native',interrupt:false};
 // Native-intent hooks (docs/RIMWORLD_INTERNALS.md#routing-for-new-event-kinds): texture and
 // receipts, never a per-event wake. Intent wakes (first delivery, quota, expiry, stall) are
 // decided separately from aggregate progress in native-intents.ts.
 if(NATIVE_KINDS.has(event.kind))return {next:'native',interrupt:false};
 if(event.kind==='interaction'){
  const quiet=['Chitchat','DeepTalk'].includes(event.detail);
  return {next:'deliberation',interrupt:!quiet};
 }
 const significant=event.kind==='memory'||event.kind==='health'||event.kind==='casualty';
 return {next:route({urgent:event.kind==='health',significant,conflictsWithCommitment:false,routine:event.kind==='job'}).next,
   interrupt:significant&&!(event.kind==='memory'&&['Chitchat','DeepTalk'].includes(event.detail))};
}

/** A memory about eating (RimWorld thought defs Ate…, e.g. AteWithoutTable). */
export const isFoodMemory=(event:{kind:string;detail:string})=>event.kind==='memory'&&/^Ate[A-Z]/.test(event.detail);

/** Stored event routing is historical evidence; current quiet-memory policy also
 * applies to attention restored from before that policy was introduced. */
export function attentionInterrupt(e:{event:{kind:string;detail:string};interrupt?:boolean}):boolean {
 if(e.event.kind==='memory'&&['Chitchat','DeepTalk'].includes(e.event.detail))return false;
 return e.interrupt??nativeAttention(e.event).interrupt;
}
