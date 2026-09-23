import type {LabBridge} from '../src/lab-bridge.js';
/** Lab-only run command. Native pause-on-load can win the first run request.
 * At most two explicit resumes, then fail; never a periodic unpause loop. */
export async function startNative(b:Pick<LabBridge,'admin'|'state'>){
 const attempts:{tick:number;paused:boolean}[]=[];
 for(let i=0;i<2;i++){
  await b.admin('run');const s=await b.state();attempts.push({tick:s.ticks,paused:s.paused});
  if(!s.paused)return attempts;
 }
 throw Error('Native simulation remained paused after bounded run requests');
}
