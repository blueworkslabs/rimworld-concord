import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {LabBridge} from '../src/lab-bridge.js';
import {HarnessMcp} from '../src/harness/mcp.js';
import {observerFromEnv} from '../src/harness/benchmark-observer.js';
if(process.env.CONCORD_HARNESS_LOCKED!=='1')throw Error('Exclusive lab lock required');
const log=process.env.CONCORD_BENCH_CALL_LOG;if(!log)throw Error('CONCORD_BENCH_CALL_LOG required');
const b=new LabBridge(undefined,()=>Date.now()+60000),exec=promisify(execFile);
let timeline:{world:string;epoch:string;mapId:number}|undefined;
const perceive=async()=>{const s=await b.perceive();timeline=s.meta;return s;};
await new HarnessMcp({perceive,act:async(a,id)=>{if(!timeline)throw Error('Observe before acting');return b.act(a,timeline!,id);},
 time:async c=>{
  if(c==='pause'||c==='play')await b.admin(c==='pause'?'pause':'run');
  else await exec('xdotool',['key','--clearmodifiers',String(c)],{timeout:5000});
 }},log,undefined,observerFromEnv(b)).serve();
