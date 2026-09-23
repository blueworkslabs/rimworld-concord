/** Frozen three-run allowance; nothing schedules extra calls to fill it. */
export const CAMPFIRE_POLICY={runs:3,coreCalls:8,pawnCalls:12,jevCalls:0,nativeMs:600000,wallMs:1500000,cooldownTicks:60,windowTicks:36000} as const;
export function campfireInferencePassed(rounds:{result:{status:string};answer?:{status:string};pawnError?:string;proposal?:{decision?:{kind:string}}}[]){
 return rounds.length>=1&&rounds.length<=CAMPFIRE_POLICY.coreCalls&&rounds.every(r=>r.result.status==='applied'&&(!r.answer||['delivered','silent'].includes(r.answer.status))&&r.pawnError===undefined&&(!r.proposal||!!r.proposal.decision));
}
export function campfireDecisionMs(remaining:number){if(!Number.isFinite(remaining)||remaining<=0)throw Error('Native observation window ended');return Math.max(1,Math.min(45000,Math.floor(remaining)));}
