import {stopTrialWork} from '../src/work-trial.js';
import {DecisionChannel} from '../src/decision-channel.js';
/** Scripted choices, native ingestion; no character inference. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
if(process.env.CONCORD_PAWN_EATING_LOCKED!=='1')throw Error('Use locked pawn eating launcher');
const [mode,run]=process.argv.slice(2);if(!['game','cold'].includes(mode!)||!run||!/^[0-9a-f-]{36}$/.test(run))throw Error('Run identity required');
const root=new URL('../..',import.meta.url).pathname,prefix=root+'/.runtime/pawn-eating-'+run,path=prefix+'-'+mode+'.json';
await writeFile(path,JSON.stringify({run,mode,status:'started'}),{flag:'wx'});
let deadline=Date.now()+300000;const b=new LabBridge(undefined,()=>deadline),out:any={run,mode,passed:false,modelCalls:0,cases:[]};let s:Store|undefined,c:Coordinator|undefined;
const actor='Thing_Human405';
const probe=async()=>{await b.admin('pause');return (await b.admin('food-diagnostics')).foodDiagnostics;};
const own=(d:any)=>d.pawns.find((p:any)=>p.pawn===actor);
const count=(d:any)=>own(d).berries.reduce((n:number,t:any)=>n+t.count,0);
try{
 if(mode==='cold'){
  const checkpoints=JSON.parse(await readFile(prefix+'-checkpoints.json','utf8'));
  for(const cp of checkpoints){s=new Store(cp.db);c=new Coordinator(s,b);await c.restore(cp.name);await c.reconcile();const d=c.inspect();assert.deepEqual(d.selfCare,cp.selfCare);assert.deepEqual(d.outcomes,cp.outcomes);if(cp.coreState)assert.deepEqual(d.coreState,cp.coreState);out.cases.push({variant:cp.variant,restored:true,domain:d});s.close();s=undefined;}
  out.coldRestore=true;
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/campfire-fixture.json','utf8')),name='lab-concord-eat-fixture-'+run.slice(0,8);
  await promisify(execFile)('python3',[root+'/scripts/native-food-fixture.py',b.root+'/profile/Saves/'+f.name+'.rws',b.root+'/profile/Saves/'+name+'.rws','hungry'],{timeout:10000});
  const checkpoints=[];
  for(const variant of ['speech','eat','stop','cleanup']){
   await b.load(name);const before=await probe();assert.equal(count(before),225);assert.equal(own(before).category,'Hungry');
   const db=prefix+'-'+variant+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();await c.initializeCore('One optional question. Pawns own their choices.');
   const pre='lab-concord-eat-pre-'+variant+'-'+run.slice(0,8);await c.checkpoint(pre);
   const q=await c.planCore({name:'scripted',async plan(){return {topics:[{sourceId:'brief',text:'Food coordination remains broader than one eating action.',status:'open'}],actionTopicId:null,action:{kind:'ask',pawn:actor,text:'Would you like something to eat?',reason:'Optional self-care question'}};}});assert.equal(q.status,'applied');if(q.status!=='applied')throw Error();
   const requests:any[]=[];const relay=new DecisionChannel(r=>requests.push(r));
   const pending=c.answerCoreQuestion(q.questionId!,relay);
   while(!requests.length){if(Date.now()>=deadline)throw Error('No relayed question');await delay(10);}
   const request=requests[0];assert.equal(request.mode,'core-answer');const v=request.view;assert(v.pawn.eating.options.length>0);
   relay.receive({type:'decision-result',id:request.id,output:variant==='speech'?{choice:'say',text:'Pedro, I will eat some berries.'}:{choice:'eat',thing:v.pawn.eating.options[0].thing,text:'I choose this portion of berries now.'}});
   const answer=await pending;assert.equal(answer.status,'delivered');assert.equal(requests.length,1);relay.close();
   const selected=Object.values(c.inspect().selfCare??{})[0];
   const reply=c.inspect().coreState!.questions.find(a=>a.id===q.questionId)!.messages.at(-1)!;assert.equal(reply.to,'core');assert(!c.inspect().characters['Thing_Human411']!.messages?.some(m=>m.id===reply.id));
   const closureChoice=(status:string)=>({topics:[{sourceId:reply.id,text:'This question response and any eating action.',status}],actionTopicId:null,action:{kind:'wait',reason:'No new authority.'}});
   assert.equal((await c.planCore({name:'scripted-early-close',async plan(){return closureChoice('resolved');}})).status,'failed');
   assert.equal((await c.planCore({name:'scripted-open',async plan(){return closureChoice('open');}})).status,'applied');
   if(selected){assert.equal(c.inspect().outcomes[selected.id]!.status,'started');const repeated=await b.eat({id:selected.id,epoch:c.inspect().epoch,actor,action:selected.action,mapId:selected.mapId,untilTick:selected.untilTick});assert.equal(repeated.status,'started');await assert.rejects(b.eat({id:selected.id,epoch:c.inspect().epoch,actor,action:{...selected.action,thing:'wrong'},mapId:selected.mapId,untilTick:selected.untilTick}));}
   if(variant==='stop'){await c.pawn(actor).stopEating();}
   if(variant==='cleanup'){const cleaned=await stopTrialWork(c);assert.deepEqual(cleaned.errors,[]);assert.deepEqual(cleaned.operatorStops,[actor]);}
   const row:any={variant,before,answer,selected,samples:[]};out.cases.push(row);
   await b.admin('run');const end=Date.now()+20000;
   while(Date.now()<end){await c.reconcile();const g=await b.state();row.samples.push({tick:g.ticks,job:g.pawns.find(p=>p.id===actor)?.job,actions:g.actions});await delay(250);}
   row.after=await probe();await c.reconcile();row.domain=c.inspect();assert.equal(Object.keys(row.domain.proposals).length,0);
   if(variant==='eat'){const r=row.domain.outcomes[selected!.id];assert.equal(r.status,'completed');assert(r.delivered>0&&r.delivered<=selected!.action.count);assert.equal(count(before)-count(row.after),r.delivered);assert(own(row.after).food>.8);assert(row.samples.some((s:any)=>s.job==='Concord_Eat'));}
   else {assert.equal(count(row.after),225);assert(own(row.after).food<.2);if(selected)assert.equal(row.domain.outcomes[selected.id].status,'interrupted');else assert.equal(Object.keys(row.domain.outcomes).length,0);}
   assert.equal(row.domain.characters[actor].commitment,undefined);
   row.closureView=await c.corePerspective();
   row.closure=await c.planCore({name:'scripted-close',async plan(){return closureChoice('resolved');}});assert.equal(row.closure.status,variant==='eat'?'applied':'failed');
   row.broadClosure=await c.planCore({name:'scripted-broad-close',async plan(){return {...closureChoice('resolved'),topics:[{sourceId:'brief',text:'Whole food plan done',status:'resolved'}]};}});assert.equal(row.broadClosure.status,'failed');
   row.domain=c.inspect();assert.equal(row.domain.coreState.topics.find((t:any)=>t.sourceId==='brief').status,'open');assert.equal(row.domain.coreState.topics.find((t:any)=>t.sourceId===reply.id).status,variant==='eat'?'resolved':'open');
   const cp='lab-concord-eat-'+variant+'-'+run.slice(0,8);await c.checkpoint(cp);
   const oldEpoch=c.inspect().epoch;await c.restore(pre);assert.equal(c.inspect().selfCare,undefined);assert.equal(c.inspect().coreState!.topics.length,0);if(selected)await assert.rejects(b.eat({id:randomUUID(),epoch:oldEpoch,actor,action:selected.action,mapId:selected.mapId,untilTick:selected.untilTick}));
   await c.restore(cp);assert.deepEqual(c.inspect().selfCare,row.domain.selfCare);assert.deepEqual(c.inspect().outcomes,row.domain.outcomes);assert.deepEqual(c.inspect().coreState,row.domain.coreState);row.pairedRestore=true;
   checkpoints.push({variant,db,name:cp,selfCare:row.domain.selfCare??null,outcomes:row.domain.outcomes,coreState:row.domain.coreState});
   // Missing optional selfCare is distinct from an empty record in old saves.
   if(!row.domain.selfCare)delete checkpoints.at(-1)!.selfCare;
   s.close();s=undefined;
  }
  await writeFile(prefix+'-checkpoints.json',JSON.stringify(checkpoints),{flag:'wx'});
 }
 out.passed=true;
}catch(e){out.error=String(e);process.exitCode=1;}
finally{deadline=Date.now()+15000;try{await b.admin('pause');}catch(e){out.cleanupError=String(e);out.passed=false;process.exitCode=1;}if(c)for(const care of Object.values(c.inspect().selfCare??{}))if(c.inspect().characters[care.pawn]?.commitment===care.id)try{await c.pawn(care.pawn).stopEating();}catch(e){out.stopError=String(e);out.passed=false;process.exitCode=1;}if(c&&s){const cleaned=await stopTrialWork(c);if(cleaned.errors.length){out.sharedCleanup=cleaned;out.passed=false;process.exitCode=1;}}s?.close();await writeFile(path,JSON.stringify(out,null,2));console.log(JSON.stringify({run,mode,passed:out.passed,error:out.error}));}
