import {spawn,type SpawnOptions} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
/** Operator utility. Completion never rejects unattended; launch errors remain explicit. */
export function recordingProcess(command:string,args:string[],options:SpawnOptions){
 const child=spawn(command,args,options);let failure:Error|undefined,finished=false;
 const completion=new Promise<number|null>(resolve=>{
  child.once('error',error=>{failure=error;finished=true;resolve(-1);});
  child.once('exit',code=>{finished=true;resolve(code);});
 });
 return {child,completion,get failure(){return failure;},get finished(){return finished;},async stop(){
  if(finished)return;child.kill('SIGINT');
  await Promise.race([completion,delay(5000,undefined,{ref:false})]);
  if(!finished){child.kill('SIGKILL');await completion;}
 }};
}
