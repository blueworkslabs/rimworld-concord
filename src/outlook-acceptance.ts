/** Bounded operator trial. Private outlook is never projected into the observer log. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from './coordinator.js';
import {Store} from './store.js';
import {LabBridge} from './lab-bridge.js';
import {DecisionChannel} from './decision-channel.js';
import {stopTrialWork,retireUndecided} from './work-trial.js';
if(process.env.CONCORD_RESCUE_LOCKED!=='1')throw Error('Use scripts/run-rescue-lab.sh outlook|outlook-cold');
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold'),scripted=process.argv.includes('--scripted');
const runId=process.env.CONCORD_TRIAL_ID;if(!runId||!/^[0-9a-f-]{36}$/.test(runId)||process.env.CONCORD_TRIAL_POLICY!=='outlook-v1')throw Error('Trial identity required');
const receipt:any={passed:false,runId,policy:'outlook-v1',mode:scripted?'scripted':'live',checks:[]};let c:Coordinator|undefined,s:Store|undefined,attempts=0,connected=true;
const send=(m:unknown)=>process.stdout.write(JSON.stringify(m)+'\n');
const channel=new DecisionChannel(raw=>{const m=raw as any;if(m.type==='decision-request'){if(cold||++attempts>6)throw Error('Outlook trial limit');}send(m);});
let drained:(()=>void)|undefined;const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>32000)throw Error('Response too large');const m=JSON.parse(line);if(m.type==='drained'&&m.id===runId){drained?.();return;}channel.receive(m);}catch{connected=false;channel.close();}});input.on('close',()=>{connected=false;channel.close();});
const timer=setTimeout(()=>channel.close(),120000);
async function finish(){channel.close();if(!connected)throw Error('Host disconnected');await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Drain timeout')),15000);drained=()=>{clearTimeout(t);resolve();};send({type:'drain',id:runId});});receipt.hostDrained=true;}
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/outlook-latest.json','utf8'));assert.equal(saved.runId,runId);assert.equal(saved.mode,receipt.mode);
  s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);assert.deepEqual(c.inspect().characters,saved.domain.characters);assert.deepEqual(c.inspect().proposals,saved.domain.proposals);assert.deepEqual(c.inspect().outcomes,saved.domain.outcomes);assert.deepEqual(c.inspect().crew?.entries,saved.domain.crew?.entries);assert.equal((await b.state()).pawns.find(p=>p.id===saved.target)?.currentBed,saved.patientBed);receipt.coldRestore=true;receipt.outlook=c.inspect().characters[saved.actor]?.outlook;receipt.report=(await b.state()).crewLog;
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/rescue-fixture.json','utf8'));await b.load(f.name);await b.admin('pause');const db=root+'/.runtime/outlook-'+runId+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();
  await b.admin('run');const end=Date.now()+10000;
  while(Date.now()<end){await c.observe();if(c.inspect().characters[f.rescuer]?.experiences?.some(e=>e.event.kind==='casualty'&&e.event.subject===f.target))break;await delay(100);}
  await b.admin('pause');await c.observe();assert(c.inspect().characters[f.rescuer]?.experiences?.some(e=>e.event.kind==='casualty'&&e.event.subject===f.target),'Own local casualty evidence required');
  const before=c.inspect(),pawns=(await b.state()).pawns,entries=before.crew?.entries??[],baseline='lab-concord-outlook-before-'+Date.now();await c.checkpoint(baseline);
  const reflection=await c.attend(f.rescuer,{name:channel.name,async reflect(v,signal){receipt.reflectionView=v;return channel.reflect(v,signal);}},{name:'unused',async assess(){throw Error('Expected direct event');}},{timeoutMs:90000});receipt.reflection=reflection;
  const revised=c.inspect().characters[f.rescuer]?.outlook;receipt.outlook=revised;if(scripted){assert.equal(reflection.status,'continued');assert.equal(revised?.revision,1);}
  assert.equal(Object.keys(c.inspect().proposals).length,0);assert.equal((await b.state()).actions.length,0);assert.deepEqual((await b.state()).pawns,pawns);assert.deepEqual(c.inspect().crew?.entries??[],entries);for(const id of Object.keys(before.characters))if(id!==f.rescuer)assert.deepEqual(c.inspect().characters[id]?.outlook,before.characters[id]?.outlook);
  receipt.checks.push('private reflection changes no jobs, native pawn facts, other outlooks or public entries');
  const retained='lab-concord-outlook-retained-'+Date.now();await c.checkpoint(retained);await c.restore(baseline);assert.equal(c.inspect().characters[f.rescuer]?.outlook,undefined);await c.restore(retained);assert.deepEqual(c.inspect().characters[f.rescuer]?.outlook,revised);receipt.checks.push('paired rewind removes future outlook; retained checkpoint restores it');
  const option=(await c.core().rescueOptions(f.rescuer))?.options.find(x=>x.target===f.target);assert(option,'Fresh grounded rescue option');let p=await c.core().propose(f.rescuer,option,'Would you carry this observed downed crewmate to this particular medical bed? This is optional rescue, not treatment; your choice remains yours.');
  try{p=await c.pawn(f.rescuer).decide(p.id,{name:channel.name,async decide(v,signal){assert.deepEqual(v.character.outlook,revised);receipt.decisionViewOutlook=v.character.outlook;return channel.decide(v,signal);}},90000);}catch(e){receipt.decisionError=String(e);await retireUndecided(c,p.id,'Decision unavailable; no retry');}
  if(scripted){assert.equal(p.status,'accepted');assert.deepEqual(receipt.decisionViewOutlook,revised);}
  receipt.proposal=c.inspect().proposals[p.id];
  if(p.status==='accepted'){
   await b.admin('run');const limit=Date.now()+20000;while(Date.now()<limit){await c.reconcile();await c.advanceIntentions();if(c.inspect().proposals[p.id]?.standing?.status!=='running')break;await delay(100);}await b.admin('pause');await c.reconcile();
  }
  if(scripted){assert.equal(c.inspect().proposals[p.id]?.standing?.status,'completed');assert((await b.state()).actions.some(a=>a.id===c!.inspect().proposals[p.id]?.actionId&&a.status==='completed'&&a.kind==='rescue'));}
  receipt.cleanup=await stopTrialWork(c);assert.equal(receipt.cleanup.errors.length,0);receipt.domain=c.inspect();receipt.outcomes=Object.values(c.inspect().outcomes);receipt.report=(await b.state()).crewLog;
  const checkpoint='lab-concord-outlook-final-'+Date.now();await c.checkpoint(checkpoint);const domain=c.inspect();await c.restore(checkpoint);assert.deepEqual(c.inspect().characters,domain.characters);assert.deepEqual(c.inspect().proposals,domain.proposals);assert.deepEqual(c.inspect().outcomes,domain.outcomes);assert.deepEqual(c.inspect().crew?.entries,domain.crew?.entries);receipt.pairedRestore=true;
  await writeFile(root+'/.runtime/outlook-latest.json',JSON.stringify({runId,mode:receipt.mode,db,checkpoint,domain,actor:f.rescuer,target:f.target,patientBed:(await b.state()).pawns.find(p=>p.id===f.target)?.currentBed}));
 }
 receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{
 clearTimeout(timer);try{await finish();}catch(e){receipt.passed=false;receipt.drainError=String(e);process.exitCode=1;}try{await b.admin('pause');if(c&&!cold){receipt.finalCleanup=await stopTrialWork(c);assert.equal(receipt.finalCleanup.errors.length,0);}}catch(e){receipt.passed=false;receipt.cleanupError=String(e);process.exitCode=1;}
 receipt.attempts=attempts;input.close();s?.close();await writeFile(root+'/.runtime/outlook-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));send({type:'receipt',receipt});
}
