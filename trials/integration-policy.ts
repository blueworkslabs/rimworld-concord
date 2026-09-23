/** Wall-clock window never banks unused time and is checked again at inference admission. */
export class IntegrationWindow {
 constructor(readonly durationMs:number,private now:()=>number=Date.now,private started=now()){
  if(!Number.isFinite(durationMs)||durationMs<=0||durationMs>300000)throw Error('Invalid integration window');
 }
 elapsed(){return this.now()-this.started;}
 ended(){return this.elapsed()>=this.durationMs;}
 laterDue(){return this.elapsed()>=this.durationMs/2;}
}
