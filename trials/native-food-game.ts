/** Operator-only native diagnosis: no models, agreement dispatch or food overrides. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
if(process.env.CONCORD_NATIVE_FOOD_LOCKED!=='1')throw Error('Use locked native food launcher');
const [mode,run]=process.argv.slice(2);if(!['game','cold'].includes(mode!)||!run||!/^[0-9a-f-]{36}$/.test(run))throw Error('Run identity required');
const root=new URL('../..',import.meta.url).pathname,prefix=root+'/.runtime/native-food-'+run;
let deadline=Date.now()+300000;const b=new LabBridge(undefined,()=>deadline),path=prefix+'-'+mode+'.json';
await writeFile(path,JSON.stringify({run,mode,status:'started'}),{flag:'wx'});
const receipt:any={run,mode,passed:false,inferenceCalls:0,issuedJobs:0,cases:[]};let s:Store|undefined,c:Coordinator|undefined;
const probe=async()=>{await b.admin('pause');return (await b.admin('food-diagnostics')).foodDiagnostics;};
const alvin=(d:any)=>d.pawns.find((p:any)=>p.pawn==='Thing_Human405');
const berryCount=(d:any)=>alvin(d).berries.reduce((n:number,t:any)=>n+t.count,0);
try{
 if(mode==='cold'){
  const saved=JSON.parse(await readFile(prefix+'-checkpoint.json','utf8'));s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);receipt.restored=await probe();assert(alvin(receipt.restored).food>.8);assert(berryCount(receipt.restored)<225);receipt.coldRestore=true;
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/campfire-fixture.json','utf8'));await b.load(f.name);receipt.original=await probe();
  for(const variant of ['hungry','urgent']){
   const name='lab-concord-food-'+variant+'-'+run.slice(0,8);
   const made=await promisify(execFile)('python3',[root+'/scripts/native-food-fixture.py',b.root+'/profile/Saves/'+f.name+'.rws',b.root+'/profile/Saves/'+name+'.rws',variant],{timeout:Math.max(1,Math.min(10000,deadline-Date.now()))});
   await b.load(name);const before=await probe(),a=alvin(before);const row:any={variant,fixture:JSON.parse(made.stdout),before,samples:[]};receipt.cases.push(row);
   assert.equal(a.category,variant==='hungry'?'Hungry':'UrgentlyHungry');assert.equal(a.foodJobPriority,9.5);assert.equal(a.rawFoodGene,false);assert(a.rawMinimumSource?.startsWith('Thing_RawBerries'));
   assert(a.berries.every((t:any)=>t.willEat&&t.ingestibleNow&&!t.forbidden&&t.canReach&&t.canReserve));
   if(variant==='hungry')assert(!a.defaultSource);else assert(a.defaultSource?.startsWith('Thing_RawBerries'));
   await b.admin('run');const end=Date.now()+20000;
   while(Date.now()<end){const state=await b.state();row.samples.push({tick:state.ticks,paused:state.paused,pawns:state.pawns.map(p=>({id:p.id,job:p.job,food:p.facts?.find(f=>f.key==='need'&&f.value==='Food')?.level}))});await delay(250);}
   row.after=await probe();assert(row.samples.some((q:any)=>!q.paused));
   if(variant==='hungry'){assert.equal(berryCount(row.after),225);assert(alvin(row.after).food<.2);assert(!row.samples.some((q:any)=>q.pawns.some((p:any)=>p.job==='Ingest')));}
   else {assert(berryCount(row.after)<225);assert(alvin(row.after).food>.8);assert(row.samples.some((q:any)=>q.pawns.some((p:any)=>p.id==='Thing_Human405'&&p.job==='Ingest')));}
  }
  const db=prefix+'-restore.db';s=new Store(db);c=new Coordinator(s,b);await c.open();const checkpoint='lab-concord-food-'+run.slice(0,8);await c.checkpoint(checkpoint);await b.load(f.name);await c.restore(checkpoint);receipt.restored=await probe();assert(alvin(receipt.restored).food>.8);assert(berryCount(receipt.restored)<225);receipt.pairedRestore=true;await writeFile(prefix+'-checkpoint.json',JSON.stringify({db,checkpoint}),{flag:'wx'});
 }
 assert.equal(Object.keys(c!.inspect().proposals).length,0);assert.equal(Object.keys(c!.inspect().outcomes).length,0);receipt.noAgreements=true;receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{deadline=Date.now()+15000;try{await b.admin('pause');}catch(e){receipt.cleanupError=String(e);receipt.passed=false;process.exitCode=1;}s?.close();await writeFile(path,JSON.stringify(receipt,null,2));console.log(JSON.stringify({run,mode,passed:receipt.passed,error:receipt.error}));}
