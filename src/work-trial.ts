import type {Domain,Proposal} from './protocol.js';
/** Fixed experiment policy, not a general autonomy scheduler. */
export const WORK_TRIAL={decisions:12,appraisals:12,reflections:3,observationMs:300000,secondRoundMs:120000,maxTurns:48} as const;
export function trialCounterSupported(p:Proposal):boolean {return p.status==='countered'&&p.decision?.kind==='counter'&&p.decision.action.kind==='haul';}
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

/** Failed inference must not leave an offer available for a later automatic retry.
 * Preserve accepted/countered/refused decisions if transport failed afterward. */
export async function retireUndecided(c:import('./coordinator.js').Coordinator,id:string,reason:string){
 if(c.inspect().proposals[id]?.status==='pending')await c.core().withdrawOffer(id,reason);
}
/** One shutdown path for deadline, normal completion and exceptions. */
export class WorkShutdown {
 stopped=false;
 later?:Promise<void>;
 private completion?:Promise<void>;
 constructor(private close:()=>void,private stopAttention:()=>Promise<void>,private drainHost:()=>Promise<void>){}
 stop():Promise<void>{
  if(this.completion)return this.completion;
  this.stopped=true;this.close();
  this.completion=(async()=>{await this.stopAttention();await this.later;await this.drainHost();})();
  return this.completion;
 }
}

/** Attempt every owned stop even if another cleanup request failed. Unknown transport
 * outcomes remain errors, never an assertion that executable work was retired. */
export async function stopTrialWork(c:import('./coordinator.js').Coordinator){
 const operatorStops:string[]=[],errors:string[]=[];
 const attempt=async(fn:()=>Promise<unknown>)=>{try{await fn();}catch(e){errors.push(String(e));}};
 if(!c.inspect())return {operatorStops,errors};
 await attempt(()=>c.reconcile());
 for(const ch of Object.values(c.inspect().characters))if(ch.intention){
  operatorStops.push(ch.id);await attempt(()=>c.pawn(ch.id).withdraw('Operator trial ended; not a pawn-originated choice'));
 }
 for(const p of Object.values(c.inspect().proposals))if(p.status==='pending')
  await attempt(()=>c.core().withdrawOffer(p.id,'Operator trial ended; offer retired without acceptance'));
 await attempt(()=>c.reconcile());
 for(const ch of Object.values(c.inspect().characters))if(ch.commitment)errors.push('Executable commitment still unresolved: '+ch.id);
 return {operatorStops,errors};
}
