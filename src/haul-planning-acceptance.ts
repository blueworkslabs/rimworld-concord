/** Operator-only coordination trial. All choices are scripted; no model calls. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from './coordinator.js';
import {Store} from './store.js';
import {LabBridge} from './lab-bridge.js';
import {scripted} from './backends.js';
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold');
const checks:string[]=[],receipt:Record<string,unknown>={at:new Date().toISOString(),phase:cold?'cold':'game',passed:false,inferenceCalls:0,checks};
let store:Store|undefined;
async function finish(c:Coordinator,ids:string[]){
 await b.admin('run');const end=Date.now()+45000;
 while(Date.now()<end){await delay(200);await c.reconcile();if(ids.every(id=>c.inspect().outcomes[id]?.status!=='started'))break;}
 await b.admin('pause');for(const id of ids){const r=c.inspect().outcomes[id];assert.equal(r?.status,'completed',JSON.stringify(r));assert.equal(r?.delivered,10);}
}
try{
 await mkdir(root+'/.runtime',{recursive:true});
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/haul-planning-latest.json','utf8'));
  store=new Store(saved.db);const c=new Coordinator(store,b);await c.restore(saved.checkpoint);
  assert.deepEqual(c.inspect().characters,saved.domain.characters);assert.deepEqual(c.inspect().proposals,saved.domain.proposals);
  assert.notEqual(c.inspect().epoch,saved.domain.epoch);
  for(const p of Object.values(c.inspect().proposals))await assert.rejects(c.core().propose(p.pawn,p.action,'Duplicate work'),/held/);
  for(let trip=2;trip<=3;trip++){
   await c.advanceIntentions();await finish(c,Object.values(c.inspect().proposals).filter(p=>p.standing?.status==='running').map(p=>p.actionId!));
  }
  await c.advanceIntentions();assert(Object.values(c.inspect().proposals).filter(p=>p.status==='accepted').every(p=>p.standing?.status==='completed'&&p.standing.steps.length===3));
  checks.push('cold restore retains three pawn-owned holds between trips; remaining six trips deliver without inference');
 }else{
  const fixture=JSON.parse(await readFile(root+'/.runtime/haul-fixture.json','utf8'));await b.load(fixture.name);await b.admin('pause');
  const db=root+'/.runtime/haul-planning-'+Date.now()+'.db';store=new Store(db);const c=new Coordinator(store,b);await c.open();
  const initial=await b.state();assert.equal(initial.pawns.length,3);const before=initial.actions.length;
  receipt.observations=initial.pawns.map(p=>({pawn:p.id,hauling:p.hauling}));
  const offers=[];
  for(const pawn of initial.pawns){
   const view=await c.core().haulingOptions(pawn.id);assert(view?.supplies?.length);assert.equal(view.epoch,initial.epoch);assert.equal(view.tick,initial.ticks);
   const action=view.options.find(a=>a.trips===3);assert(action,'Need three observed trips');
   const supply=view.supplies.find(s=>s.thing===action.thing&&s.x===action.x&&s.z===action.z)!;
   assert(supply.sourceCount>=30&&supply.destinationFree>=30);
   offers.push(await c.core().propose(pawn.id,action,'Scripted three-trip coordinated supply work'));
  }
  assert.equal(new Set(offers.map(p=>p.action.kind==='haul'?p.action.thing:'')).size,3);
  assert.equal(new Set(offers.map(p=>p.haulMap+':'+p.action.x+':'+p.action.z)).size,3);
  assert.equal((await b.state()).actions.length,before);
  await assert.rejects(c.core().propose(offers[1]!.pawn,offers[0]!.action,'Competing offer'),/held/);
  checks.push('three supply-informed offers choose distinct sources and storage cells before consent; no query or hold creates a native job');
  receipt.offers=offers.map(p=>({pawn:p.pawn,action:p.action,mapId:p.haulMap}));
  // A refusal frees its plan without changing inventory or scheduling work.
  const refused=offers[1]!;await c.pawn(refused.pawn).decide(refused.id,scripted({kind:'refuse',reason:'Scripted refusal'}));
  assert.equal((await b.state()).actions.length,before);
  const replacement=await c.core().propose(refused.pawn,refused.action,'New optional offer');
  await c.core().withdrawOffer(replacement.id,'Scripted abandoned plan');
  offers[1]=await c.core().propose(refused.pawn,refused.action,'Fresh offer after release');
  checks.push('refusal and pending-offer withdrawal release planning holds without native action');
  for(const p of offers)await c.pawn(p.pawn).decide(p.id,scripted({kind:'accept',reason:'Scripted three-trip consent'}));
  await finish(c,offers.map(p=>c.inspect().proposals[p.id]!.actionId!));
  checks.push('all three first trips deliver exact ten-unit quantities without a competing dispatch failure');
  const checkpoint='lab-concord-planning-'+Date.now();await c.checkpoint(checkpoint);const domain=c.inspect();
  await c.restore(checkpoint);assert.deepEqual(c.inspect().proposals,domain.proposals);
  for(const p of offers)await assert.rejects(c.core().propose(p.pawn,p.action,'Already held'),/held/);
  checks.push('paired restore preserves accepted between-trip holds');
  // Direct operator probe tests native map affinity, not character authority.
  const state=await b.state(),probe=offers[0]!;
  const rejected=await b.move({id:randomUUID(),epoch:state.epoch,actor:probe.pawn,action:probe.action,mapId:probe.haulMap!+100000,untilTick:state.ticks+1800});
  assert.equal(rejected.status,'failed');assert.match(rejected.reason,/map/);
  checks.push('native dispatch rejects a mismatched observation map before hauling');
  await c.restore(checkpoint);
  await writeFile(root+'/.runtime/haul-planning-latest.json',JSON.stringify({db,checkpoint,domain}));
  receipt.limitation='Operator-authored stockpiles and relocated supplies; scripted decisions, not evidence of improved live-model judgment. Quiescent checkpoints only.';
 }
 receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{try{await b.admin('pause');}catch{}store?.close();await writeFile(root+'/.runtime/haul-planning-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));}
