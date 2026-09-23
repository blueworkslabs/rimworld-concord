/** One independently bounded follow-up, never a reroll of campfire-v1. */
export const CORE_FOLLOWUP_POLICY={coreCalls:4,pawnCalls:5,jevCalls:0,nativeMs:120000,scriptedNativeMs:15000,wallMs:900000,cooldownTicks:60,windowTicks:18000} as const;
export const FOOD_FOLLOWUP_POLICY={...CORE_FOLLOWUP_POLICY,coreCalls:6,pawnCalls:6} as const;
export function coreFollowupPolicy(id:string){
 if(id==='core-followup-v1')return {...CORE_FOLLOWUP_POLICY,coreTrial:'core-followup-core-v1' as const,pawnTrial:'core-followup-pawns-v1' as const};
 if(id==='food-followup-v1')return {...FOOD_FOLLOWUP_POLICY,coreTrial:'food-followup-core-v1' as const,pawnTrial:'food-followup-pawns-v1' as const};
 if(id==='recovery-followup-v1')return {...FOOD_FOLLOWUP_POLICY,coreTrial:'recovery-followup-core-v1' as const,pawnTrial:'recovery-followup-pawns-v1' as const};
 if(id==='identity-followup-v1')return {...FOOD_FOLLOWUP_POLICY,coreTrial:'identity-followup-core-v1' as const,pawnTrial:'identity-followup-pawns-v1' as const};
 throw Error('Unknown follow-up policy');
}
export function followupInferencePassed(rounds:{result:{status:string};answer?:{status:string};pawnError?:string;proposal?:{decision?:{kind:string}}}[],maxAttempts:number=CORE_FOLLOWUP_POLICY.coreCalls){return rounds.length>=1&&rounds.length<=maxAttempts&&rounds.every(r=>r.result.status==='applied'&&(!r.answer||['delivered','silent'].includes(r.answer.status))&&r.pawnError===undefined&&(!r.proposal||!!r.proposal.decision));}
