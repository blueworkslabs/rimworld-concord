import {BenchmarkTask,TaskId} from '../src/harness/benchmark-task.js';
/** Controller-host side of one cross-host benchmark pair (docs/HARNESS.md). The controller stays
 * here, where it is authenticated; the game side (scripts/run-benchmark-pair.sh on the game host)
 * is reached over `ssh -o BatchMode=yes` with the wire (src/harness/controller-wire.ts) on stdio,
 * as the ongoing runner does. The pair script holds the lab lock for both runs and owns the save,
 * hidden snapshots, recording, timer and receipts. For each run this side checks the controller
 * proof, runs the pre-launch check against the remote arm, and launches the controller, whose arm
 * command is `ssh … node dist/trials/<arm>-mcp-server.js` on the game host.
 * Usage: node dist/trials/benchmark-host.js /abs/config.json --order=harness,ui|ui,harness --task=T1
 *   --save=lab-… --model=… [--reasoning=…] --ui-server=/abs/on/game/host.json (--controller-proof=/abs.json | --rehearsal=true)
 * config: {"sshTarget":"…","remoteRepo":"/…","labRoot":"/…"} */
import {mkdirSync,writeFileSync,readFileSync,appendFileSync} from 'node:fs';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {buildLaunch,assertNativeSubscriptionLogin,controllerEnv,type LaunchOptions} from '../src/harness/controller-launch.js';
import {recordFirstRequest,preflightFindings} from '../src/harness/controller-proof.js';
import {LineChannel,type GameToHost,type HostToGame} from '../src/harness/controller-wire.js';

const root=new URL('../..',import.meta.url).pathname;
const [configPath,...rest]=process.argv.slice(2);
if(!configPath?.startsWith('/'))throw Error('Absolute config path required');
const config=z.object({sshTarget:z.string().regex(/^[a-zA-Z0-9_.@-]+$/).refine(s=>!s.startsWith('-')),remoteRepo:z.string().startsWith('/'),labRoot:z.string().startsWith('/'),display:z.string().min(1),xauthority:z.string().startsWith('/'),label:z.string().max(80).default('unscored')}).strict()
  .parse(JSON.parse(readFileSync(configPath,'utf8')));
const options=new Map<string,string>();
for(const a of rest){const m=/^--([a-z-]+)=(.+)$/.exec(a);if(!m||options.has(m[1]!))throw Error('Unique --key=value arguments required');options.set(m[1]!,m[2]!);}
for(const k of options.keys())if(!['order','task','save','model','reasoning','ui-server','controller-proof','rehearsal'].includes(k))throw Error('Unknown argument '+k);
const order=z.enum(['harness,ui','ui,harness']).parse(options.get('order')).split(',') as ('harness'|'ui')[];
const taskId=TaskId.parse(options.get('task'));
const save=z.string().regex(/^lab-concord-[a-zA-Z0-9-]{1,40}$/).parse(options.get('save'));
const model=z.string().regex(/^[a-zA-Z0-9._:-]+$/).parse(options.get('model')),reasoning=z.enum(['low','medium','high']).parse(options.get('reasoning')??'medium');
const uiServer=z.string().regex(/^\/[a-zA-Z0-9_./-]+$/).parse(options.get('ui-server'));
const rehearsal=options.get('rehearsal')==='true';
const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const taskText=readFileSync(root+'/benchmark/tasks/'+taskId+'.json','utf8'),task=BenchmarkTask.parse(JSON.parse(taskText)),prompt=task.prompt;
if(task.id!==taskId)throw Error('Task file ID mismatch');
const codex=rehearsal?(process.env.CONCORD_REHEARSAL_CONTROLLER??(()=>{throw Error('Rehearsal needs CONCORD_REHEARSAL_CONTROLLER');})()):(process.env.CODEX_BIN??'codex');

// Isolation gate, here because the controller is here: the proof must come from this host's controller.
let proof:any=null;
let readiness:ReturnType<typeof assertNativeSubscriptionLogin>|null=null;
if(!rehearsal){
  readiness=assertNativeSubscriptionLogin(codex);
  const p=options.get('controller-proof');if(!p?.startsWith('/'))throw Error('Scored pairs need --controller-proof=/abs/receipt.json from trials/benchmark-controller-proof.ts');
  proof=JSON.parse(readFileSync(p,'utf8'));
  const version=execFileSync(codex,['--version'],{encoding:'utf8',env:controllerEnv()}).trim();
  const mismatch=[proof.verified!==true&&'not verified',proof.model!==model&&'model',proof.reasoning!==reasoning&&'reasoning',proof.controllerVersion!==version&&'controller version',proof.task?.sha256!==sha(taskText)&&'task'].filter(Boolean);
  if(mismatch.length)throw Error('Controller proof does not match this pair: '+mismatch.join(', '));
}

// Same code on both hosts: the arm servers and the game-side runner come from the remote build.
const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
const sshEnv=Object.fromEntries(['PATH','HOME','LANG','SSH_AUTH_SOCK'].filter(k=>process.env[k]).map(k=>[k,process.env[k]!]));
const digestCode="const fs=require('fs'),p=require('path'),h=require('crypto').createHash('sha256'),d=process.argv[1];const walk=r=>fs.readdirSync(p.join(d,r),{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1).flatMap(e=>e.isDirectory()?walk(p.join(r,e.name)):e.name.endsWith('.js')?[p.join(r,e.name)]:[]);for(const f of [...walk('src'),...walk('trials')]){h.update(f);h.update(fs.readFileSync(p.join(d,f)));}for(const f of ['scripts/run-benchmark-pair.sh','benchmark/tasks/'+process.argv[2]+'.json']){h.update(f);h.update(fs.readFileSync(p.resolve(d,'..',f)));}console.log(h.digest('hex'));";
const local=execFileSync(process.execPath,['-e',digestCode,root+'/dist',taskId],{env:sshEnv,encoding:'utf8'}).trim();
const remote=execFileSync('ssh',['-o','BatchMode=yes',config.sshTarget,'node -e '+quote(digestCode)+' '+quote(config.remoteRepo+'/dist')+' '+quote(taskId)],{env:sshEnv,timeout:15000,encoding:'utf8'}).trim();
if(local!==remote)throw Error('Game-host build differs from the local build');

const pairId=randomUUID(),hostDir=root+`/.runtime/bench-pair-${pairId}`;mkdirSync(hostDir,{recursive:true});
writeFileSync(hostDir+'/pair.json',JSON.stringify({pairId,order,save,model,reasoning,rehearsal,readiness,controllerProof:options.get('controller-proof')??null,build:local,label:config.label,sshTarget:config.sshTarget,at:new Date().toISOString()},null,2));
const command=`env RIMWORLD_LAB_ROOT=${quote(config.labRoot)} DISPLAY=${quote(config.display)} XAUTHORITY=${quote(config.xauthority)} CONCORD_BENCH_LABEL=${quote(config.label)} bash ${quote(config.remoteRepo+'/scripts/run-benchmark-pair.sh')} `+
  [`--order=${order.join(',')}`,`--task=${taskId}`,`--save=${save}`,`--model=${model}`,`--reasoning=${reasoning}`,`--ui-server=${uiServer}`,...(rehearsal?['--rehearsal=true']:[])].map(quote).join(' ');
const game=spawn('ssh',['-o','BatchMode=yes',config.sshTarget,command],{env:sshEnv,stdio:['pipe','pipe','pipe']});
game.stderr.on('data',d=>appendFileSync(hostDir+'/game-stderr.log',d));game.stdin.on('error',()=>{});
const wire=new LineChannel<GameToHost,HostToGame>(game.stdout,game.stdin);
const runs:{runId:string;arm:string;dir:string;outcome?:string;receipt?:unknown;error?:string}[]=[];
const launchAbort=new AbortController();
const assertRunning=()=>{if(launchAbort.signal.aborted||wire.closed)throw Error('Pair stopped before controller launch');};
const runStops=new Map<string,AbortController>();
const controllers=new Map<string,ChildProcess>();
const kill=(c:ChildProcess|undefined)=>{if(c?.pid)try{process.kill(-c.pid,'SIGKILL');}catch{}};

async function launch(m:Extract<GameToHost,{type:'ready'}>){
  const runStop=new AbortController();runStops.set(m.runId,runStop);
  const signal=AbortSignal.any([launchAbort.signal,runStop.signal]);
  const assertActive=()=>{assertRunning();if(signal.aborted)throw Error('Run cancelled before controller launch');};
  assertActive();
  const expected=order[runs.length-1];
  const mismatch=[m.arm!==expected&&'arm order',m.model!==model&&'model',m.reasoning!==reasoning&&'reasoning',m.taskSha256!==sha(taskText)&&'task',m.rehearsal!==rehearsal&&'rehearsal'].filter(Boolean);
  if(mismatch.length)throw Error('Game side disagrees: '+mismatch.join(', '));
  const dir=runs.at(-1)!.dir;mkdirSync(dir+'/cwd',{recursive:true});
  const opts=(env:Record<string,string>):LaunchOptions=>({codex,root,dir,arm:m.arm,model,reasoning,callLog:env.CONCORD_BENCH_CALL_LOG??'',uiServer:env.CONCORD_UI_BACKEND,
    remote:{sshTarget:config.sshTarget,remoteRepo:config.remoteRepo,armEnv:env}});
  let preflight:{findings:string[]}|null=null;
  if(!rehearsal){
    // Pre-launch check of this exact command line, remote arm included, outside the task timer.
    const pre=await recordFirstRequest(opts(m.preflightEnv),prompt,{},undefined,signal);
    preflight={findings:preflightFindings(pre,proof.evidence[m.arm])};
    writeFileSync(dir+'/preflight.json',JSON.stringify({...preflight,evidence:pre},null,2));
    if(preflight.findings.length)throw Error('Pre-launch controller check failed: '+preflight.findings.join('; '));
  }
  assertActive();
  const {version,catalog,args,config:launchConfig,codexHome}=buildLaunch(opts(m.armEnv));
  writeFileSync(dir+'/launch-plan.json',JSON.stringify({args,config:launchConfig,task:prompt,rehearsal,codexHome,readiness},null,2));
  const prepared={runId:m.runId,at:Date.now(),version,catalogSha256:sha(JSON.stringify(catalog)),argsSha256:sha(JSON.stringify(args)),preflight};
  const start=wire.next(x=>x.type==='start'&&x.runId===m.runId,30000,signal);
  wire.send({type:'prepared',...prepared});await start;assertActive();
  const c=spawn(codex,args,{cwd:dir+'/cwd',stdio:['pipe','pipe','pipe'],detached:true,env:controllerEnv()});controllers.set(m.runId,c);
  let spawnError:string|undefined;c.on('error',e=>{spawnError=String(e);});
  const lines=createInterface({input:c.stdout!,crlfDelay:Infinity});
  lines.on('line',line=>{appendFileSync(dir+'/codex.jsonl',line+'\n');wire.send({type:'controller-event',runId:m.runId,line});});
  c.stderr!.on('data',d=>appendFileSync(dir+'/stderr.log',d));c.stdin!.on('error',()=>{});c.stdin!.end(prompt);
  // Every event line goes out before the exit, so the game side's journal is complete.
  Promise.all([new Promise(r=>lines.once('close',r)),new Promise<number|null>(r=>c.once('close',r))])
    .then(([,code])=>{controllers.delete(m.runId);if(spawnError)appendFileSync(dir+'/stderr.log',spawnError+'\n');wire.send({type:'controller-exit',runId:m.runId,code});});
  wire.send({type:'launched',runId:m.runId,at:Date.now(),version,catalogSha256:sha(JSON.stringify(catalog)),argsSha256:sha(JSON.stringify(args)),preflight});
}

wire.on(m=>{
  let run=runs.find(r=>r.runId===m.runId);
  if(m.type==='ready'){
    if(run||runs.length>=order.length||!/^[0-9a-f-]{36}$/.test(m.runId))return void game.stdin.end();
    runs.push({runId:m.runId,arm:m.arm,dir:hostDir+`/${runs.length+1}-${m.arm}`});
    launch(m).catch(e=>{runs.find(r=>r.runId===m.runId)!.error=String(e);wire.send({type:'launch-failed',runId:m.runId,error:String(e).slice(0,2000)});});
  }
  if(!run&&m.type==='receipt'){const receipt=m.receipt as {arm:string};run={runId:m.runId,arm:receipt.arm,dir:hostDir+`/${runs.length+1}-${receipt.arm}`};runs.push(run);mkdirSync(run.dir,{recursive:true});}
  if(!run)return;
  if(m.type==='stop'){runStops.get(m.runId)?.abort();kill(controllers.get(m.runId));}
  if(m.type==='receipt'){run.receipt=m.receipt;run.outcome=(m.receipt as {outcome?:string})?.outcome;writeFileSync(run.dir+'/receipt.json',JSON.stringify(m.receipt,null,2));}
  if(m.type==='setup-failed'){run.outcome='setup-failed';run.error=m.error;}
});
const stop=()=>{launchAbort.abort();for(const c of controllers.values())kill(c);game.stdin.end();};
wire.onClose(stop);
process.once('SIGTERM',stop);process.once('SIGINT',stop);
const deadline=setTimeout(()=>{stop();game.kill();},2*3600*1000);
const code=await new Promise<number|null>(r=>{game.on('error',()=>r(-1));game.on('close',r);});
clearTimeout(deadline);for(const c of controllers.values())kill(c);
const result={pairId,order,rehearsal,gameExit:code,complete:runs.length===order.length&&runs.every(r=>r.receipt),runs:runs.map(({receipt,...r})=>r),strayLines:wire.noise.length};
writeFileSync(hostDir+'/pair-result.json',JSON.stringify({...result,strayLines:wire.noise},null,2));
console.log(JSON.stringify({...result,dir:hostDir}));
if(!result.complete)process.exitCode=1;
