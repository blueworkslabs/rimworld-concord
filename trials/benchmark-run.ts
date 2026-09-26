/** One retained attempt. Shared hidden observer runs synchronously around tools, never through
 * controller-visible replies. UI and harness use identical timing and checker policy. */
import {mkdirSync,writeFileSync,readFileSync,appendFileSync,existsSync} from 'node:fs';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {LabBridge} from '../src/lab-bridge.js';
import {checkT1} from '../src/harness/checker.js';
import {controllerCatalog,isolationConfig} from '../src/harness/controller-config.js';
import {counts,usageFromEvents} from '../src/harness/benchmark-metrics.js';
import type {CallLog} from '../src/harness/tool-server.js';
import type {Snapshot} from '../src/harness/perception.js';
if(process.env.CONCORD_HARNESS_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname;
const options=new Map<string,string>();
for(const a of process.argv.slice(2)){const m=/^--([a-z-]+)=(.+)$/.exec(a);if(!m||options.has(m[1]!))throw Error('Unique --key=value arguments required');options.set(m[1]!,m[2]!);}
for(const k of options.keys())if(!['arm','task','save','model','reasoning','ui-server','prepare-only'].includes(k))throw Error('Unknown argument '+k);
const arm=z.enum(['harness','ui']).parse(options.get('arm')),taskId=z.literal('T1').parse(options.get('task'));
const save=z.string().regex(/^lab-concord-[a-zA-Z0-9-]{1,40}$/).parse(options.get('save'));
const model=z.string().min(1).parse(options.get('model')),reasoning=z.enum(['low','medium','high']).parse(options.get('reasoning')??'medium');
const uiServer=options.get('ui-server');if(arm==='ui'&&(!uiServer||!uiServer.startsWith('/')))throw Error('UI requires absolute --ui-server backend JSON');
const taskText=readFileSync(root+'/benchmark/tasks/T1.json','utf8');
const task=z.object({id:z.literal('T1'),title:z.string(),prompt:z.string(),timeoutSeconds:z.number().int().min(1).max(1200),checker:z.literal('T1'),saveSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(JSON.parse(taskText));
const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const runId=randomUUID(),dir=root+`/.runtime/bench-${taskId}-${arm}-${runId}`;mkdirSync(dir+'/cwd',{recursive:true});
const callLog=dir+'/calls.jsonl',events=dir+'/codex.jsonl';writeFileSync(callLog,'');writeFileSync(events,'');
const codex=process.env.CODEX_BIN??'codex';
const config:Record<string,unknown>={approval_policy:'never',sandbox_mode:'read-only',project_doc_max_bytes:0,include_environment_context:false,web_search:'disabled',model_reasoning_effort:reasoning,
 'tools.update_plan.enabled':false,'tools.experimental_request_user_input.enabled':false,
 'mcp_servers.arm.command':process.execPath,'mcp_servers.arm.args':[root+`/dist/trials/${arm==='ui'?'ui':'harness'}-mcp-server.js`],
 'mcp_servers.arm.env':{RIMWORLD_LAB_ROOT:process.env.RIMWORLD_LAB_ROOT??'',CONCORD_HARNESS_LOCKED:'1',CONCORD_BENCH_CALL_LOG:callLog,CONCORD_BENCH_DIR:dir,CONCORD_UI_BACKEND:uiServer??'',PATH:process.env.PATH??'',DISPLAY:process.env.DISPLAY??'',XAUTHORITY:process.env.XAUTHORITY??''},'mcp_servers.arm.tool_timeout_sec':60};
const version=execFileSync(codex,['--version'],{encoding:'utf8'}).trim();
if(version!=='codex-cli 0.153.4')throw Error('Controller version changed; re-review effective tool configuration');
const catalog=controllerCatalog(JSON.parse(execFileSync(codex,['debug','models','--bundled'],{encoding:'utf8',maxBuffer:10*1024*1024})),model);
writeFileSync(dir+'/controller-catalog.json',JSON.stringify(catalog));
Object.assign(config,isolationConfig,{model_catalog_json:dir+'/controller-catalog.json'});
const toml=(v:unknown):string=>Array.isArray(v)?'['+v.map(toml).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>JSON.stringify(k)+'='+toml(x)).join(',')+'}':JSON.stringify(v);
const args=['exec','--strict-config','--json','--ephemeral','--ignore-user-config','--ignore-rules','--skip-git-repo-check','-C',dir+'/cwd','-m',model,...Object.entries(config).flatMap(([k,v])=>['-c',k+'='+toml(v)]),'-'];
const metadata={runId,arm,task:{id:task.id,sha256:sha(taskText)},modelRequested:model,modelResolved:null,reasoning,controllerVersion:version,controllerCatalogSha256:sha(JSON.stringify(catalog)),argsSha256:sha(JSON.stringify(args)),save:{name:save,expectedSha256:task.saveSha256},at:new Date().toISOString()};
writeFileSync(dir+'/setup.json',JSON.stringify(metadata,null,2));
// Explicit technical hold: CLI feature flags are NOT an effective built-in-tool allowlist.
// Preparation is useful without model/game access. Remove only after a concrete reviewed
// controller tool-surface mechanism and matched context proof replace this check.
writeFileSync(dir+'/launch-plan.json',JSON.stringify({args,config,task:task.prompt,isolationVerified:false},null,2));
if(options.get('prepare-only')==='true'){console.log(JSON.stringify({dir,prepared:true,isolationVerified:false}));process.exit(0);}
function assertControllerReady():void { throw new Error('Benchmark controller isolation unverified: projected catalog/settings need effective-tool/context verification. Use --prepare-only=true; no game or model started.'); }
assertControllerReady();

/* Lifecycle retained below for review and fake-controller tests; scored launch is held above. */
const b=new LabBridge(undefined,()=>Date.now()+130000);
let child:ChildProcess|undefined,recording:ChildProcess|undefined,closed=false,exitCode:number|null=null,spawnError:string|undefined;
let start:Snapshot|undefined,end:Snapshot|undefined,configured:Snapshot|undefined;
let t0:number|undefined,t1:number|undefined,outcome='setup-failed',failure:string|undefined,naturalExit=false,stoppedBySignal=false;
const log=():CallLog[]=>readFileSync(callLog,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
const kill=(p:ChildProcess|undefined,s:NodeJS.Signals)=>{if(p?.pid)try{process.kill(-p.pid,s);}catch{}};
const onSignal=()=>{stoppedBySignal=true;kill(child,'SIGTERM');};process.on('SIGTERM',onSignal);process.on('SIGINT',onSignal);
try{
 await b.verify(save,task.saveSha256);await b.load(save);await b.admin('pause');start=await b.perceive();writeFileSync(dir+'/start.json',JSON.stringify(start));
 // One uncut recording for either arm. No overwrite: each attempt owns a new directory.
 recording=spawn('ffmpeg',['-nostdin','-f','x11grab','-framerate','15','-video_size','1280x800','-i',process.env.DISPLAY??':91','-an','-c:v','libx264','-preset','ultrafast','-crf','28','-pix_fmt','yuv420p',dir+'/recording.mp4'],{detached:true,stdio:['ignore','ignore','pipe']});
 let recordingError:string|undefined;recording.on('error',e=>{recordingError=String(e);});recording.on('exit',()=>{recordingError??='Recording exited before task end';});recording.stderr?.on('data',d=>appendFileSync(dir+'/recording.log',d));
 await delay(500);if(recordingError)throw Error(recordingError);
 t0=Date.now();child=spawn(codex,args,{cwd:dir+'/cwd',stdio:['pipe','pipe','pipe'],detached:true,env:process.env});
 child.on('error',e=>{spawnError=String(e);closed=true;});child.on('close',c=>{exitCode=c;closed=true;});
 child.stdout?.on('data',d=>appendFileSync(events,d));child.stderr?.on('data',d=>appendFileSync(dir+'/stderr.log',d));child.stdin?.on('error',()=>{});child.stdin?.end(task.prompt);
 while(Date.now()-t0<task.timeoutSeconds*1000){
  if(stoppedBySignal)throw Error('Operator interrupted run');
  if(recordingError)throw Error(recordingError);
  if(spawnError)throw Error(spawnError);
  if(existsSync(dir+'/done.json')){outcome='done';break;}
  if(closed){outcome='controller-exit';break;}
  await delay(50);
 }
 if(outcome==='setup-failed')outcome='timeout';
 t1=Date.now();
 if(outcome==='done'){
  // Observer has already paused the game. Let final response/usage flush without more actions.
  const done=JSON.parse(readFileSync(dir+'/done.json','utf8'));t1=done.at;end=done.snapshot;
  const grace=Date.now()+10000;while(!closed&&Date.now()<grace)await delay(50);naturalExit=closed&&exitCode===0;
 }
} catch(e){failure=String(e);outcome='failed';}
finally{
 t1??=Date.now();kill(child,'SIGTERM');const until=Date.now()+1500;while(child&&!closed&&Date.now()<until)await delay(50);if(!closed)kill(child,'SIGKILL');
 try{await new LabBridge().admin('pause');if(!end&&start)end=await new LabBridge().perceive();}catch(e){failure=(failure??'')+' Cleanup failed: '+String(e);}
 kill(recording,'SIGINT');if(recording){await Promise.race([new Promise<void>(r=>recording!.once('close',()=>r())),delay(5000)]);if(recording.exitCode===null)kill(recording,'SIGKILL');}
 if(existsSync(dir+'/configured.json'))configured=JSON.parse(readFileSync(dir+'/configured.json','utf8'));
 if(end)writeFileSync(dir+'/end.json',JSON.stringify(end));
 let calls:CallLog[]=[];try{calls=log();}catch(e){failure=(failure??'')+' Call journal parse failed: '+String(e);}
 const issued=calls.filter(c=>c.event==='issued');
 const receipt={...metadata,outcome,failure:failure??null,timer:{controllerStartMs:t0??null,stoppedAtMs:t1,firstRequestAtMs:issued[0]?.at??null,firstRequestToStopMs:issued[0]?t1-issued[0].at:null,controllerWallMs:t0?t1-t0:null,includesHiddenObserverOverhead:true},
  counts:counts(calls),tokens:usageFromEvents(readFileSync(events,'utf8'),naturalExit),controllerExit:exitCode,
  checker:start&&end?checkT1(start,end,configured):null,verifiedCompletion:false,auditStatus:'pending input/recording audit; timeout/failed runs cannot pass',
  hashes:{calls:sha(readFileSync(callLog)),events:sha(readFileSync(events)),recording:existsSync(dir+'/recording.mp4')?sha(readFileSync(dir+'/recording.mp4')):null},stalls:{status:'not instrumented',measurements:null}};
 writeFileSync(dir+'/receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 process.removeListener('SIGTERM',onSignal);process.removeListener('SIGINT',onSignal);
}
