/** Opt-in finite three-pawn observation; the core is scripted, never an action authority. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {Coordinator} from './coordinator.js';
import {Store} from './store.js';
import {LabBridge} from './lab-bridge.js';
import {DecisionChannel} from './decision-channel.js';
import {AppraisalChannel} from './appraisal-channel.js';
import {AttentionPump} from './attention.js';
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(),cold=process.argv.includes('--cold'),replies=process.argv.includes('--reply-counters');
const send=(m:unknown)=>process.stdout.write(JSON.stringify(m)+'\n');
let decisions=0,appraisals=0,store:Store|undefined,pump:AttentionPump|undefined;
const decision=new DecisionChannel(m=>{if((m as any).type==='decision-request'){if(cold||decisions>=6)throw Error('Trial decision limit');decisions++;}send(m);});
const appraisal=new AppraisalChannel(m=>{if((m as any).type==='appraisal'){if(cold||appraisals>=6)throw Error('Trial appraisal limit');appraisals++;}send(m);});
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>32000)throw Error();const m=JSON.parse(line);if(m.type==='decision-result')decision.receive(m);else appraisal.receive(m);}catch{decision.close();appraisal.close();}});
input.on('close',()=>{decision.close();appraisal.close();});
const offers:unknown[]=[],receipt:Record<string,unknown>={at:new Date().toISOString(),passed:false,offers};
try{
 if(cold){
  const saved=JSON.parse(await readFile(root+'/.runtime/hauling-live-latest.json','utf8'));store=new Store(saved.db);const c=new Coordinator(store,b);await c.restore(saved.checkpoint);
  assert.deepEqual(c.inspect().characters,saved.characters);assert.deepEqual(c.inspect().proposals,saved.proposals);assert.deepEqual(c.inspect().outcomes,saved.outcomes);assert.notEqual((await b.state()).epoch,saved.epoch);
  receipt.coldRestore=true;
 }else{
  let db:string,c:Coordinator;
  if(replies) {
   const saved=JSON.parse(await readFile(root+'/.runtime/hauling-live-latest.json','utf8'));db=saved.db;
   store=new Store(db);c=new Coordinator(store,b);await c.restore(saved.checkpoint);
   const counters=c.core().inbox();assert.equal(counters.length,3,'Expected three retained unanswered counters');
   for(const counter of counters) {
    const offer=await c.core().revise(counter.id,'The core offers your exact one-trip alternative back for fresh consent. You remain free to refuse.');
    try{const r=await c.pawn(counter.pawn).decide(offer.id,decision,90000);offers.push({pawn:counter.pawn,proposal:offer.id,decision:r.decision});}
    catch{offers.push({pawn:counter.pawn,proposal:offer.id,status:'decision-unavailable-no-retry'});}
    await writeFile(root+'/.runtime/hauling-replies-partial.json',JSON.stringify({offers,domain:c.inspect()}));
   }
  } else {
  const fixture=JSON.parse(await readFile(root+'/.runtime/haul-fixture.json','utf8'));await b.load(fixture.name);await b.admin('pause');
  db=root+'/.runtime/hauling-live-'+Date.now()+'.db';store=new Store(db);c=new Coordinator(store,b);await c.open();
  const initial=await b.state(),used=new Set<string>();
  for(const pawn of initial.pawns){
   const options=(await c.core().haulingOptions(pawn.id))?.options??[];
   const option=options.find(o=>!used.has(o.thing));
   if(!option){offers.push({pawn:pawn.id,status:'no-observed-option'});continue;}
   used.add(option.thing);const action={...option,trips:2,maxTicks:1800};
   const p=await c.core().propose(pawn.id,action,'Would you move up to two loads of ten from this observed stack to its agreed storage cell? You may refuse or suggest a different bounded offer. Stop for needs or reconsideration.');
   try{const r=await c.pawn(pawn.id).decide(p.id,decision,90000);offers.push({pawn:pawn.id,proposal:p.id,decision:r.decision});}
   catch{offers.push({pawn:pawn.id,proposal:p.id,status:'decision-unavailable-no-retry'});}
   await writeFile(root+'/.runtime/hauling-live-partial.json',JSON.stringify({offers,domain:c.inspect()}));
  }
  }
  await b.admin('run');const start=await b.state(),began=Date.now(),end=began+(replies?30000:180000);let samples=0;
  pump=new AttentionPump(c,decision,appraisal,{cooldownTicks:600,timeoutMs:90000},{maxConcurrent:1,maxTurns:12});
  while(Date.now()<end){
   await c.advanceIntentions();
   if(!replies&&decisions<6&&appraisals<6)await pump.poll();else await c.reconcile();
   samples++;await delay(250);
  }
  await pump.stop();await b.admin('pause');await c.reconcile();
  // Trial shutdown is an explicit operator action, recorded separately from pawn choice.
  for(const character of Object.values(c.inspect().characters))if(character.intention)await c.pawn(character.id).withdraw('Operator trial ended; no automatic restart');
  await c.reconcile();const finish=await b.state();
  receipt.observation={wallMs:Date.now()-began,ticks:finish.ticks-start.ticks,samples,attention:pump.results,decisions,appraisals};
  receipt.outcomes=Object.values(c.inspect().outcomes);receipt.intentions=Object.values(c.inspect().proposals).filter(p=>p.standing).map(p=>({pawn:p.pawn,standing:p.standing}));
  const checkpoint='lab-concord-haul-live-'+Date.now();await c.checkpoint(checkpoint);const saved=c.inspect();await c.restore(checkpoint);
  assert.deepEqual(c.inspect().characters,saved.characters);assert.deepEqual(c.inspect().proposals,saved.proposals);assert.deepEqual(c.inspect().outcomes,saved.outcomes);
  await writeFile(root+'/.runtime/hauling-live-latest.json',JSON.stringify({db,checkpoint,epoch:(await b.state()).epoch,characters:saved.characters,proposals:saved.proposals,outcomes:saved.outcomes}));
  receipt.pairedRestore=true;receipt.counterFollowup=replies;receipt.limitations='Three-minute initial observation; optional thirty-second exact-counter follow-up within the same six-call allowance. Authored authored fixture; initial offers while paused, then continuous native play. Scripted core, no authored personality overrides. Model errors/cancellations are evidence, not rerolled. Not a long-run character-quality evaluation.';
 }
 receipt.passed=true;
}catch(e){receipt.error=String(e);process.exitCode=1;}
finally{await pump?.stop();try{await b.admin('pause');}catch{}decision.close();appraisal.close();input.close();store?.close();await writeFile(root+'/.runtime/hauling-live-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));send({type:'receipt',receipt});}
