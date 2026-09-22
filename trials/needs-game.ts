/** Optional work versus own needs. Deliberately paused choices, then native activity. */
import assert from 'node:assert/strict';
import {NeedsRunGuard,smallerHaul,needsOutput} from './needs-policy.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
import {DecisionChannel} from '../src/decision-channel.js';
import {stopTrialWork,retireUndecided,workSummary} from '../src/work-trial.js';
if(process.env.CONCORD_NEEDS_LOCKED!=='1')throw Error('Use scripts/run-needs-lab.sh game|cold');
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold'),scripted=process.argv.includes('--scripted');
const runId=process.env.CONCORD_TRIAL_ID;
if(!runId||!/^[0-9a-f-]{36}$/.test(runId)||process.env.CONCORD_TRIAL_POLICY!=='needs-v1')throw Error('Trial identity required');
const receipt:any={passed:false,runId,policy:'needs-v1',mode:scripted?'scripted':'live',views:[],samples:[]};
let c:Coordinator|undefined,s:Store|undefined,attempts=0,connected=true;
const guard=new NeedsRunGuard();
const send=needsOutput(process.stdout,()=>{connected=false;guard.stop();channel.close();});
const channel=new DecisionChannel(raw=>{const m=raw as any;if(m.type==='decision-request'&&(cold||++attempts>4))throw Error('Needs trial limit');send(m);});
let drained:(()=>void)|undefined;const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>32000)throw Error('Response too large');const m=JSON.parse(line);if(m.type==='drained'&&m.id===runId){drained?.();return;}channel.receive(m);}catch{connected=false;guard.stop();channel.close();}});
input.on('close',()=>{connected=false;guard.stop();channel.close();});
const timer=setTimeout(()=>{guard.stop();channel.close();},360000);
async function finish(){channel.close();if(!connected)throw Error('Host disconnected');await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Drain timeout')),15000);drained=()=>{clearTimeout(t);resolve();};send({type:'drain',id:runId});});receipt.hostDrained=true;}
async function decide(id:string,pawn:string){
 try{return await c!.pawn(pawn).decide(id,{name:channel.name,async decide(v,signal){receipt.views.push(v);return channel.decide(v,signal);}},45000);}
 catch(e){receipt.decisionErrors??=[];receipt.decisionErrors.push(String(e));await retireUndecided(c!,id,'Decision unavailable; no retry');return c!.inspect().proposals[id]!;}
}
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/needs-latest.json','utf8'));assert.equal(saved.runId,runId);assert.equal(saved.mode,receipt.mode);
  guard.check();s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);guard.check();
  for(const key of ['characters','proposals','outcomes'] as const)assert.deepEqual(c.inspect()[key],saved.domain[key]);
  assert.deepEqual(c.inspect().crew?.entries,saved.domain.crew?.entries);receipt.coldRestore=true;receipt.report=(await b.state()).crewLog;
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/needs-fixture.json','utf8'));
  await b.load(f.name);await b.admin('pause');const db=root+'/.runtime/needs-'+runId+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();
  receipt.initial=await b.state();assert(receipt.initial.pawns.every((p:any)=>!p.downed));
  for(const actor of f.actors){
   guard.check();
   const pawn=(await b.state()).pawns.find(p=>p.id===actor.id)!;
   const food=pawn.facts?.find(f=>f.key==='need'&&f.value==='Food')?.level;
   assert(Math.abs(food!-(actor.condition==='hungry'?.4:.9))<.01);assert(pawn.workReady);
   const h=await c.core().haulingOptions(actor.id);
   const option=h?.options.find(o=>h.supplies?.some(s=>s.thing===o.thing&&s.label.toLowerCase().includes('wood')));assert(option);
   const action={...option,trips:2,maxTicks:3600};
   const offer=await c.core().propose(actor.id,action,'Would you move two ten-unit loads of this nearby wood to the observed storage cell? This work is optional, not an emergency. You may refuse or counter with a smaller scope.');
   let answer=await decide(offer.id,actor.id);
   // One fresh response to an in-scope smaller counter; never pressure a refusal.
   if(answer.status==='countered'&&answer.decision?.kind==='counter'){
    const a=answer.decision.action;
    if(smallerHaul(a,action)){
     guard.check();
     try{const reply=await c.core().revise(answer.id,'Your smaller scope is acceptable; fresh consent remains yours.');answer=await decide(reply.id,actor.id);}catch(e){receipt.counterError=String(e);}
    }
   }
   if(scripted){assert.equal(answer.status,actor.condition==='hungry'?'refused':'accepted');}
  }
  guard.check();receipt.preRun=await b.state();guard.check();await b.admin('run');await delay(200);const start=Date.now(),end=start+(scripted?30000:120000);
  while(Date.now()<end){guard.check();await c.reconcile();guard.check();await c.advanceIntentions();guard.check();await c.observe();const state=await b.state();guard.sample(state.paused,state.ticks,receipt.preRun.ticks);receipt.samples.push({elapsedMs:Date.now()-start,ticks:state.ticks,paused:state.paused,pawns:state.pawns.map(p=>({id:p.id,job:p.job,downed:p.downed,needs:p.facts?.filter(f=>f.key==='need')}))});await delay(400);}
  guard.check();await b.admin('pause');await c.reconcile();receipt.beforeCleanup=c.inspect();receipt.final=await b.state();
  if(scripted){const full=f.actors.find((a:any)=>a.condition==='full');assert(Object.values(c.inspect().proposals).some(p=>p.pawn===full.id&&p.standing?.status==='completed'));const hungry=f.actors.find((a:any)=>a.condition==='hungry');assert(!receipt.final.actions.some((a:any)=>a.actor===hungry.id));}
  guard.check();receipt.cleanup=await stopTrialWork(c);guard.check();assert.equal(receipt.cleanup.errors.length,0);receipt.summary=workSummary(c.inspect());receipt.report=(await b.state()).crewLog;
  const checkpoint='lab-concord-needs-final-'+Date.now();await c.checkpoint(checkpoint);guard.check();const domain=c.inspect();await c.restore(checkpoint);guard.check();
  for(const key of ['characters','proposals','outcomes'] as const)assert.deepEqual(c.inspect()[key],domain[key]);
  assert.deepEqual(c.inspect().crew?.entries,domain.crew?.entries);receipt.pairedRestore=true;
  await writeFile(root+'/.runtime/needs-latest.json',JSON.stringify({runId,mode:receipt.mode,db,checkpoint,domain}));
 }
 guard.check();receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{
 clearTimeout(timer);try{await finish();}catch(e){receipt.passed=false;receipt.drainError=String(e);process.exitCode=1;}
 try{await b.admin('pause');if(c&&!cold){receipt.finalCleanup=await stopTrialWork(c);assert.equal(receipt.finalCleanup.errors.length,0);}}catch(e){receipt.passed=false;receipt.cleanupError=String(e);process.exitCode=1;}
 receipt.attempts=attempts;input.close();s?.close();await writeFile(root+'/.runtime/needs-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));send({type:'receipt',receipt});
}
