import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {startNative} from './native-run.js';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
import {stopTrialWork} from '../src/work-trial.js';
import {retainedDomain} from './retention-policy.js';
import {socialCleanup} from './social-cleanup.js';
if(process.env.CONCORD_CAMPFIRE_LOCKED!=='1')throw Error('Exclusive lab lock required');
const root=new URL('../..',import.meta.url).pathname,deadline=Date.now()+480000;
let opDeadline=deadline;const b=new LabBridge(undefined,()=>opDeadline),cold=process.argv.includes('--cold');
const receipt:any={passed:false,inferenceCalls:0,cases:[],at:new Date().toISOString()},runId=randomUUID();let c:Coordinator|undefined,s:Store|undefined;
const check=()=>{if(Date.now()>deadline)throw Error('Scripted game deadline');};
const decide=(kind:'accept'|'refuse'|'defer')=>({name:'scripted-'+kind,async decide(){return {kind,reason:'Authored mechanics check: '+kind};}});
async function inventory(name:string){
 const code=`import json,sys,xml.etree.ElementTree as E; r=E.parse(sys.argv[1]); ts=r.findall('.//maps/li/things/thing'); count=lambda d:sum(int(t.findtext('stackCount') or '1') for t in ts if t.findtext('def')==d); print(json.dumps({'wood':count('WoodLog'),'meals':count('MealSimple'),'berries':count('RawBerries'),'campfires':count('Campfire'),'ownedBills':len(r.findall(".//li[@Class='Concord.ConcordBill']")),'unfinishedForbidden':sum(1 for t in ts if 'Campfire' in (t.findtext('def') or '') and t.findtext('def')!='Campfire' and t.findtext('forbidden')=='True')}))`;
 const result=await promisify(execFile)('python3',['-c',code,b.root+'/profile/Saves/'+name+'.rws'],{timeout:Math.max(1,Math.min(10000,opDeadline-Date.now()))});return JSON.parse(result.stdout);
}
async function pulse(until:()=>boolean,advance=true){
 const end=Math.min(deadline,Date.now()+90000);(receipt.resumes??=[]).push(await startNative(b));
 try{while(Date.now()<end){check();const sample=await b.state();if(sample.paused)throw Error('Unexpected pause during native mechanics check');await c!.reconcile();if(until())return;if(advance)await c!.advanceIntentions(()=>Date.now()<end);await delay(200);}throw Error('Native production condition timed out');}finally{await b.admin('pause');await c!.reconcile();}
}
async function offer(kind:'build'|'cook',name='Beatrice'){
 const v=await c!.corePerspective(),o=v.opportunities.find(o=>o.action.kind===kind&&v.crew.find(p=>p.id===o.pawn)?.name===name);assert(o,'Grounded '+kind+' option for '+name);
 return c!.core().propose(o.pawn,o.action,'Authored optional '+kind+' mechanics check');
}
try{
 const marker=root+'/.runtime/campfire-scripted-latest.json';
 if(cold){
  const saved=JSON.parse(await readFile(marker,'utf8'));s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);retainedDomain(c.inspect(),saved.domain);receipt.coldRestore=true;receipt.report=(await b.state()).crewLog;receipt.cases=saved.cases;
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/campfire-fixture.json','utf8'));await b.load(f.name);await b.admin('pause');
  const db=root+'/.runtime/campfire-scripted-'+runId+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();await c.initializeCore('Consider the crew’s shared needs and available supplies. Construction and cooking are separate optional agreements. Raw food is a valid alternative.');
  receipt.initial=await b.state();receipt.view=await c.corePerspective();assert.equal(receipt.view.crew.length,3);assert(receipt.view.sharedStatus.every((x:any)=>x.fresh));
  const before='lab-concord-fire-before-'+Date.now();await c.checkpoint(before);receipt.initialInventory=await inventory(before);assert.equal(receipt.initialInventory.berries,225);assert.equal(receipt.initialInventory.meals,0);
  // Refusal authorizes neither a blueprint nor a job.
  let p=await offer('build');await c.pawn(p.pawn).decide(p.id,decide('refuse'));assert.equal(Object.keys(c.inspect().outcomes).length,0);receipt.cases.push({kind:'refusal',jobs:0});await c.restore(before);
  // A counter is not permission to execute even when mechanically identical.
  p=await offer('build');await c.pawn(p.pawn).decide(p.id,{name:'scripted-counter',async decide(v){return {kind:'counter',reason:'Shorter construction time only.',action:{...v.proposal.action,maxTicks:3000}};}});assert.equal(Object.keys(c.inspect().outcomes).length,0);
  const adopted=await c.core().revise(p.id,'Fresh offer on the shorter terms');assert.equal(Object.keys(c.inspect().outcomes).length,0);
  await c.pawn(p.pawn).decide(adopted.id,decide('accept'));
  await pulse(()=>c!.inspect().proposals[adopted.id]!.standing?.status!=='running');
  assert.equal(c.inspect().proposals[adopted.id]!.standing?.status,'completed',JSON.stringify(c.inspect().outcomes));receipt.cases.push({kind:'build',outcomes:c.inspect().outcomes});
  const built='lab-concord-fire-built-'+Date.now();await c.checkpoint(built);receipt.builtInventory=await inventory(built);assert.equal(receipt.builtInventory.campfires,1);assert.equal(receipt.initialInventory.wood-receipt.builtInventory.wood,20);const builtDomain=c.inspect();await c.restore(built);retainedDomain(c.inspect(),builtDomain);
  // Separate consent to cook, and a smaller meal count requires a fresh answer.
  p=await offer('cook');assert.equal(p.action.kind,'cook');await c.pawn(p.pawn).decide(p.id,{name:'scripted-two-meals',async decide(v){return {kind:'counter',reason:'Two meals, not three.',action:{...v.proposal.action,meals:2}};}});
  const cooking=await c.core().revise(p.id,'Fresh offer: two simple meals');await c.pawn(p.pawn).decide(cooking.id,decide('accept'));
  await pulse(()=>c!.inspect().characters[p.pawn]!.commitment===undefined,false);
  assert.equal(c.inspect().proposals[cooking.id]!.standing?.status,'running');assert.equal(c.inspect().proposals[cooking.id]!.standing?.steps.length,1);
  const between='lab-concord-fire-between-'+Date.now();await c.checkpoint(between);receipt.betweenInventory=await inventory(between);assert.equal(receipt.betweenInventory.ownedBills,0);const betweenDomain=c.inspect();await c.restore(between);retainedDomain(c.inspect(),betweenDomain);
  await pulse(()=>c!.inspect().proposals[cooking.id]!.standing?.status!=='running');
  assert.equal(c.inspect().proposals[cooking.id]!.standing?.status,'completed',JSON.stringify(c.inspect().outcomes));
  assert.equal(Object.values(c.inspect().outcomes).filter(r=>r.kind==='cook').reduce((n,r)=>n+(r.delivered??0),0),2);receipt.cases.push({kind:'cook',twoMeals:true,betweenMealRestore:true,outcomes:c.inspect().outcomes});
  // Withdrawal is tested on the built checkpoint, preserving the completed fire.
  await c.restore(built);p=await offer('cook');await c.pawn(p.pawn).decide(p.id,decide('accept'));await c.pawn(p.pawn).withdraw('Authored pawn withdrawal before production');await c.reconcile();
  assert.equal(c.inspect().proposals[p.id]!.standing?.status,'stopped');assert.equal(Object.values(c.inspect().outcomes).filter(r=>r.kind==='cook').reduce((n,r)=>n+(r.delivered??0),0),0);receipt.cases.push({kind:'cook-withdrawal',zeroMeals:true});
  await c.restore(before);p=await offer('build');await c.pawn(p.pawn).decide(p.id,decide('accept'));await c.pawn(p.pawn).withdraw('Authored pawn withdrawal before construction');await c.reconcile();assert.equal(c.inspect().proposals[p.id]!.standing?.status,'stopped');receipt.cases.push({kind:'build-withdrawal',outcomes:c.inspect().outcomes});
  const checkpoint='lab-concord-fire-final-'+Date.now();await c.checkpoint(checkpoint);receipt.finalInventory=await inventory(checkpoint);assert.equal(receipt.finalInventory.campfires,0);assert.equal(receipt.finalInventory.ownedBills,0);assert.equal(receipt.finalInventory.unfinishedForbidden,1);const domain=c.inspect();await c.restore(checkpoint);retainedDomain(c.inspect(),domain);receipt.pairedRestore=true;receipt.report=(await b.state()).crewLog;
  await writeFile(marker,JSON.stringify({db,checkpoint,domain,cases:receipt.cases}));
 }
 check();receipt.passed=true;
}catch(e){receipt.error=String(e);if(c)receipt.domain=c.inspect();process.exitCode=1;}
finally{
 receipt.cleanup=await socialCleanup(async()=>{opDeadline=Date.now()+10000;await b.admin('pause');},async()=>{},async()=>{opDeadline=Date.now()+20000;return c?stopTrialWork(c):{errors:[]};});
 if(receipt.cleanup.errors.length){receipt.passed=false;process.exitCode=1;}s?.close();
 await writeFile(root+'/.runtime/campfire-scripted-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
