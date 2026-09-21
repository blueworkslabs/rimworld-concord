/** Finite six-call, sequential, pause-at-decision evaluation. Not unattended play. */
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile,rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Coordinator } from './coordinator.js';
import { Store } from './store.js';
import { LabBridge } from './lab-bridge.js';
import { DecisionChannel } from './decision-channel.js';
import { negotiationPreferences,withinPreference,verifyNegotiationContinuation } from './negotiation-fixture.js';
import type { Perspective,Proposal } from './protocol.js';
const root=resolve(new URL('../..',import.meta.url).pathname),cold=process.argv.includes('--cold');
const continued=process.argv.find(a=>a.startsWith('--continue='))?.slice(11);
if(continued!==undefined)assert(!cold&&/^[1-5]$/.test(continued));
const latest=root+'/.runtime/negotiation-latest.json',receiptPath=root+'/.runtime/negotiation'+(cold?'-cold':'')+'.json';
const atomic=async(path:string,value:unknown)=>{await writeFile(path+'.tmp',JSON.stringify(value,null,2));await rename(path+'.tmp',path);};
const send=(v:unknown)=>{process.stdout.write(JSON.stringify(v)+'\n');};
const channel=new DecisionChannel(send),bridge=new LabBridge();
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{try{if(line.length>4096)throw Error();channel.receive(JSON.parse(line));}catch{channel.close();}});
input.on('close',()=>channel.close());
const checks:string[]=[],receipt:Record<string,any>={at:new Date().toISOString(),kind:cold?'negotiation-cold':'negotiation-game',checks,passed:false};
let store:Store|undefined;
try {
 await mkdir(root+'/.runtime',{recursive:true});
 if(cold) {
   const saved=JSON.parse(await readFile(latest,'utf8'));store=new Store(saved.db);const c=new Coordinator(store,bridge);
   await c.restore(saved.checkpoint);const state=c.inspect();
   assert.notEqual(state.epoch,saved.state.epoch);
   for(const key of ['characters','proposals','outcomes'] as const)assert.deepEqual(state[key],saved.state[key]);
   assert.equal((await bridge.state()).decisionPauses,0);
   Object.assign(receipt,{checkpointStage:saved.stage,characters:Object.keys(state.characters).length,revisions:Object.values(state.proposals).filter(p=>p.parentId).length,inferenceCalls:0});
   checks.push('cold game/coordinator restore preserves all three private preferences, exchanges, outcomes and lineage without inference');
 }else {
   let db:string,c:Coordinator,fixtures:ReturnType<typeof negotiationPreferences>,pawns:Awaited<ReturnType<LabBridge['state']>>['pawns'];
   let views:Record<string,unknown>[]=[],decisions:Proposal[]=[],first:Proposal[]=[];
   if(continued!==undefined) {
     const saved=JSON.parse(await readFile(latest,'utf8')),partial=JSON.parse(await readFile(receiptPath,'utf8'));
     db=saved.db;store=new Store(db);c=new Coordinator(store,bridge,{mode:'pause-at-decision'});await c.open();
     verifyNegotiationContinuation(c.inspect(),partial,Number(continued));
     await atomic(receiptPath+'.before-continue',partial);
     fixtures=partial.fixtures;views=partial.views;decisions=partial.decisions;
     const current=await bridge.state();pawns=fixtures.map(f=>({...current.pawns.find(p=>p.id===f.pawn)!,...f.anchor}));
     first=decisions.slice(0,3);receipt.continuedAfter=Number(continued);
   } else {
     await bridge.load('lab-initial');await bridge.admin('pause');
     db=root+'/.runtime/negotiation-'+Date.now()+'.db';store=new Store(db);
     c=new Coordinator(store,bridge,{mode:'pause-at-decision'});await c.open();
     const initial=await bridge.state();pawns=initial.pawns.slice(0,3);assert.equal(pawns.length,3);
     fixtures=negotiationPreferences(pawns);const seed=c.inspect();
     for(const f of fixtures)seed.characters[f.pawn]!.memories.push(f.memory);
     // Lab-only seed is explicitly audited, never a capability exposed to the core or pawn model.
     store.commit(seed,{branch:seed.branch,kind:'operator-evaluation-fixture',actor:'operator',data:{version:'negotiation-v1',fixtures}});
     c=new Coordinator(store,bridge,{mode:'pause-at-decision'});await c.open();
   }
   Object.assign(receipt,{mode:'pause-at-decision',scheduling:'sequential',fixtures,views,decisions,modelChoicesForced:false,checkpointStage:'initialized'});
   const checkpoint=async(stage:string)=>{
     await bridge.admin('pause');const checkpoint='lab-concord-negotiation-'+Date.now();await c.checkpoint(checkpoint);const state=c.inspect();
     await atomic(latest,{db,checkpoint,stage,state});receipt.checkpointStage=stage;await atomic(receiptPath,receipt);return {checkpoint,state};
   };
   await checkpoint('fixture-ready');
   const backend={name:channel.name,async decide(v:Perspective,s:AbortSignal){
     const fixture=fixtures.find(f=>f.pawn===v.pawn.id)!;assert(fixture);assert(v.character.memories.includes(fixture.memory));
     for(const other of fixtures.filter(f=>f.pawn!==v.pawn.id))assert(!v.character.memories.includes(other.memory));
     assert(v.character.experiences?.every(e=>e.event.pawn===v.pawn.id)??true);assert(v.history?.every(p=>p.pawn===v.pawn.id)??true);
     const text=JSON.stringify(v);views.push({pawn:v.pawn.id,name:v.pawn.name,proposal:v.proposal.id,ownFacts:v.pawn.facts?.length??0,historyIds:v.history?.map(p=>p.id)??[],sha256:createHash('sha256').update(text).digest('hex')});
     await atomic(receiptPath,receipt);return channel.decide(v,s);
   }};
   const choose=async(p:Proposal)=>{
     await bridge.admin('run');const decision=await c.pawn(p.pawn).decide(p.id,backend,100000);decisions.push(decision);
     await atomic(receiptPath,receipt);
     if(decision.actionId){
       const end=Date.now()+30000;let outcome;
       do{await c.reconcile();outcome=c.inspect().outcomes[decision.actionId];if(outcome?.status!=='started')break;await delay(100);}while(Date.now()<end);
       assert(outcome&&outcome.status!=='started','Accepted exercise move still unresolved');
     } else assert(!c.inspect().characters[p.pawn]!.commitment);
     assert.equal((await bridge.state()).decisionPauses,0);await checkpoint('decision-'+decisions.length);return decision;
   };
   for(const pawn of pawns.slice(first.length)) {
     const p=await c.core().propose(pawn.id,{kind:'move',x:pawn.x+12,z:pawn.z},'Please walk to this waypoint for an optional movement-link exercise. It is not urgent. Weigh it against your own preferences, needs and work. You may offer a different waypoint if that suits you better; no alternative is executed without a further agreement.');
     first.push(await choose(p));
   }
   const communicated=c.core().inbox();
   assert(!fixtures.some(f=>JSON.stringify(communicated).includes(f.memory)),'Private fixture was exposed by inbox');
   for(const [i,p] of first.entries()) {
     if(i<decisions.length-3)continue;
     let next:Proposal;
     if(p.status==='countered') {
       const before=Object.keys(c.inspect().outcomes).length;
       next=await c.core().revise(p.id,'I can use the waypoint you offered. This is the revised proposal, still optional. Does it work for you now?');
       assert.equal(Object.keys(c.inspect().outcomes).length,before);
     } else {
       const origin=pawns[i]!;
       next=await c.core().propose(p.pawn,{kind:'move',x:origin.x+1,z:origin.z},'One final optional movement-link check at this nearby waypoint. Nothing has become urgent; your earlier preferences still matter. This is a fresh request, not permission to override your earlier answer.');
     }
     await choose(next);
   }
   const state=c.inspect(),revisions=Object.values(state.proposals).filter(p=>p.parentId),successful=revisions.filter(p=>p.status==='accepted'&&p.actionId&&state.outcomes[p.actionId]?.status==='completed');
   Object.assign(receipt,{failedMoves:Object.values(state.outcomes).filter(o=>o.status==='failed').length,outcomes:state.outcomes,revisedAgreements:successful.length,preferenceChecks:decisions.map(p=>({pawn:p.pawn,proposal:p.id,consistent:withinPreference(p,fixtures.find(f=>f.pawn===p.pawn)!)}))});
   // Save mixed quality results too: persistence tests do not depend on getting the hoped-for response.
   const saved=await checkpoint('six-decisions');await c.restore(saved.checkpoint);
   for(const key of ['characters','proposals','outcomes'] as const)assert.deepEqual(c.inspect()[key],saved.state[key]);
   checks.push('six isolated pawn views retain private fixture preferences across two decisions each');
   checks.push('paired restore preserves three characters, proposal lineage and observed action outcomes');
   receipt.integrationPassed=true;receipt.counterExchangeCompleted=successful.length>0;
   receipt.preferenceConsistencyPassed=receipt.preferenceChecks.every((r:any)=>r.consistent);
   assert(receipt.counterExchangeCompleted,'No completed counter/revision/agreement in this finite trial');
   assert(receipt.preferenceConsistencyPassed,'One or more decisions diverged from the authored preference');
   checks.push('at least one live counter is adopted by scripted core, freshly accepted by its pawn and completed in game');
 }
 receipt.passed=true;
}catch(error){receipt.error=String(error);process.exitCode=1;}
finally{try{await bridge.admin('pause');}catch{}channel.close();input.close();store?.close();await atomic(receiptPath,receipt);send({type:'receipt',receipt});}
