/** Matched benchmark run (docs/HARNESS.md, Benchmark): one task, one arm, one fresh controller
 * context. Both arms get the same controller (`codex exec`, ephemeral, user config ignored, every
 * built-in tool disabled), the same model and reasoning setting, the same task text and time
 * limit; only the arm's MCP tool server differs (the harness server, or the frozen UI adapter).
 * The runner itself, never the controller, takes the hidden checker's start and end snapshots.
 * No rerolls: every run is retained, failed or not. */
import {mkdir,writeFile,readFile,appendFile} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {LabBridge} from '../src/lab-bridge.js';
import {checkT1} from '../src/harness/checker.js';
import type {CallLog} from '../src/harness/mcp.js';
if(process.env.CONCORD_HARNESS_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname;
const arg=(k:string)=>process.argv.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3);
const arm=arg('arm'),taskId=arg('task'),save=arg('save'),model=arg('model'),reasoning=arg('reasoning')??'medium',uiServer=arg('ui-server');
if(arm!=='harness'&&arm!=='ui')throw Error('--arm=harness|ui required');
if(!taskId||!/^T\d+$/.test(taskId)||!save?.startsWith('lab-')||!model)throw Error('Usage: benchmark-run --arm=harness|ui --task=T1 --save=lab-... --model=<alias> [--reasoning=low|medium|high] [--ui-server=<json file>]');
if(arm==='ui'&&!uiServer)throw Error('The UI arm needs --ui-server=<json {command,args,env?}> for the frozen adapter');
const taskPath=`${root}/benchmark/tasks/${taskId}.json`;const taskText=readFileSync(taskPath,'utf8');const task=JSON.parse(taskText);
const checkers:Record<string,typeof checkT1>={T1:checkT1};const checker=checkers[task.checker];if(!checker)throw Error('No checker for '+task.checker);
const runId=randomUUID();const dir=`${root}/.runtime/bench-${taskId}-${arm}-${runId}`;await mkdir(dir+'/cwd',{recursive:true});
const callLog=dir+'/calls.jsonl',events=dir+'/codex.jsonl';await writeFile(callLog,'');
const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const b=new LabBridge(undefined,()=>Date.now()+130000);

// Setup, outside the timer: load the frozen save, paused; hidden start snapshot.
await b.load(save);await b.admin('pause');const saveSha=await b.hash(save);
let t=Date.now();const start=await b.perceive();const checkerMs=[Date.now()-t];

const server=arm==='harness'
  ?{command:process.execPath,args:[root+'/dist/trials/harness-mcp-server.js'],env:{}}
  :JSON.parse(readFileSync(uiServer!,'utf8')) as {command:string;args?:string[];env?:Record<string,string>};
const serverEnv={...(server.env??{}),RIMWORLD_LAB_ROOT:process.env.RIMWORLD_LAB_ROOT!,CONCORD_HARNESS_LOCKED:'1',CONCORD_BENCH_CALL_LOG:callLog,PATH:process.env.PATH??''};
const toml=(v:unknown):string=>Array.isArray(v)?'['+v.map(toml).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>`${JSON.stringify(k)}=${toml(x)}`).join(',')+'}':JSON.stringify(v);
const config:Record<string,unknown>={approval_policy:'never',sandbox_mode:'read-only',project_doc_max_bytes:0,include_environment_context:false,web_search:'disabled',
  model_reasoning_effort:reasoning,'tools.view_image':false,'tools.update_plan.enabled':false,'tools.experimental_request_user_input.enabled':false,
  'mcp_servers.arm.command':server.command,'mcp_servers.arm.args':server.args??[],'mcp_servers.arm.env':serverEnv,'mcp_servers.arm.tool_timeout_sec':120};
for(const f of ['shell_tool','apps','plugins','hooks','multi_agent','multi_agent_v2','memories','skill_search','image_generation','browser_use','browser_use_external','computer_use','in_app_browser','code_mode','code_mode_host','tool_suggest','view_image','sleep_tool','unified_exec','goals',
  // MCP tools must be offered directly, not behind a tool search the UI arm's tools would not pay for.
  'tool_search_always_defer_mcp_tools','skill_mcp_dependency_install'])config['features.'+f]=false;
const codex=process.env.CODEX_BIN??'codex';
const args=['exec','--json','--ephemeral','--ignore-user-config','--skip-git-repo-check','-C',dir+'/cwd','-m',model,...Object.entries(config).flatMap(([k,v])=>['-c',`${k}=${toml(v)}`]),'-'];
const codexVersion=execFileSync(codex,['--version'],{encoding:'utf8'}).trim();

// The timed part: from the controller's start until report_done or the time limit.
const t0=Date.now();const child=spawn(codex,args,{cwd:dir+'/cwd',stdio:['pipe','pipe','pipe'],detached:true,env:{...process.env,PATH:process.env.PATH??''}});
child.stdin.end(task.prompt);let stderrBytes=0;
child.stdout.on('data',d=>{void appendFile(events,d);});child.stderr.on('data',d=>{stderrBytes+=d.length;});
let exit:number|null|undefined;child.on('exit',c=>{exit=c;});
const calls=()=>readFileSync(callLog,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l) as CallLog);
let outcome:'done'|'timeout'|'controller-exit'='timeout';
while(Date.now()-t0<task.timeoutSeconds*1000){
  if(calls().some(c=>c.kind==='done')){outcome='done';break;}
  if(exit!==undefined){outcome='controller-exit';break;}
  await delay(250);
}
const t1=Date.now();
try{process.kill(-child.pid!,'SIGTERM');}catch{}
await delay(1500);try{process.kill(-child.pid!,'SIGKILL');}catch{}

// Hidden end snapshot, outside the timer.
await b.admin('pause');t=Date.now();const end=await b.perceive();checkerMs.push(Date.now()-t);
const result=checker(start,end);
const log=calls();const count=(k:string)=>log.filter(c=>c.kind===k).length;
const usage={input_tokens:0,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0,turns:0};
for(const line of (existsSync(events)?await readFile(events,'utf8'):'').split('\n').filter(Boolean)){
  let e:any;try{e=JSON.parse(line);}catch{continue;}
  const u=e?.usage??e?.msg?.usage;if(e?.type==='turn.completed'&&u){usage.turns++;for(const k of ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens'] as const)usage[k]+=Number(u[k]??0);}
}
const receipt={runId,arm,task:{id:task.id,sha256:sha(taskText)},model,reasoning,controller:{bin:codex,version:codexVersion,argsSha256:sha(JSON.stringify(args.filter(a=>!a.includes(callLog))))},
  save:{name:save,sha256:saveSha},outcome,
  timer:{controllerStartToEndMs:t1-t0,firstCallAtMs:log[0]?log[0].at-t0:null,doneAtMs:log.find(c=>c.kind==='done')?.at?(log.find(c=>c.kind==='done')!.at-t0):null,timeoutSeconds:task.timeoutSeconds},
  counts:{inputs:count('input'),observations:count('observation'),controls:count('control'),errors:count('error'),calls:log.length,observedBytes:log.filter(c=>c.kind==='observation').reduce((n,c)=>n+c.bytes,0)},
  tokens:{...usage,uncached_input_tokens:usage.input_tokens-usage.cached_input_tokens,actualBilledUsd:null,reason:'subscription route supplies token usage only'},
  checker:result,checkerOverheadMs:checkerMs,controllerExit:exit??null,controllerStderrBytes:stderrBytes,
  hashes:{calls:sha(readFileSync(callLog)),events:existsSync(events)?sha(readFileSync(events)):null},stalls:[],at:new Date().toISOString()};
await writeFile(dir+'/receipt.json',JSON.stringify(receipt,null,1));await writeFile(dir+'/start.json',JSON.stringify(start));await writeFile(dir+'/end.json',JSON.stringify(end));
console.log(JSON.stringify(receipt));
