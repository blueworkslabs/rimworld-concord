import type {Domain} from './protocol.js';
export const RECONSIDER_TRIAL={decisions:6,appraisals:4,reflections:1,observationMs:120000,maxNativeTurns:96,maxModelTurns:1} as const;
/** A successful reflection, not an operator stop or ordinary failure, must own the change. */
export function rescueAfterWithdrawal(d:Domain,pawn:string,id:string,reflection:any,applied:boolean){
 const ch=d.characters[pawn],p=d.proposals[id];
 return !!(applied&&reflection?.output?.kind==='withdraw'&&reflection?.intention?.id===id&&
  reflection.intention.standing?.status==='running'&&p?.pawn===pawn&&p.action.kind==='haul'&&
  p.standing?.status==='stopped'&&p.standing.reason===reflection.output.reason&&ch&&!ch.intention&&!ch.commitment);
}
export function reconsiderSummary(d:Domain){
 const proposals=Object.values(d.proposals),outcomes=Object.values(d.outcomes);
 const ids=(kind:string)=>new Set(proposals.filter(p=>p.action.kind===kind).flatMap(p=>p.standing?.steps??[]));
 const hauling=ids('haul'),rescue=ids('rescue');
 return {proposals,outcomes,completedHaulTrips:outcomes.filter(r=>hauling.has(r.id)&&r.status==='completed').length,
 deliveredSteel:outcomes.filter(r=>hauling.has(r.id)).reduce((n,r)=>n+(r.delivered??0),0),
 completedRescues:outcomes.filter(r=>rescue.has(r.id)&&r.status==='completed').length,
 reflections:Object.values(d.characters).map(c=>({pawn:c.id,reflections:c.reflections??[],attention:c.attention}))};
}
