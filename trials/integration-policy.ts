/** Wall-clock window never banks unused time and is checked again at inference admission. */
export class IntegrationWindow {
 constructor(readonly durationMs:number,private now:()=>number=Date.now,private started=now()){
  if(!Number.isFinite(durationMs)||durationMs<=0||durationMs>300000)throw Error('Invalid integration window');
 }
 deadline(){return this.started+this.durationMs;}
 elapsed(){return this.now()-this.started;}
 ended(){return this.elapsed()>=this.durationMs;}
 laterDue(){return this.elapsed()>=this.durationMs/2;}
}

/** Absolute cutoff travels with each midpoint request; delayed transport cannot renew it. */
export function integrationHostAllowance(notAfter:unknown,now=Date.now()){
 if(notAfter===null)return 45000;
 if(typeof notAfter!=='number'||!Number.isSafeInteger(notAfter)||notAfter<=now)throw Error('Observation deadline elapsed or invalid');
 return Math.min(45000,notAfter-now);
}
/** After cleanup, failures still preserve paired physical/domain state if transport is usable. */
export async function preservePartial(passed:boolean,cleanupErrors:string[],save:()=>Promise<void>){
 if(!passed&&!cleanupErrors.length){await save();return true;}
 return false;
}
