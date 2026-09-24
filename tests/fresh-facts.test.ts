import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {corePrompt,type CoreView,validateCoreChoice} from '../src/core-planner.js';
import {codexRequest} from '../src/codex-decision.js';
const source=JSON.parse(readFileSync('docs/evidence/luna-ongoing-integration.json','utf8'));
test('conflicting old summaries stay separate from current answered status and telemetry',()=>{
 const v=structuredClone(source.publicCoreInputs[5].view) as CoreView;
 const unchanged=JSON.stringify(v),p=corePrompt(v).perspective;
 assert.equal(JSON.stringify(v),unchanged);
 assert.equal(p.currentRecords.sharedStatus.find(s=>s.pawn==='Thing_Human411')!.food,'low');
 assert.equal(p.currentRecords.questions.find(q=>q.pawn==='Thing_Human411')!.status,'answered');
 assert(p.communication.messages.some(m=>m.from==='Thing_Human411'&&m.to==='core'));
 assert(p.plannerHistory.topics.some(t=>t.interpretation.includes('no answer')));
 assert(p.plannerHistory.topics.every(t=>t.basedOnTick===null&&t.updatedTick===null));
 assert(!('topics' in p.currentRecords));assert(!('topics' in p));
 assert.deepEqual(p.availableChoices.questionRecipients,v.questionRecipients);
 assert.deepEqual(p.currentRecords.topicClosures,v.topicClosures);
 const legal={topics:[],actionTopicId:null,action:{kind:'wait',reason:'No action'}};assert.equal(validateCoreChoice(legal,v).action.kind,'wait');
});
test('core prompt uses an explicit public projection and bounded existing records without new authority',()=>{
 for(const i of [1,3,5]){
  const v=structuredClone(source.publicCoreInputs[i].view);
  v.privateThought={text:'CANARY'};v.operatorDiagnostics={food:.031};
  v.topics[0].privateThought={text:'CANARY'};
  const p=JSON.parse(codexRequest('core',v).prompt);
  assert.equal(p.perspective.privateThought,undefined);assert.equal(p.perspective.operatorDiagnostics,undefined);
  assert.equal(p.perspective.plannerHistory.topics[0].privateThought,undefined);
  assert.deepEqual(p.perspective.currentRecords.sharedStatus,v.sharedStatus);
  assert.deepEqual(p.perspective.currentRecords.selfCare,v.selfCare);
  assert.deepEqual(p.perspective.availableChoices.opportunities,v.opportunities);
  assert.equal(p.perspective.currentRecords.agreements.some((a:any)=>'reason' in a||'reply' in a),false);
 }
});
