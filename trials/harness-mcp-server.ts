/** The harness arm's MCP tool server, launched by the benchmark runner inside a fresh controller
 * context (docs/HARNESS.md). It talks to the game through the lab bridge; the parent runner holds
 * the lab lock and passes CONCORD_HARNESS_LOCKED, RIMWORLD_LAB_ROOT and the call-log path. */
import {LabBridge} from '../src/lab-bridge.js';
import {HarnessMcp} from '../src/harness/mcp.js';
if(process.env.CONCORD_HARNESS_LOCKED!=='1')throw Error('Exclusive lab lock required');
const log=process.env.CONCORD_BENCH_CALL_LOG;if(!log)throw Error('CONCORD_BENCH_CALL_LOG required');
const b=new LabBridge(undefined,()=>Date.now()+60000);
// Actions carry the timeline of the latest observation, so a command meant for one load or map
// never lands on another (the mod refuses it as stale).
let timeline:{world:string;epoch:string;mapId:number}|undefined;
const perceive=async()=>{const s=await b.perceive();timeline={world:s.meta.world,epoch:s.meta.epoch,mapId:s.meta.mapId};return s;};
const server=new HarnessMcp({
  perceive,
  act:async(a,id)=>{if(!timeline)await perceive();return b.act(a,timeline!,id);},
  time:async c=>{if(c==='pause')await b.admin('pause');else if(c==='play')await b.admin('run');else{const s=await b.state();await b.intent({op:'lab-speed',epoch:s.epoch,count:c} as any);await b.admin('run');}},
},log);
await server.serve();
