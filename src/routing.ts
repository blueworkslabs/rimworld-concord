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
