/** Operator-only scripted real-game hauling evidence; no inference. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from './coordinator.js';
import {Store} from './store.js';
import {LabBridge} from './lab-bridge.js';
import {scripted} from './backends.js';
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold'),checks:string[]=[];
const receipt:Record<string,unknown>={at:new Date().toISOString(),phase:cold?'cold':'game',passed:false,checks,inferenceCalls:0};
let store:Store|undefined;
async function finish(c:Coordinator,id:string){
 await b.admin('run');const end=Date.now()+30000;
 while(Date.now()<end){await delay(150);await c.reconcile();if(c.inspect().outcomes[id]?.status!=='started')break;}
 await b.admin('pause');assert.equal(c.inspect().outcomes[id]?.status,'completed',JSON.stringify(c.inspect().outcomes[id]));
 assert.equal(c.inspect().outcomes[id]!.delivered,10);
}
try {
 await mkdir(root+'/.runtime',{recursive:true});
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/hauling-latest.json','utf8'));
  store=new Store(saved.db);const c=new Coordinator(store,b);await c.restore(saved.checkpoint);
  assert.deepEqual(c.inspect().characters,saved.characters);assert.deepEqual(c.inspect().proposals,saved.proposals);assert.deepEqual(c.inspect().outcomes,saved.outcomes);
  assert.notEqual((await b.state()).epoch,saved.epoch);
  await c.advanceIntentions();const p=c.inspect().proposals[saved.proposal]!;
  assert.equal(p.standing!.steps.length,2);await finish(c,p.actionId!);
  await c.advanceIntentions();await finish(c,c.inspect().proposals[p.id]!.actionId!);
  await c.advanceIntentions();assert.equal(c.inspect().proposals[p.id]!.standing!.status,'completed');
  checks.push('cold restore between trips preserves consent and completes remaining fixed trips without inference');
 }else{
  const fixture=JSON.parse(await readFile(root+'/.runtime/haul-fixture.json','utf8'));
  await b.load(fixture.name);await b.admin('pause');
  const db=root+'/.runtime/hauling-'+Date.now()+'.db';store=new Store(db);const c=new Coordinator(store,b);await c.open();
  const initial=await b.state();receipt.options=initial.pawns.map(p=>({pawn:p.id,options:p.hauling?.options.length}));
  const pawn=initial.pawns.find(p=>p.hauling?.options.length)!;assert(pawn,'Need an available observed haul option');
  const action={...pawn.hauling!.options[0]!,trips:3};
  const proposal=await c.core().propose(pawn.id,action,'Scripted three-trip supply agreement');
  await c.pawn(pawn.id).decide(proposal.id,scripted({kind:'accept',reason:'Scripted bounded consent'}));
  const accepted=c.inspect().proposals[proposal.id]!;
  const repeated=await b.move({id:accepted.actionId!,epoch:initial.epoch,actor:pawn.id,action,mapId:accepted.haulMap,untilTick:accepted.standing!.deadline});assert.equal(repeated.id,accepted.actionId);
  await finish(c,accepted.actionId!);checks.push('native exact quantity delivered; duplicate request starts no extra haul');
  const checkpoint='lab-concord-hauling-'+Date.now();await c.checkpoint(checkpoint);const saved=c.inspect();
  await c.advanceIntentions();await finish(c,c.inspect().proposals[proposal.id]!.actionId!);
  await c.pawn(pawn.id).withdraw('Scripted change of intention between trips');await c.advanceIntentions();
  assert.equal(c.inspect().proposals[proposal.id]!.standing!.steps.length,2);checks.push('withdrawal between trips prevents third trip');
  await c.restore(checkpoint);assert.deepEqual(c.inspect().characters,saved.characters);
  await c.advanceIntentions();await c.pawn(pawn.id).withdraw('Scripted withdrawal during hauling');await c.reconcile();
  assert.equal(c.inspect().outcomes[c.inspect().proposals[proposal.id]!.actionId!]!.status,'interrupted');checks.push('active withdrawal interrupts only the owned native job');
  await c.restore(checkpoint);const other=initial.pawns.find(p=>p.id!==pawn.id)!;
  const alternative=(await c.core().haulingOptions(other.id))?.options[0];assert(alternative);
  const refusal=await c.core().propose(other.id,alternative,'Optional hauling');const before=(await b.state()).actions.length;
  await c.pawn(other.id).decide(refusal.id,scripted({kind:'refuse',reason:'Scripted rest preference'}));assert.equal((await b.state()).actions.length,before);checks.push('refusal creates no hauling job');
  await c.restore(checkpoint);
  const boundary=await b.state(),testPawn=boundary.pawns.find(p=>p.id!==pawn.id&&p.hauling?.options.length)!;
  assert(testPawn);const testAction=testPawn.hauling!.options[0]!;
  const expiredId=randomUUID();
  const expiring=await b.move({id:expiredId,epoch:boundary.epoch,actor:testPawn.id,action:testAction,mapId:testPawn.hauling!.mapId,untilTick:boundary.ticks+1});
  assert.equal(expiring.status,'started');await b.admin('run');await delay(750);await b.admin('pause');
  const expired=(await b.state()).actions.find(a=>a.id===expiredId)!;
  assert.notEqual(expired.status,'started');assert.notEqual(expired.status,'completed');assert.equal(expired.delivered,0);
  checks.push('native game stops expired hauling without coordinator polling');
  const tombstoneId=randomUUID();const tombstone=await b.cancel({id:tombstoneId,epoch:boundary.epoch,actor:testPawn.id});assert.equal(tombstone.status,'interrupted');
  await assert.rejects(b.move({id:tombstoneId,epoch:boundary.epoch,actor:testPawn.id,action:testAction,mapId:testPawn.hauling!.mapId,untilTick:boundary.ticks+1800}),/collision/);
  checks.push('cancel-before-dispatch tombstone prevents delayed job creation');
  await c.restore(checkpoint);
  await writeFile(root+'/.runtime/hauling-latest.json',JSON.stringify({db,checkpoint,proposal:proposal.id,epoch:(await b.state()).epoch,characters:saved.characters,proposals:saved.proposals,outcomes:saved.outcomes}));
  receipt.limitation='Operator-authored stockpiles, relocated steel and disabled native work priorities. Scripted consent; quiescent between-trip checkpoints only.';
 }
 receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{try{await b.admin('pause');}catch{}store?.close();await writeFile(root+'/.runtime/hauling-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));}
