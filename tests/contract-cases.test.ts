import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contractCases,preparedCases,checkContractResult,codexSchema} from '../src/contract-cases.js';
import {reflectionChoices} from '../src/reflection-choice.js';
test('five authored cases expose their intended alternatives without preferring obedience',()=>{
 const cases=contractCases();assert.equal(cases.length,5);
 assert.deepEqual(cases.map(c=>reflectionChoices(c.view).map(x=>x.choice)),[
 ['keep_current_activity'],['keep_current_activity','revise_private_outlook'],
 ['keep_current_activity','revise_private_outlook','withdraw_current_agreement','request_rescue_alternative'],
 ['keep_current_activity','revise_private_outlook','answer_pending_proposal'],['keep_current_activity','revise_private_outlook']]);
 for(const c of cases)assert.equal(checkContractResult(c.id,{reflection:{choice:'keep_current_activity',reason:'No change'}}).choice,'keep_current_activity');
 const id=cases[3]!.view.proposals[0]!.id;
 for(const kind of ['accept','refuse'])assert.equal(checkContractResult('pending-rescue',{reflection:{choice:'answer_pending_proposal',proposalId:id,decision:{kind,reason:'My choice'}}}).choice,'answer_pending_proposal');
});
test('assessment keeps runtime ownership and citation checks after schema dialect normalization',()=>{
 assert.throws(()=>checkContractResult('noticed',{reflection:{choice:'request_rescue_alternative',agreementId:'00000000-0000-0000-0000-000000000000',target:'B',reason:'Invented agreement'}}));
 assert.throws(()=>checkContractResult('recovered',{reflection:{choice:'revise_private_outlook',reason:'Duplicate refs',update:{expectedRevision:1,notes:[{kind:'concern',text:'Concern',evidenceSeqs:[1,1]}]}}}));
 assert.throws(()=>checkContractResult('recovered',{reflection:{choice:'revise_private_outlook',reason:'Wrong subject',update:{expectedRevision:1,notes:[{kind:'stance',text:'Concern',subject:'C',evidenceSeqs:[2]}]}}}));
 assert.equal(checkContractResult('recovered',{reflection:{choice:'revise_private_outlook',reason:'Observed recovery',update:{expectedRevision:1,notes:[]}}}).choice,'revise_private_outlook');
 assert.throws(()=>checkContractResult('quiet',{reflection:{choice:'keep_current_activity',reason:'Fine'},action:'rescue'}));
});
test('Codex dialect retains disjoint choice tags and supplied IDs, does not include the scoring brief',()=>{
 for(const c of preparedCases()){
  assert.equal(c.schema.type,'object');assert(!JSON.stringify(c.schema).includes('oneOf'));assert(!JSON.stringify(c.schema).includes('"const"'));
  assert.deepEqual(c.schema.properties.reflection.anyOf.map((x:any)=>x.properties.choice.enum[0]),reflectionChoices(c.view).map(x=>x.choice));
  assert.deepEqual(JSON.parse(c.prompt).perspective,c.view);assert(!JSON.parse(c.prompt).description);
 }
 assert.deepEqual(codexSchema({type:'integer',const:1}),{type:'integer',enum:[1]});
});

test('native probe guards retain failed attempts and reject tool exposure or replay',()=>{
 const output=execFileSync('python3',['-B','scripts/test-codex-contract.py'],{encoding:'utf8',stdio:'pipe'});assert.equal(output,'');
});
