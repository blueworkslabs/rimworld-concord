/** Operator-authored negative requests + one scripted pawn-owned meal. No inference. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
import {corePrompt} from '../src/core-planner.js';
import {stopTrialWork} from '../src/work-trial.js';
import type {EatRequest} from '../src/protocol.js';
if(process.env.CONCORD_FRESH_FACTS_LOCKED!=='1')throw Error('Use locked fresh facts launcher');
const [mode,run]=process.argv.slice(2);if(!['game','cold'].includes(mode!)||!run||!/^[0-9a-f-]{36}$/.test(run))throw Error('Run identity required');
const root=new URL('../..',import.meta.url).pathname,prefix=root+'/.runtime/fresh-facts-'+run,path=prefix+'-'+mode+'.json';
await writeFile(path,JSON.stringify({run,mode,status:'started'}),{flag:'wx'});
let deadline=Date.now()+360000;
const b=new LabBridge(undefined,()=>deadline),out:any={run,mode,passed:false,modelCalls:0,negativeRequests:[]};
let s:Store|undefined,c:Coordinator|undefined;
const actor='Thing_Human405',cleanup:EatRequest[]=[];
async function fixture(script:string,args:string[]){const r=await promisify(execFile)('python3',[root+'/scripts/'+script,...args],{timeout:Math.max(1,Math.min(10000,deadline-Date.now()))});return JSON.parse(r.stdout);}
try{
 if(mode==='cold'){
  const saved=JSON.parse(await readFile(prefix+'-checkpoint.json','utf8'));s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.name);await c.reconcile();
  assert.deepEqual(c.inspect().selfCare,saved.selfCare);assert.deepEqual(c.inspect().outcomes,saved.outcomes);assert.deepEqual(c.inspect().coreState,saved.coreState);
  const state=await b.state();assert.deepEqual(state.actions,saved.nativeActions);out.coldRestore=true;out.nativeActions=state.actions;out.prompt=corePrompt(await c.corePerspective());
 }else{
  const original=JSON.parse(await readFile(root+'/.runtime/campfire-fixture.json','utf8')),name='lab-concord-fresh-'+run.slice(0,8),save=b.root+'/profile/Saves/';
  out.fixture=await fixture('native-food-fixture.py',[save+original.name+'.rws',save+name+'.rws','hungry']);
  for(const variant of ['forbidden','far']){
   const altered=name+'-'+variant,info=await fixture('eating-diagnostic-fixture.py',[save+name+'.rws',save+altered+'.rws',variant]);
   await b.load(altered);await b.admin('pause');const g=await b.state();
   const request:EatRequest={id:randomUUID(),epoch:g.epoch,actor,action:{thing:info.thing,label:'berries',x:info.x,z:info.z,count:1,maxTicks:1800},mapId:g.pawns.find(p=>p.id===actor)!.eating!.mapId,untilTick:g.ticks+1800};cleanup.push(request);
   const receipt=await b.eat(request);out.negativeRequests.push({variant,request,receipt});assert.equal(receipt.status,'failed');assert.equal(receipt.failureCode,variant==='forbidden'?'food-forbidden':'outside-local-view');assert.equal(receipt.validatedTick,g.ticks);assert.equal(receipt.delivered,0);
  }
  await b.load(name);await b.admin('pause');const g=await b.state(),own=g.pawns.find(p=>p.id===actor)!;assert(own.eating!.options.length);
  const base:EatRequest={id:'unused',epoch:g.epoch,actor,action:own.eating!.options[0]!,mapId:own.eating!.mapId,untilTick:g.ticks+1800};
  for(const [code,change] of [
   ['request-map-changed',{mapId:-1}],['invalid-duration',{action:{...base.action,maxTicks:1799}}],
   ['food-missing',{action:{...base.action,thing:'Thing_Missing'}}],
   ['portion-out-of-bounds',{action:{...base.action,count:26}}],
   ['food-position-changed',{action:{...base.action,x:base.action.x+1}}],['deadline-expired',{untilTick:g.ticks}]
  ] as const){
   const request={...base,...change,id:randomUUID()};cleanup.push(request);const receipt=await b.eat(request);
   out.negativeRequests.push({variant:code,request,receipt});assert.equal(receipt.status,'failed');assert.equal(receipt.failureCode,code);assert.equal(receipt.validatedTick,g.ticks);assert.equal(receipt.delivered,0);
  }
  s=new Store(prefix+'.db');c=new Coordinator(s,b);await c.open();await c.initializeCore('One optional meal; this is not the whole food plan.');
  const pre='lab-concord-fresh-pre-'+run.slice(0,8);await c.checkpoint(pre);
  const q=await c.planCore({name:'scripted',async plan(){return {topics:[{sourceId:'brief',text:'Discuss food; this is an interpretation.',status:'open'}],actionTopicId:null,action:{kind:'ask',pawn:actor,text:'Would you like to eat?',reason:'Optional question'}};}});
  assert.equal(q.status,'applied');if(q.status!=='applied')throw Error();
  let called=0;const answer=await c.answerCoreQuestion(q.questionId!,{name:'scripted',async answerCore(v){called++;out.answerInput=v;return {choice:'eat',thing:v.pawn.eating!.options[0]!.thing,text:'I choose this portion.'};}});
  assert.equal(called,1);assert.equal(answer.status,'delivered');const care=Object.values(c.inspect().selfCare!)[0]!;assert.equal(c.inspect().outcomes[care.id]!.status,'started');
  const topic=c.inspect().coreState!.topics[0]!;assert.equal(topic.basedOnTick,g.ticks);assert.equal(topic.updatedTick,g.ticks);
  out.samples=[];for(let i=0;i<2;i++){await b.admin('run');if(!(await b.state()).paused)break;}assert.equal((await b.state()).paused,false);
  const end=Date.now()+35000;
  while(Date.now()<end){await c.reconcile();const state=await b.state();out.samples.push({tick:state.ticks,paused:state.paused,job:state.pawns.find(p=>p.id===actor)?.job});if(c.inspect().outcomes[care.id]!.status==='completed')break;await delay(250);}
  await b.admin('pause');await c.reconcile();const r=c.inspect().outcomes[care.id]!;assert.equal(r.status,'completed');assert(r.delivered!>0);assert(!r.failureCode);
  const closed=await c.planCore({name:'scripted',async plan(){return {topics:[{sourceId:care.id,text:'Confirmed own food consumption.',status:'resolved'}],actionTopicId:null,action:{kind:'wait',reason:'Leave the broad goal open'}};}});assert.equal(closed.status,'applied');
  assert.deepEqual(c.inspect().coreState!.topics[0],topic);out.prompt=corePrompt(await c.corePerspective());out.outcome=r;
  const checkpoint='lab-concord-fresh-post-'+run.slice(0,8);await c.checkpoint(checkpoint);const d=c.inspect(),nativeActions=(await b.state()).actions;
  await c.restore(pre);assert.equal(c.inspect().selfCare,undefined);assert.equal(c.inspect().coreState!.topics.length,0);
  await c.restore(checkpoint);assert.deepEqual(c.inspect().selfCare,d.selfCare);assert.deepEqual(c.inspect().coreState,d.coreState);assert.deepEqual(c.inspect().outcomes,d.outcomes);assert.deepEqual((await b.state()).actions,nativeActions);out.pairedRestore=true;
  await writeFile(prefix+'-checkpoint.json',JSON.stringify({db:prefix+'.db',name:checkpoint,selfCare:d.selfCare,coreState:d.coreState,outcomes:d.outcomes,nativeActions}),{flag:'wx'});
 }
 out.passed=true;
}catch(e){out.error=String(e);process.exitCode=1;}
finally{
 deadline=Date.now()+20000;
 try{await b.admin('pause');}catch(e){out.pauseError=String(e);out.passed=false;process.exitCode=1;}
 // A negative-test defect must not leave a mistakenly started native action running.
 for(const r of cleanup)try{const state=await b.state();if(state.epoch===r.epoch&&state.actions.some(a=>a.id===r.id&&a.status==='started'))await b.cancel({id:r.id,actor:r.actor,epoch:r.epoch,kind:'eat'});}catch(e){out.cleanupError=String(e);out.passed=false;process.exitCode=1;}
 if(c&&s)try{const stopped=await stopTrialWork(c);if(stopped.errors.length)throw Error(stopped.errors.join(';'));}catch(e){out.stopError=String(e);out.passed=false;process.exitCode=1;}
 s?.close();await writeFile(path,JSON.stringify(out,null,2));console.log(JSON.stringify({run,mode,passed:out.passed,error:out.error}));
}
