import {registerArm,assertLabLockHeld,exitArmOnDisconnect} from '../src/harness/process-lifecycle.js';
import {readFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {z} from 'zod';
import {LabBridge} from '../src/lab-bridge.js';
import {observerFromEnv} from '../src/harness/benchmark-observer.js';
import {UiMcp} from '../src/harness/ui-mcp.js';
if(process.env.CONCORD_HARNESS_LOCKED!=='1')throw Error('Exclusive lab lock required');
assertLabLockHeld();registerArm();exitArmOnDisconnect();
const file=process.env.CONCORD_UI_BACKEND,log=process.env.CONCORD_BENCH_CALL_LOG;if(!file||!log)throw Error('UI backend and journal required');
const config=z.object({command:z.string().min(1),args:z.array(z.string()).default([]),env:z.record(z.string()).default({})}).strict().parse(JSON.parse(readFileSync(file,'utf8')));
const exec=promisify(execFile),b=new LabBridge(undefined,()=>Date.now()+60000);
// Only this trusted observer can inspect the game; its data never enters UI replies.
await new UiMcp(async a=>{
 const {stdout}=await exec(config.command,[...config.args,JSON.stringify(a)],{env:{PATH:process.env.PATH,...config.env},timeout:15000,maxBuffer:8*1024*1024});
 return JSON.parse(stdout);
},log,observerFromEnv(b)).serve();
// stdin EOF ends serve(): closing the controller's channel (ssh or pipe) is the shutdown.
process.exit(0);
