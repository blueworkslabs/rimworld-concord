import {stopArm} from '../src/harness/process-lifecycle.js';
/** One retained attempt. Shared hidden observer runs synchronously around tools, never through
 * controller-visible replies. UI and harness use identical timing and checker policy. */
import {mkdirSync,writeFileSync,readFileSync,appendFileSync,existsSync} from 'node:fs';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {LabBridge} from '../src/lab-bridge.js';
import {checkT1} from '../src/harness/checker.js';
import {buildLaunch} from '../src/harness/controller-launch.js';
import {recordFirstRequest,armFindings} from '../src/harness/controller-proof.js';
import {counts,usageFromEvents} from '../src/harness/benchmark-metrics.js';
import type {CallLog} from '../src/harness/tool-server.js';
import type {Snapshot} from '../src/harness/perception.js';
if(process.env.CONCORD_HARNESS_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname;
const options=new Map<string,string>();
for(const a of process.argv.slice(2)){const m=/^--([a-z-]+)=(.+)$/.exec(a);if(!m||options.has(m[1]!))throw Error('Unique --key=value arguments required');options.set(m[1]!,m[2]!);}
for(const k of options.keys())if(!['arm','task','save','model','reasoning','ui-server','prepare-only','controller-proof','rehearsal'].includes(k))throw Error('Unknown argument '+k);
const arm=z.enum(['harness','ui']).parse(options.get('arm')),taskId=z.literal('T1').parse(options.get('task'));
const save=z.string().regex(/^lab-concord-[a-zA-Z0-9-]{1,40}$/).parse(options.get('save'));
const model=z.string().min(1).parse(options.get('model')),reasoning=z.enum(['low','medium','high']).parse(options.get('reasoning')??'medium');
const uiServer=options.get('ui-server');if(arm==='ui'&&(!uiServer||!uiServer.startsWith('/')))throw Error('UI requires absolute --ui-server backend JSON');
const taskText=readFileSync(root+'/benchmark/tasks/T1.json','utf8');
const task=z.object({id:z.literal('T1'),title:z.string(),prompt:z.string(),timeoutSeconds:z.number().int().min(1).max(1200),checker:z.literal('T1'),saveSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(JSON.parse(taskText));
const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const runId=randomUUID(),dir=root+`/.runtime/bench-${taskId}-${arm}-${runId}`;mkdirSync(dir+'/cwd',{recursive:true});
const callLog=dir+'/calls.jsonl',events=dir+'/codex.jsonl';writeFileSync(callLog,'');writeFileSync(events,'');
// A rehearsal swaps in the scripted stand-in controller (trials/rehearsal-controller.ts) to exercise
// the lifecycle with the real game; its receipt is labelled and can never count as a scored run.
const rehearsal=options.get('rehearsal')==='true';
const codex=rehearsal?(process.env.CONCORD_REHEARSAL_CONTROLLER??(()=>{throw Error('Rehearsal needs CONCORD_REHEARSAL_CONTROLLER');})()):(process.env.CODEX_BIN??'codex');
const {version,catalog,config,args}=buildLaunch({codex,root,dir,arm,model,reasoning,callLog,uiServer,
 env:{RIMWORLD_LAB_ROOT:process.env.RIMWORLD_LAB_ROOT,PATH:process.env.PATH,DISPLAY:process.env.DISPLAY,XAUTHORITY:process.env.XAUTHORITY}});
const metadata={runId,rehearsal,arm,task:{id:task.id,sha256:sha(taskText)},modelRequested:model,modelResolved:null,reasoning,controllerVersion:version,controllerCatalogSha256:sha(JSON.stringify(catalog)),argsSha256:sha(JSON.stringify(args)),save:{name:save,expectedSha256:task.saveSha256},at:new Date().toISOString()};
writeFileSync(dir+'/setup.json',JSON.stringify(metadata,null,2));
// Isolation gate (replaces the earlier hard hold). Feature flags are not an allowlist, so a scored
// run needs recorded evidence: a verified controller proof (trials/benchmark-controller-proof.ts) for
// this model, reasoning, controller version and task, and, just before launch, a pre-launch check of
// this very command line showing its arm server came up with exactly the proven tool surface.
let proof:any=null;
if(!rehearsal){
 const p=options.get('controller-proof');if(!p||!p.startsWith('/'))throw Error('Scored runs need --controller-proof=/abs/receipt.json from trials/benchmark-controller-proof.ts');
 proof=JSON.parse(readFileSync(p,'utf8'));
 const mismatch=[proof.verified!==true&&'not verified',proof.model!==model&&'model',proof.reasoning!==reasoning&&'reasoning',proof.controllerVersion!==version&&'controller version',proof.task?.sha256!==sha(taskText)&&'task'].filter(Boolean);
 if(mismatch.length)throw Error('Controller proof does not match this run: '+mismatch.join(', '));
}
writeFileSync(dir+'/launch-plan.json',JSON.stringify({args,config,task:task.prompt,rehearsal,controllerProof:options.get('controller-proof')??null},null,2));
if(options.get('prepare-only')==='true'){console.log(JSON.stringify({dir,prepared:true,rehearsal,controllerProof:!!proof}));process.exit(0);}

/* Lifecycle retained below for review and fake-controller tests; scored launch is held above. */
const b=new LabBridge(undefined,()=>Date.now()+130000);
let child:ChildProcess|undefined,recording:ChildProcess|undefined,closed=false,exitCode:number|null=null,spawnError:string|undefined;
let start:Snapshot|undefined,end:Snapshot|undefined,configured:Snapshot|undefined;
let t0:number|undefined,t1:number|undefined,outcome='setup-failed',failure:string|undefined,naturalExit=false,stoppedBySignal=false;
const log=():CallLog[]=>readFileSync(callLog,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
const kill=(p:ChildProcess|undefined,s:NodeJS.Signals)=>{if(p?.pid)try{process.kill(-p.pid,s);}catch{}};
const setupAbort=new AbortController();
const onSignal=()=>{stoppedBySignal=true;setupAbort.abort();kill(child,'SIGTERM');};process.on('SIGTERM',onSignal);process.on('SIGINT',onSignal);
const assertNotInterrupted=()=>{if(stoppedBySignal)throw Error('Operator interrupted setup');};
try{
 assertNotInterrupted();await b.verify(save,task.saveSha256);assertNotInterrupted();await b.load(save);assertNotInterrupted();await b.admin('pause');assertNotInterrupted();start=await b.perceive();assertNotInterrupted();writeFileSync(dir+'/start.json',JSON.stringify(start));
 if(!rehearsal){
  // Pre-launch check of this exact command line against the local recorder (no model, no tool calls;
  // its own journal), outside the task timer.
  const pre=await recordFirstRequest({codex,root,dir,arm,model,reasoning,callLog:dir+'/preflight-calls.jsonl',uiServer,
   env:{RIMWORLD_LAB_ROOT:process.env.RIMWORLD_LAB_ROOT,PATH:process.env.PATH,DISPLAY:process.env.DISPLAY,XAUTHORITY:process.env.XAUTHORITY}},task.prompt,{},undefined,setupAbort.signal);
  const proven=proof.evidence[arm];const f=armFindings(pre);
  if(JSON.stringify(pre.tools.map(t=>t.sha256))!==JSON.stringify(proven.tools.map((t:any)=>t.sha256)))f.push('offered tools differ from the controller proof');
  if(JSON.stringify(pre.input.map(i=>i.sha256))!==JSON.stringify(proven.input.map((i:any)=>i.sha256))||pre.instructionsSha256!==proven.instructionsSha256)f.push('context differs from the controller proof');
  writeFileSync(dir+'/preflight.json',JSON.stringify({findings:f,evidence:pre},null,2));
  if(f.length)throw Error('Pre-launch controller check failed: '+f.join('; '));
 }
 // One uncut recording for either arm. No overwrite: each attempt owns a new directory.
 recording=spawn('ffmpeg',['-nostdin','-f','x11grab','-framerate','15','-video_size','1280x800','-i',process.env.DISPLAY??':91','-an','-c:v','libx264','-preset','ultrafast','-crf','28','-pix_fmt','yuv420p',dir+'/recording.mp4'],{detached:true,stdio:['ignore','ignore','pipe']});
 let recordingError:string|undefined;recording.on('error',e=>{recordingError=String(e);});recording.on('exit',()=>{recordingError??='Recording exited before task end';});recording.stderr?.on('data',d=>appendFileSync(dir+'/recording.log',d));
 await delay(500);assertNotInterrupted();if(recordingError)throw Error(recordingError);
 t0=Date.now();child=spawn(codex,args,{cwd:dir+'/cwd',stdio:['pipe','pipe','pipe'],detached:true,env:process.env});
 child.on('error',e=>{spawnError=String(e);closed=true;});child.on('close',c=>{exitCode=c;closed=true;});
 child.stdout?.on('data',d=>appendFileSync(events,d));child.stderr?.on('data',d=>appendFileSync(dir+'/stderr.log',d));child.stdin?.on('error',()=>{});child.stdin?.end(task.prompt);
 while(Date.now()-t0<task.timeoutSeconds*1000){
  if(stoppedBySignal)throw Error('Operator interrupted run');
  if(recordingError)throw Error(recordingError);
  if(spawnError)throw Error(spawnError);
  if(log().some(c=>c.observerFailure))throw Error('Hidden observer failed; see original action replies in journal');
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
 t1??=Date.now();naturalExit ||= closed&&exitCode===0;
 // On timeout/failure stop dispatch immediately, not after a gameplay grace interval.
 kill(child,'SIGKILL');
 try{await stopArm(callLog+'.process.json');}catch(e){failure=(failure??'')+' Arm cleanup failed: '+String(e);}
 const until=Date.now()+1000;while(child&&!closed&&Date.now()<until)await delay(10);
 try{await new LabBridge().admin('pause');if(!end&&start)end=await new LabBridge().perceive();}catch(e){failure=(failure??'')+' Cleanup failed: '+String(e);}
 kill(recording,'SIGINT');if(recording){await Promise.race([new Promise<void>(r=>recording!.once('close',()=>r())),delay(5000)]);if(recording.exitCode===null)kill(recording,'SIGKILL');}
 if(existsSync(dir+'/configured.json'))configured=JSON.parse(readFileSync(dir+'/configured.json','utf8'));
 if(end)writeFileSync(dir+'/end.json',JSON.stringify(end));
 let calls:CallLog[]=[];try{calls=log();}catch(e){failure=(failure??'')+' Call journal parse failed: '+String(e);}
 const issued=calls.filter(c=>c.event==='issued');
 const receipt={...metadata,outcome,failure:failure??null,timer:{controllerStartMs:t0??null,stoppedAtMs:t1,firstRequestAtMs:issued[0]?.at??null,firstRequestToStopMs:issued[0]?t1-issued[0].at:null,controllerWallMs:t0?t1-t0:null,includesHiddenObserverOverhead:true,endSnapshotMayBeAfterDeadline:outcome!=='done'},
  counts:counts(calls),tokens:usageFromEvents(readFileSync(events,'utf8'),naturalExit),controllerExit:exitCode,
  checker:start&&end?checkT1(start,end,configured):null,verifiedCompletion:false,auditStatus:'pending input/recording audit; timeout/failed runs cannot pass',
  hashes:{calls:sha(readFileSync(callLog)),events:sha(readFileSync(events)),recording:existsSync(dir+'/recording.mp4')?sha(readFileSync(dir+'/recording.mp4')):null},stalls:{status:'not instrumented',measurements:null}};
 writeFileSync(dir+'/receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 process.removeListener('SIGTERM',onSignal);process.removeListener('SIGINT',onSignal);
}
