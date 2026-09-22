/** Corrected authored bank; v1 and its actual answers remain immutable. */
import assert from 'node:assert/strict';
import {perspectiveCases} from './perspective-cases.js';
import type {AttentionView} from '../src/attention.js';
import {modelPrompt,pawnInstructions} from '../src/model-perspective.js';
import {claudeArgs} from '../src/claude-decision.js';
import {codexSchema} from '../src/contract-cases.js';
export const bankVersion='concord-perspective-v2';
// Bank-specific consistency, not a replacement for native capability checks.
export function checkNeedsFixture(view:AttentionView,condition:'full'|'low'|'unknown'){
 const p=view.pawn;
 if(condition==='unknown'){
  assert.equal(p.workReady,undefined);assert.equal(p.rescueReady,undefined);
  assert.equal(p.hauling,undefined);assert.equal(p.rescue,undefined);
  assert(!p.facts?.some(f=>f.key==='need'&&['Food','Rest'].includes(f.value)));
 }else{
  for(const name of ['Food','Rest']){
   const facts=p.facts?.filter(f=>f.key==='need'&&f.value===name)??[];
   assert.equal(facts.length,1);assert.equal(facts[0]!.level,condition==='full'?.9:.1);
  }
  assert.equal(p.workReady,condition==='full');assert.equal(p.rescueReady,condition==='full');
  if(condition==='low'){assert(!p.hauling?.options.length);assert(!p.rescue?.options.length);}
 }
}
export function perspectiveCasesV2(){return perspectiveCases().map(original=>{
 const c=structuredClone(original);
 if(c.caseId.startsWith('needs-')){
  const condition=c.caseId.slice(6) as 'full'|'low'|'unknown';
  delete c.view.pawn.hauling;delete c.view.pawn.rescue;
  if(condition==='unknown'){delete c.view.pawn.workReady;delete c.view.pawn.rescueReady;}
  else {c.view.pawn.workReady=condition==='full';c.view.pawn.rescueReady=condition==='full';}
  checkNeedsFixture(c.view,condition);
 }
 return c;
});}
export function preparedPerspectiveCasesV2(){return perspectiveCasesV2().map(c=>{
 const args=claudeArgs('reflection',c.view);
 return {...c,instructions:pawnInstructions,schema:codexSchema(JSON.parse(args[args.indexOf('--json-schema')+1]!)),prompt:JSON.stringify(modelPrompt('reflection',c.view))};
});}
