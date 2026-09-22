import type {Domain,Proposal} from './protocol.js';
/** Fixed experiment policy, not a general autonomy scheduler. */
export const WORK_TRIAL={decisions:12,appraisals:12,reflections:3,observationMs:300000,secondRoundMs:120000,maxTurns:48} as const;
export function laterOfferEligible(domain:Domain,pawn:string):boolean {
 const c=domain.characters[pawn];
 if(!c||c.commitment||c.intention)return false;
 const prior=Object.values(domain.proposals).filter(p=>p.pawn===pawn);
 // Refusal, unfinished negotiation, failure or withdrawal is not permission to ask again.
 if(!prior.length||prior.some(p=>p.status==='pending'||p.status==='refused'||p.status==='withdrawn'||(p.status==='countered'&&!p.replyId)))return false;
 const accepted=prior.filter(p=>p.status==='accepted');
 return accepted.length>0&&accepted.every(p=>p.standing?.status==='completed');
}
export function workSummary(domain:Domain){
 const proposals=Object.values(domain.proposals),outcomes=Object.values(domain.outcomes);
 return {decisions:proposals.filter(p=>p.decision).map(p=>({pawn:p.pawn,id:p.id,parentId:p.parentId,decision:p.decision,action:p.action})),
  outcomes,deliveredUnits:outcomes.reduce((n,r)=>n+(r.delivered??0),0),
  completedTrips:outcomes.filter(r=>r.status==='completed').length,
  stopped:proposals.filter(p=>p.standing?.status==='stopped').map(p=>({pawn:p.pawn,reason:p.standing?.reason})),
  intentions:proposals.filter(p=>p.standing).map(p=>({pawn:p.pawn,action:p.action,standing:p.standing})),
  reflections:Object.values(domain.characters).map(c=>({pawn:c.id,reflections:c.reflections??[],attention:c.attention}))};
}
