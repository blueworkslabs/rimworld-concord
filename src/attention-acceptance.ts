/** Real-game proof for the bounded attention consumer. All decisions are scripted.
 * Runs under the same exclusive coordinator lock as the foundation acceptance.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Coordinator } from './coordinator.js';
import { Store } from './store.js';
import { LabBridge } from './lab-bridge.js';
import { AttentionPump } from './attention.js';
import { scripted } from './backends.js';
const root=new URL('../..',import.meta.url).pathname;
const bridge=new LabBridge();
const cold=process.argv.includes('--cold');
const checks:string[]=[];
const output:Record<string,unknown>={at:new Date().toISOString(),phase:cold?'attention-cold':'attention-loop',backends:'scripted',checks,passed:false};
let store:Store|undefined,pump:AttentionPump|undefined;
await mkdir(root+'/.runtime',{recursive:true});
try {
 if(cold) {
  const saved=JSON.parse(await readFile(root+'/.runtime/attention-latest.json','utf8'));
  store=new Store(saved.db);const c=new Coordinator(store,bridge);await c.restore(saved.checkpoint);
  const game=await bridge.state();assert(game.paused);assert.notEqual(game.epoch,saved.epoch);
  assert.deepEqual(c.inspect().characters,saved.characters);
  checks.push('cold game/coordinator restart restores consumed attention, reflections and character state together');
 } else {
  await bridge.load('lab-initial');
  const db=root+'/.runtime/attention-'+Date.now()+'.db';store=new Store(db);
  const c=new Coordinator(store,bridge);await c.open();const initial=await bridge.state();
  const a=initial.pawns[0]!,b=initial.pawns[1]!;
  const accept=await c.core().propose(a.id,{kind:'move',x:a.x+8,z:a.z},'Scripted attention acceptance waypoint');
  const refuse=await c.core().propose(b.id,{kind:'move',x:b.x,z:b.z},'Scripted attention refusal');
  let appraisals=0,reflections=0,ticksWhileThinking=0;
  pump=new AttentionPump(c,{name:'scripted-attention',async reflect(view,signal){
    reflections++;assert(view.events.length>0);assert(view.events.every(e=>e.pawn===view.pawn.id));
    assert(view.proposals.every(p=>p.pawn===view.pawn.id));
    await delay(1500,undefined,{signal});
    const p=view.proposals[0];
    if(!p)return {kind:'continue',reason:'Scripted reflection: retain native routines'};
    return {kind:'proposal',proposalId:p.id,decision:{kind:view.pawn.id===a.id?'accept':'refuse',reason:'Scripted pawn-owned attention response'}};
  }},{name:'scripted-appraisal',async assess(view){
    appraisals++;assert(view.events?.every(e=>e.pawn===view.pawn.id));return {reflectionScore:0.8};
  }},{cooldownTicks:120,timeoutMs:7000},{maxConcurrent:2,maxTurns:60});
  await bridge.admin('run');
  const end=Date.now()+180000;
  let lastThinkingTick:number|undefined;
  while(Date.now()<end) {
    await pump.poll();
    const game=await bridge.state();
    if(c.activity().length) {
      if(lastThinkingTick!==undefined)ticksWhileThinking+=game.ticks-lastThinkingTick;
      lastThinkingTick=game.ticks;
    } else lastThinkingTick=undefined;
    const state=c.inspect();const p=state.proposals[accept.id]!;
    if(p.actionId&&state.outcomes[p.actionId]?.status==='completed'&&state.proposals[refuse.id]!.status==='refused')break;
    await delay(100);
  }
  await pump.stop();await c.reconcile();await bridge.admin('pause');
  assert(pump.results.every(r=>r.status!=='failed'),'Unexpected attention failure');
  const state=c.inspect();const accepted=state.proposals[accept.id]!;
  assert.equal(accepted.status,'accepted');assert.equal(state.outcomes[accepted.actionId!]!.status,'completed');
  assert.equal(state.proposals[refuse.id]!.status,'refused');
  assert(!(await bridge.state()).actions.some(r=>r.actor===b.id));
  checks.push('real native events automatically trigger scripted appraisal/reflection of only the owning pawn');
  checks.push('attention-owned acceptance completes a real Goto job; refusal dispatches no job');
  assert(appraisals>0);assert(reflections>=2);assert(ticksWhileThinking>0);assert.equal(c.activity().length,0);
  checks.push('polling and native simulation continue during delayed thoughts; stop drains outstanding work');
  const started=store.events().filter(e=>e.event.kind==='attention-started').length;
  await c.observe();
  const reopened=new Coordinator(store,bridge);await reopened.open();await reopened.observe();
  assert.deepEqual(reopened.inspect().characters,c.inspect().characters);
  assert.equal(store.events().filter(e=>e.event.kind==='attention-started').length,started);
  checks.push('coordinator reopen retains consumption receipts without replaying completed batches');
  const checkpoint='lab-concord-attention-'+Date.now();await c.checkpoint(checkpoint);const saved=c.inspect();
  const future=await c.core().propose(a.id,{kind:'move',x:a.x,z:a.z},'Discarded post-checkpoint thought');
  await c.pawn(a.id).decide(future.id,scripted({kind:'refuse',reason:'Future memory'}));
  await c.restore(checkpoint);assert.deepEqual(c.inspect().characters,saved.characters);
  checks.push('paired restore rolls back later memory while retaining saved attention cursors and reflections');
  await writeFile(root+'/.runtime/attention-latest.json',JSON.stringify({db,checkpoint,epoch:saved.epoch,characters:saved.characters}));
  Object.assign(output,{checkpoint,appraisals,reflections,ticksWhileThinking,turns:pump.status().started,
    nativeKinds:[...new Set(Object.values(saved.characters).flatMap(c=>(c.experiences??[]).map(e=>e.event.kind)))],
    results:pump.results.map(r=>({status:r.status,throughSeq:r.throughSeq}))});
 }
 output.passed=true;
} catch(e) {output.error=String(e);process.exitCode=1;}
finally {
 await pump?.stop();try {await bridge.admin('pause');}catch{}
 store?.close();await writeFile(root+'/.runtime/'+(cold?'attention-cold':'attention-acceptance')+'.json',JSON.stringify(output,null,2));
 console.log(JSON.stringify(output,null,2));
}
