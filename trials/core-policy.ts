/** Deliberate wait/refusal/silence are valid; failed or missing inference is not. */
export function coreInferencePassed(rounds:{result:{status:string};answer?:{status:string};pawnError?:string;proposal?:{decision?:{kind:string}}}[]){
 return rounds.length===4&&rounds.every(r=>r.result.status==='applied'&&(!r.answer||['delivered','silent'].includes(r.answer.status))&&r.pawnError===undefined&&(!r.proposal||!!r.proposal.decision));
}
export function coreNativeWindow(scripted:boolean,round:number){
 if(!Number.isInteger(round)||round<0||round>3)throw Error('Invalid core round');
 return scripted?[0,0,30000,1000][round]!:30000;
}
