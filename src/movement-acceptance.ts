/** Scripted grounding trial. Holds the coordinator lock externally; never uses inference. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from './coordinator.js';
import {Store} from './store.js';
import {LabBridge} from './lab-bridge.js';
import {scripted} from './backends.js';
const exec=promisify(execFile),root=new URL('../..',import.meta.url).pathname;
const bridge=new LabBridge(),cold=process.argv.includes('--cold'),checks:string[]=[];
await mkdir(root+'/.runtime',{recursive:true});
let store:Store|undefined;
const receipt:Record<string,unknown>={at:new Date().toISOString(),phase:cold?'cold':'game',inferenceCalls:0,passed:false,checks};
try {
 if(cold) {
  const previous=JSON.parse(await readFile(root+'/.runtime/movement-latest.json','utf8'));
  store=new Store(previous.db);const c=new Coordinator(store,bridge);await c.restore(previous.checkpoint);
  assert.deepEqual(c.inspect().characters,previous.characters);
  assert.deepEqual(c.inspect().proposals,previous.proposals);
  assert.deepEqual(c.inspect().outcomes,previous.outcomes);
  const state=await bridge.state();assert.notEqual(state.epoch,previous.epoch);assert(state.paused);
  for(const p of state.pawns) {assert.equal(p.movement!.epoch,state.epoch);assert.equal(p.movement!.tick,state.ticks);}
  checks.push('cold paired restore preserves decisions/outcomes and recomputes options in the new epoch');
 } else {
  await bridge.load('lab-initial');await bridge.admin('pause');
  const db=root+'/.runtime/movement-'+Date.now()+'.db';store=new Store(db);
  const c=new Coordinator(store,bridge);await c.open();const initial=await bridge.state();
  const counts=[];
  for(const pawn of initial.pawns) {
   const view=await c.core().movementOptions(pawn.id);assert(view);assert.equal(view.epoch,initial.epoch);
   assert(view.options.length>1&&view.options.length<=12);assert.equal(view.status,'available');
   assert.equal(new Set(view.options.map(o=>`${o.x},${o.z}`)).size,view.options.length);
   assert(view.options.every(o=>o.kind==='move'&&Math.abs(o.x-view.originX)+Math.abs(o.z-view.originZ)<=3));
   counts.push({pawn:pawn.id,options:view.options.length});
  }
  receipt.shortlists=counts;
  assert.equal((await bridge.state()).actions.length,initial.actions.length);
  checks.push('three bounded owner-specific shortlists; querying creates no action');
  const pawn=initial.pawns[0]!,options=(await c.core().movementOptions(pawn.id))!;
  const p=await c.core().propose(pawn.id,options.options[0]!,'Scripted grounded offer');
  await c.pawn(pawn.id).decide(p.id,{name:'scripted-grounded-counter',async decide(view){
   assert.deepEqual(view.pawn.movement,options);
   return {kind:'counter',reason:'Scripted preference for another observed destination',action:view.pawn.movement!.options[1]};
  }});
  assert.equal((await bridge.state()).actions.length,initial.actions.length);
  const revised=await c.core().revise(p.id,'Offer the observed alternative for fresh consent');
  const accepted=await c.pawn(pawn.id).decide(revised.id,scripted({kind:'accept',reason:'Scripted fresh consent'}));
  const request={id:accepted.actionId!,epoch:initial.epoch,actor:pawn.id,action:revised.action};
  assert.equal((await bridge.move(request)).id,request.id);
  await bridge.admin('run');
  const end=Date.now()+20000;
  while(Date.now()<end){await delay(200);await c.reconcile();if(c.inspect().outcomes[request.id]!.status!=='started')break;}
  await bridge.admin('pause');assert.equal(c.inspect().outcomes[request.id]!.status,'completed');
  checks.push('observed counter requires fresh consent, completes in native game, duplicate ID creates no extra action');
  const other=initial.pawns[1]!,otherOptions=(await c.core().movementOptions(other.id))!;
  const refusal=await c.core().propose(other.id,otherOptions.options[0]!,'Scripted optional walk');
  const before=(await bridge.state()).actions.length;
  await c.pawn(other.id).decide(refusal.id,scripted({kind:'refuse',reason:'A reachable option is not an obligation'}));
  assert.equal((await bridge.state()).actions.length,before);checks.push('reachable proposal can still be refused without a job');
  // Small polling sample: performance evidence, not a sustained benchmark.
  const start=await bridge.state(),wall=Date.now();await bridge.admin('run');let samples=0;
  while(Date.now()-wall<5000){await bridge.state();samples++;await delay(100);}
  await bridge.admin('pause');const finish=await bridge.state();
  assert(finish.ticks>start.ticks);receipt.polling={samples,ticks:finish.ticks-start.ticks,wallMs:Date.now()-wall};
  const checkpoint='lab-concord-movement-'+Date.now();await c.checkpoint(checkpoint);
  const expected=c.inspect();await c.restore(checkpoint);assert.deepEqual(c.inspect().characters,expected.characters);
  await assert.rejects(bridge.move({...request,id:randomUUID()}),/Stale/);
  checks.push('paired restore preserves outcomes and rejects an old-epoch movement request');
  const oldOption=(await c.core().movementOptions(pawn.id))!.options[0]!;
  // Operator-only fixture mutation: copy our own save and draft one pawn. Never overwrite a paired save.
  const drafted='lab-concord-drafted-'+Date.now();
  await exec('python3',['-c',`import sys,xml.etree.ElementTree as E
src,dst,pawn=sys.argv[1:]
r=E.parse(src)
things=[t for t in r.findall('.//thing') if 'Thing_'+str(t.findtext('id'))==pawn]
assert len(things)==1
d=things[0].find('drafter'); assert d is not None
v=d.find('drafted')
if v is None: v=E.SubElement(d,'drafted')
v.text='True'
with open(dst,'xb') as out: r.write(out,encoding='utf-8',xml_declaration=True)
`,bridge.root+'/profile/Saves/'+checkpoint+'.rws',bridge.root+'/profile/Saves/'+drafted+'.rws',pawn.id]);
  await bridge.load(drafted);const changed=await bridge.state(),own=changed.pawns.find(p=>p.id===pawn.id)!;
  assert.equal(own.movement!.status,'unavailable');assert.deepEqual(own.movement!.options,[]);
  const rejected=await bridge.move({id:randomUUID(),epoch:changed.epoch,actor:pawn.id,action:oldOption});
  assert.equal(rejected.status,'failed');assert.match(rejected.reason,/voluntary job/);
  checks.push('operator-drafted save copy offers no movement; previously offered coordinate is rejected by native actor revalidation');
  await c.restore(checkpoint);const restored=await bridge.state();
  assert.equal(restored.pawns.find(p=>p.id===pawn.id)!.movement!.status,'available');
  await writeFile(root+'/.runtime/movement-latest.json',JSON.stringify({db,checkpoint,epoch:restored.epoch,
   characters:c.inspect().characters,proposals:c.inspect().proposals,outcomes:c.inspect().outcomes}));
  receipt.limitation='Scripted choices; drafted state is an operator-modified copy of a disposable save, not a naturally occurring interruption. Native reachability is not a route-safety guarantee.';
 }
 receipt.passed=true;
} catch(error){receipt.error=String(error);process.exitCode=1;}
finally{try{await bridge.admin('pause');}catch{}store?.close();await writeFile(root+'/.runtime/movement-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));}
