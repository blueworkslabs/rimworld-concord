import {test} from 'node:test';
import assert from 'node:assert/strict';
import {outlookCases,preparedOutlookCases,checkOutlookResult} from '../trials/outlook-cases.js';
import {scoreReason} from '../trials/grounding-score.js';
import {promptAccounting} from '../src/prompt-accounting.js';
test('matched views differ only in outlook, with identical offered schema',()=>{
 const cases=preparedOutlookCases(),matched=cases.filter(c=>c.repetition===1&&c.caseId.startsWith('outlook-'));
 assert.equal(cases.length,12);assert.equal(matched.length,3);
 const strip=(c:typeof matched[number])=>{const v=structuredClone(c.view);delete v.character.outlook;return v;};
 for(const c of matched){assert.deepEqual(strip(c),strip(matched[0]!));assert.deepEqual(c.schema,matched[0]!.schema);assert(!c.prompt.includes(c.rubric));}
 for(const c of cases){const other=cases.find(x=>x.caseId===c.caseId&&x.repetition!==c.repetition)!;assert.equal(c.prompt,other.prompt);}
 const raw={reflection:{choice:'keep_current_activity',reason:'No change'}};
 for(const c of cases)assert.equal(checkOutlookResult(c.id,raw).choice,'keep_current_activity');
 assert.throws(()=>checkOutlookResult('unknown',raw));
});
test('numeric matches, mismatches and unknown references are separate',()=>{
 const full=outlookCases().find(c=>c.caseId==='needs-full')!.view;
 const unknown=outlookCases().find(c=>c.caseId==='needs-unknown')!.view;
 const correct=scoreReason('My Food and Rest are both at 90%, so I will consider the offer.',full);
 assert.equal(correct.numbers.length,2);assert(correct.numbers.every(n=>n.result==='numeric_match'));
 assert.equal(scoreReason('Food is at 10%.',full).numbers[0]!.result,'numeric_mismatch');
 assert.equal(scoreReason('Food is at 0.1.',full).numbers[0]!.result,'numeric_mismatch');
 assert.equal(scoreReason('Food is at 0.9.',unknown).numbers[0]!.result,'unknown_reference');
 assert.equal(correct.coverage.unscoredProse,true);
});
test('quotes, conditionals, old readings and missing units are not asserted contradictions',()=>{
 const full=outlookCases()[0]!.view;
 for(const reason of ['If Food is at 10%, I would eat.','Earlier someone said Food is at 10%.','“Food is at 10%” is a quotation.','Before the meal Food is at 10%.','Food is at 90.']){
  const r=scoreReason(reason,full);assert(r.numbers.every(n=>n.result==='unscorable_context'),reason);
 }
 assert.equal(scoreReason('I am severely hungry.',full).numbers.length,0);
 assert.equal(scoreReason('Food is not at 10%.',full).numbers.length,0);
});
test('certainty candidates do not turn a correct number into a fabricated fact',()=>{
 const full=outlookCases()[0]!.view;
 const r=scoreReason('Food is at 90%, so there is no risk of stopping early.',full);
 assert.equal(r.numbers[0]!.result,'numeric_match');assert.equal(r.certaintyCandidates.length,1);
 assert.equal(scoreReason('Completion is not guaranteed.',full).certaintyCandidates.length,0);
 assert.equal(scoreReason('The insult was unprovoked.',full).numbers.length,0);
});
test('authored byte counts include UTF-8 perspective and compact schema, not just system text',()=>{
 const r=promptAccounting('é','hello',{type:'object'});
 assert.equal(r.instructionsBytes,2);assert.equal(r.totalAuthoredBytes,2+5+Buffer.byteLength('{"type":"object"}'));
 const c=preparedOutlookCases()[0]!;assert(c.authoredSize.totalAuthoredBytes>c.authoredSize.instructionsBytes);
});
