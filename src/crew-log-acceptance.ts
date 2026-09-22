/** Disposable scripted fixture, operator-only; no inference. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from './coordinator.js';
import {Store} from './store.js';
import {LabBridge} from './lab-bridge.js';
import {scripted} from './backends.js';
import {crewReport} from './crew-log.js';
import {stopTrialWork} from './work-trial.js';
if(process.env.CONCORD_CREW_LOG_LOCKED!=='1')throw Error('Use scripts/run-crew-log-lab.sh game|cold');
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold');
const receipt:any={passed:false,inferenceCalls:0,checks:[]},checks:string[]=receipt.checks;let c:Coordinator|undefined,s:Store|undefined;
async function report(){assert.equal(c!.crewSyncError,undefined);const g=await b.state();assert(g.crewLog);assert.equal(g.crewLog.epoch,g.epoch);assert(!JSON.stringify(g.crewLog).includes('PRIVATE_SENTINEL'));return g.crewLog;}
async function finish(id:string){await b.admin('run');const end=Date.now()+30000;while(Date.now()<end){await c!.reconcile();if(c!.inspect().outcomes[id]?.status!=='started')break;await delay(100);}await b.admin('pause');await c!.reconcile();assert.equal(c!.inspect().outcomes[id]?.status,'completed');}
try {
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/crew-log-latest.json','utf8'));await b.load(saved.checkpoint);await b.admin('pause');const offline=await b.state();assert(offline.crewLog);assert.notEqual(offline.crewLog.epoch,offline.epoch);assert.deepEqual(offline.crewLog.entries,saved.report.entries);checks.push('game save alone preserves the cached log before coordinator restore');
  s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);
  const r=await report();assert.deepEqual(r.entries,saved.report.entries);assert.deepEqual(r.agreements.map(a=>a.progress.completed),saved.report.agreements.map((a:any)=>a.progress.completed));assert.equal((await b.state()).pawns.find(p=>p.id===saved.target)?.currentBed,saved.bed);receipt.report=r;checks.push('cold restore preserves messages, progress and exact-bed rescue with no inference');
 }else{
  const f=JSON.parse(await readFile(root+'/.runtime/reconsider-fixture.json','utf8'));await b.load(f.name);await b.admin('pause');const db=root+'/.runtime/crew-log-'+Date.now()+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();
  const d=s.read()!;d.characters[f.actor]!.memories.push('PRIVATE_SENTINEL');d.characters[f.actor]!.reflections=[{tick:0,throughSeq:0,backend:'fixture',reason:'PRIVATE_SENTINEL'}];s.commit(d,{branch:d.branch,kind:'fixture',actor:'operator',data:{}});await c.open();
  const a=(await c.core().haulingOptions(f.actor))!.options.find(a=>a.thing===f.action.thing&&a.x===f.action.x&&a.z===f.action.z&&a.trips>=3)!;assert(a);
  const p=await c.core().propose(f.actor,{...a,trips:3},'Please move up to three ten-unit loads of steel.');await c.pawn(f.actor).decide(p.id,scripted({kind:'accept',reason:'I can help with those supplies.'}));await finish(c.inspect().proposals[p.id]!.actionId!);
  const first=await report(),progress=first.agreements.find(a=>a.progress.id===p.id)!.progress;assert.equal(progress.completed,1);assert.equal(progress.notStarted,2);assert.equal(progress.unfulfilled,2);
  let requestViewChecked=false;const reflected=await c.attend(f.actor,{name:'scripted',async reflect(v){assert.equal(v.agreementProgress!.completed,1);assert.equal(v.agreementProgress!.notStarted,2);requestViewChecked=true;return {kind:'request_rescue',agreementId:p.id,target:f.target,reason:'Could we discuss helping Beatrice before I finish the supplies?'};}});assert(requestViewChecked);assert.equal(reflected.status,'continued');
  const baseline='lab-concord-crew-base-'+Date.now();await c.checkpoint(baseline);const request=c.core().requests()[0]!;const rescue=(await c.core().rescueOptions(f.actor))!.options.find(a=>a.target===f.target)!;assert(rescue);
  const no=await c.core().offerAlternative(request.id,rescue,'Would you replace the remaining hauling with this rescue?');await c.pawn(f.actor).decide(no.id,scripted({kind:'refuse',reason:'I will keep the existing agreement for now.'}));const future=await report();assert(future.entries.some(e=>e.text.includes('keep the existing agreement')));assert.equal(c.inspect().characters[f.actor]!.intention,p.id);
  await c.restore(baseline);assert(!(await report()).entries.some(e=>e.text.includes('keep the existing agreement')));checks.push('paired restore excludes discarded future messages; refusal leaves work intact');
  const yes=await c.core().offerAlternative(request.id,rescue,'Could you replace the remaining hauling with this exact-bed rescue?');let decisionViewChecked=false;
  await c.pawn(f.actor).decide(yes.id,{name:'scripted',async decide(v){assert.equal(v.agreementProgress!.completed,1);assert.equal(v.agreementProgress!.unfulfilled,2);decisionViewChecked=true;return {kind:'accept',reason:'My haul is wrapped up; I will rescue Beatrice.'};}});assert(decisionViewChecked);await finish(c.inspect().proposals[yes.id]!.actionId!);
  const final=await report();assert(final.entries.some(e=>e.kind==='message'&&e.text.includes('My haul is wrapped up')));assert.equal(final.agreements.find(a=>a.progress.id===p.id)!.progress.completed,1);assert.equal(final.agreements.find(a=>a.progress.id===p.id)!.progress.status,'stopped');assert.equal(final.agreements.find(a=>a.progress.id===yes.id)!.progress.completed,1);
  checks.push('own progress supplied to reflection and replacement decision; statements and receipts remain distinct; private fixture memories excluded');
  await assert.rejects(b.setCrewLog({...final,epoch:'discarded'}),/Stale/);await assert.rejects(b.setCrewLog({...final,revision:0}),/Older/);assert.deepEqual((await report()).entries,final.entries);checks.push('stale epoch and older revision rejected without replacing display');
  const checkpoint='lab-concord-crew-'+Date.now();await c.checkpoint(checkpoint);const domain=c.inspect();await b.load(checkpoint);await b.admin('pause');const offline=await b.state();assert(offline.crewLog);assert.notEqual(offline.crewLog.epoch,offline.epoch);assert.deepEqual(offline.crewLog.entries,final.entries);checks.push('offline game load preserves cached report before coordinator publication');await c.restore(checkpoint);const restored=await report();assert.deepEqual(restored.entries,final.entries);assert.deepEqual(c.inspect().proposals,domain.proposals);
  await writeFile(root+'/.runtime/crew-log-latest.json',JSON.stringify({db,checkpoint,report:restored,target:f.target,bed:rescue.bed}));receipt.report=restored;receipt.patientBed=(await b.state()).pawns.find(p=>p.id===f.target)?.currentBed;assert.equal(receipt.patientBed,rescue.bed);checks.push('exact native rescue and paired UI/domain restore passed');
 }
 receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{try{await b.admin('pause');if(c){receipt.cleanup=await stopTrialWork(c);if(receipt.cleanup.errors.length)throw Error('Cleanup incomplete');}}catch(e){receipt.cleanupError=String(e);receipt.passed=false;process.exitCode=1;}s?.close();await writeFile(root+'/.runtime/crew-log-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));}
