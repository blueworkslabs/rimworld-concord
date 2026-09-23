/** Paused, scripted visibility check. No model backend or job dispatch. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
import {foodLines} from '../src/food-observation.js';
if(process.env.CONCORD_FOOD_LOCKED!=='1')throw Error('Use locked food observation launcher');
const [mode,run]=process.argv.slice(2);if(!['game','cold'].includes(mode!)||!run||!/^[0-9a-f-]{36}$/.test(run))throw Error('Run identity required');
const root=new URL('../..',import.meta.url).pathname;let deadline=Date.now()+300000;
const b=new LabBridge(undefined,()=>deadline),prefix=root+'/.runtime/food-'+run;
const receipt:any={run,mode,passed:false,inferenceCalls:0,cases:[]};let s:Store|undefined,c:Coordinator|undefined;
async function open(name:string){s?.close();s=undefined;c=undefined;await b.load(name);await b.admin('pause');s=new Store(prefix+'-'+name+'.db');c=new Coordinator(s,b);await c.open();await c.initializeCore('Observe local food; no work requested.');}
async function view(){const v=await c!.corePerspective();assert(v.foodSightings);const board=(await b.state()).crewLog as any;assert.equal(board.foodText,foodLines(v.foodSightings).join('\n'));assert.equal(c!.crewSyncError,undefined);return v;}
try{
 if(mode==='cold'){
  const saved=JSON.parse(await readFile(prefix+'-checkpoint.json','utf8'));s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);
  const v=await view();receipt.view=v;const sight=v.foodSightings!.find(x=>x.observer===saved.observer)!;assert.equal(sight.status,'observed');assert(sight.status==='observed'&&sight.items.some(x=>x.thing===saved.thing&&x.count===75&&x.forbidden));receipt.coldRestore=true;
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/campfire-fixture.json','utf8'));
  let near:any,nearName='',farName='';
  for(const variant of ['near','far']){
   const name='lab-concord-food-'+variant+'-'+Date.now();
   const made=await promisify(execFile)('python3',[root+'/scripts/food-observation-fixture.py',b.root+'/profile/Saves/'+f.name+'.rws',b.root+'/profile/Saves/'+name+'.rws',variant],{timeout:Math.max(1,Math.min(10000,deadline-Date.now()))});
   const fixture=JSON.parse(made.stdout);await open(name);const v=await view(),sight=v.foodSightings!.find(x=>x.observer===fixture.observer)!;
   assert.equal(sight.status,'observed');assert(sight.status==='observed');assert.equal(sight.items.some(x=>x.thing===fixture.thing),variant==='near');assert.equal(sight.campfires.length,0);assert.equal(v.opportunities.length,0);
   if(variant==='near'){assert.equal(sight.items[0]!.count,75);assert.equal(sight.items[0]!.forbidden,true);assert.equal(sight.items[0]!.simpleMealIngredientCount,10);near=fixture;nearName=name;}
   if(variant==='far')farName=name;receipt.cases.push({variant,fixture,view:v});
  }
  // Observe an existing scripted completed checkpoint; do not repeat its jobs.
  const completed=JSON.parse(await readFile(root+'/.runtime/campfire-scripted-latest.json','utf8')).completed;
  await open(completed);const built=await view();assert(built.foodSightings!.some(x=>x.status==='observed'&&x.campfires.length>0));receipt.cases.push({variant:'previously-built-checkpoint',view:built});
  // Reopen the near fixture with a fresh store, then verify paired rewind and cold continuation.
  s?.close();s=undefined;c=undefined;await b.load(nearName);await b.admin('pause');const db=prefix+'-restore.db';s=new Store(db);c=new Coordinator(s,b);await c.open();await c.initializeCore('Observe local food; no work requested.');
  const checkpoint='lab-concord-food-paired-'+Date.now();await c.checkpoint(checkpoint);await b.load(farName);
  await c.restore(checkpoint);receipt.view=await view();receipt.pairedRestore=true;
  await writeFile(prefix+'-checkpoint.json',JSON.stringify({db,checkpoint,observer:near.observer,thing:near.thing}));
 }
 assert.equal(Object.keys(c!.inspect().proposals).length,0);receipt.noOffers=true;receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{
 deadline=Date.now()+15000;try{await b.admin('pause');}catch(e){receipt.cleanupError=String(e);receipt.passed=false;process.exitCode=1;}s?.close();
 await writeFile(prefix+'-'+mode+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify({passed:receipt.passed,error:receipt.error,run,mode}));
}
