/** Quiet time and unused allowance are valid; an attempted failure is not. */
export function coreEventsInferencePassed(rounds:{result:{status:string};answer?:{status:string};pawnError?:string;proposal?:{decision?:{kind:string}}}[]){
 return rounds.length>=1&&rounds.length<=4&&rounds.every(r=>r.result.status==='applied'&&(!r.answer||['delivered','silent'].includes(r.answer.status))&&r.pawnError===undefined&&(!r.proposal||!!r.proposal.decision));
}
