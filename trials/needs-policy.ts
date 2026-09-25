import type {Writable} from 'node:stream';
/** Broken SSH stdout must stop execution, not crash past native cleanup. */
export function needsOutput(output:Writable,onFailure:()=>void){
 let failed=false;
 const fail=()=>{if(failed)return;failed=true;onFailure();};
 output.on('error',fail);
 return (m:unknown)=>{
  if(failed)return;
  if(output.destroyed){fail();return;}
  try{output.write(JSON.stringify(m)+'\n');}catch{fail();}
 };
}
export class NeedsRunGuard {
 stopped=false;
 stop(){this.stopped=true;}
 check(){if(this.stopped)throw Error('Trial stopped by disconnect or deadline');}
 sample(paused:boolean,ticks:number,initialTick:number){
  this.check();if(paused||ticks<=initialTick)throw Error('Native observation interrupted or not advancing');
 }
}
