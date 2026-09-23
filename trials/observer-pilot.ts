/** Operator-only, scripted presentation/capture check. No character or video-model calls. */
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,statfs,open} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
import {stopTrialWork} from '../src/work-trial.js';
if(process.env.CONCORD_OBSERVER_PILOT_LOCKED!=='1')throw Error('Use locked observer pilot launcher');
const [mode,run]=process.argv.slice(2);if(!['pair','cold'].includes(mode!)||!run||!/^[0-9a-f-]{36}$/.test(run))throw Error('Run identity required');
const root=new URL('../..',import.meta.url).pathname,prefix=root+'/.runtime/observer-pilot-'+run,path=prefix+'-'+mode+'.json';
await writeFile(path,JSON.stringify({run,mode,status:'started'}),{flag:'wx'});
const exec=promisify(execFile),b=new LabBridge(undefined,()=>deadline);let deadline=Date.now()+480000;
const out:any={run,mode,passed:false,modelCalls:0,scripted:true,note:'Presentation pilot, not evidence of model agency or human usability.',cases:[]};
let store:Store|undefined,c:Coordinator|undefined,rec:ReturnType<typeof spawn>|undefined;
const actor='Thing_Human405',second='Thing_Human408';
const ui=async(...args:string[])=>exec('python3',[b.root+'/bin/lab.py',...args],{timeout:15000});
const system=async()=>{const {stdout}=await exec('systemctl',['--user','show','rimworld-lab.service','-p','CPUUsageNSec','-p','MemoryCurrent'],{timeout:5000});return Object.fromEntries(stdout.trim().split('\n').map(s=>s.split('=')));};
try{
 if(mode==='cold'){
  const cp=JSON.parse(await readFile(prefix+'-checkpoint.json','utf8'));store=new Store(cp.db);c=new Coordinator(store,b);await c.restore(cp.name);await c.reconcile();assert.deepEqual(c.inspect().selfCare,cp.selfCare);assert.deepEqual(c.inspect().outcomes,cp.outcomes);assert.deepEqual(c.inspect().coreState,cp.coreState);out.coldRestore=true;
 }else{
  const free=await statfs(root);assert(free.bavail*free.bsize>512*1024*1024,'At least 512 MiB free required');
  const f=JSON.parse(await readFile(root+'/.runtime/campfire-fixture.json','utf8')),fixture='lab-concord-ui-'+run.slice(0,8);
  await exec('python3',[root+'/scripts/native-food-fixture.py',b.root+'/profile/Saves/'+f.name+'.rws',b.root+'/profile/Saves/'+fixture+'.rws','hungry'],{timeout:10000});
  for(const variant of ['baseline','capture']){
   await b.load(fixture);await b.admin('pause');
   store=new Store(prefix+'-'+variant+'.db');c=new Coordinator(store,b);await c.open();await c.initializeCore('SCRIPTED UI PILOT. Optional food and work; one eating action does not finish the broad plan.');
   // Coordinate clicks are the fixed 1280x800 lab presentation, never character tools.
   await exec('xdotool',['mousemove','700','460','click','--repeat','2','--delay','100','4'],{env:{...process.env,DISPLAY:':91',XAUTHORITY:'/run/rimworld-lab-display/Xauthority'},timeout:5000});
   await ui('click','1160','782');
   const row:any={variant,samples:[],markers:[],before:await system()};out.cases.push(row);
   let done:Promise<number|null>|undefined;
   if(variant==='capture'){
    const log=await open(prefix+'-ffmpeg.log','wx');
    rec=spawn('ffmpeg',['-nostdin','-n','-loglevel','info','-f','x11grab','-draw_mouse','0','-framerate','15','-video_size','1280x800','-i',':91','-t','75','-an','-vf',"drawtext=text='SCRIPTED UI PILOT - no model calls (silent)':x=440:y=75:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=6",'-c:v','libx264','-preset','veryfast','-crf','22','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart','-fs','134217728','-progress',prefix+'-progress.txt',prefix+'.mp4'],{env:{...process.env,DISPLAY:':91',XAUTHORITY:'/run/rimworld-lab-display/Xauthority'},stdio:['ignore','ignore',log.fd]});
    done=new Promise((resolve,reject)=>{rec!.once('error',reject);rec!.once('exit',resolve);});await log.close();
   }
   row.startUnixMs=Date.now();row.timeMapping='Offsets relative to recorder spawn / baseline start; startup/frame alignment approximate, not frame-exact.';
   await b.admin('run');let question:string|undefined,reply:string|undefined,proposal:string|undefined;const stages=new Set<number>();
   while(Date.now()-row.startUnixMs<75000){
    const elapsed=Date.now()-row.startUnixMs;
    if(rec&&rec.exitCode!==null&&elapsed<74000)throw Error('Recorder stopped before observation ended');
    if(elapsed>=8000&&!stages.has(1)){
     stages.add(1);const turn=await c.planCore({name:'scripted',async plan(){await delay(1500);return {topics:[{sourceId:'brief',text:'Food and optional work remain open.',status:'open'}],actionTopicId:null,action:{kind:'ask',pawn:actor,text:'Would you like to eat before considering any work?',reason:'Ask Alvin; his answer is optional.'}};}});assert.equal(turn.status,'applied');question=turn.questionId;row.markers.push({elapsedMs:Date.now()-row.startUnixMs,event:'scripted question'});
    }
    if(elapsed>=20000&&!stages.has(2)){
     stages.add(2);const result=await c.answerCoreQuestion(question!,{name:'scripted',async answerCore(v){const food=v.pawn.eating!.options[0]!;return {choice:'eat',thing:food.thing,text:'I choose to eat these berries now. Work can wait.'};}});assert.equal(result.status,'delivered');reply=c.inspect().coreState!.questions[0]!.messages.at(-1)!.id;row.markers.push({elapsedMs:Date.now()-row.startUnixMs,event:'scripted eat choice'});
    }
    if(elapsed>=40000&&!stages.has(3)){
     stages.add(3);await c.reconcile();const careId:string=Object.keys(c.inspect().selfCare!)[0]!;assert.equal(c.inspect().outcomes[careId]!.status,'completed');const turn=await c.planCore({name:'scripted',async plan(){return {topics:[{sourceId:reply!,text:'Alvin finished his chosen eating action; the wider plan remains open.',status:'resolved'}],actionTopicId:null,action:{kind:'wait',reason:'Consumption confirmed by a receipt. No further work authorized.'}};}});assert.equal(turn.status,'applied');row.markers.push({elapsedMs:Date.now()-row.startUnixMs,event:'receipt-backed closure'});
    }
    if(elapsed>=51000&&!stages.has(4)){
     stages.add(4);const v=await c.corePerspective(),op=v.opportunities.find(o=>o.pawn===second);assert(op,'Need a grounded optional work offer for scripted refusal');const p=await c.core().propose(second,op.action,'Would you take this optional '+op.action.kind+' task?');proposal=p.id;row.markers.push({elapsedMs:Date.now()-row.startUnixMs,event:'scripted work offer'});
    }
    if(elapsed>=62000&&!stages.has(5)){
     stages.add(5);const result=await c.pawn(second).decide(proposal!,{name:'scripted',async decide(){return {kind:'refuse',reason:'No thanks. I want to keep this time for myself.'};}});assert.equal(result.status,'refused');row.markers.push({elapsedMs:Date.now()-row.startUnixMs,event:'scripted refusal; no job'});
    }
    await c.reconcile();const state=await b.state();row.samples.push({elapsedMs:Date.now()-row.startUnixMs,unixMs:Date.now(),tick:state.ticks,paused:state.paused,epoch:state.epoch,jobs:state.pawns.map(p=>({id:p.id,job:p.job})),actions:state.actions});await delay(450);
   }
   await b.admin('pause');row.endUnixMs=Date.now();row.after=await system();
   if(rec){const code=await Promise.race([done!,delay(15000).then(()=>{throw Error('Recorder finalize timeout');})]);assert.equal(code,0);rec=undefined;const {stdout}=await exec('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',prefix+'.mp4'],{timeout:30000});row.media=JSON.parse(stdout);assert(Number(row.media.format.duration)>=74&&Number(row.media.format.duration)<=77);}
   row.domain=c.inspect();assert.equal(row.domain.coreState.topics.find((t:any)=>t.sourceId==='brief').status,'open');assert.equal(row.domain.proposals[proposal!].status,'refused');assert.equal(Object.values(row.domain.selfCare).length,1);
   if(variant==='capture'){
    const name='lab-concord-ui-end-'+run.slice(0,8);await c.checkpoint(name);await c.restore(name);assert.deepEqual(c.inspect().coreState,row.domain.coreState);assert.deepEqual(c.inspect().outcomes,row.domain.outcomes);row.pairedRestore=true;
    await writeFile(prefix+'-checkpoint.json',JSON.stringify({name,db:prefix+'-'+variant+'.db',selfCare:row.domain.selfCare,outcomes:row.domain.outcomes,coreState:row.domain.coreState}),{flag:'wx'});
    await ui('screenshot','observer-pilot-'+run.slice(0,8)+'.png');
   }
   store.close();store=undefined;c=undefined;
  }
 }
 out.passed=true;
}catch(e){out.error=String(e);process.exitCode=1;}
finally{
 if(rec&&rec.exitCode===null){rec.kill('SIGINT');await Promise.race([new Promise(r=>rec!.once('exit',r)),delay(5000)]);if(rec.exitCode===null)rec.kill('SIGKILL');}
 deadline=Date.now()+15000;try{await b.admin('pause');if(c&&store){const cleanup=await stopTrialWork(c);assert.deepEqual(cleanup.errors,[]);}}catch(e){out.cleanupError=String(e);out.passed=false;process.exitCode=1;}
 store?.close();await writeFile(path,JSON.stringify(out,null,2));console.log(JSON.stringify({run,mode,passed:out.passed,error:out.error}));
}
