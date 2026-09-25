import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route,afterAppraisal,nativeAttention } from '../src/routing.js';
test('urgent native response does not swallow consequential reflection',()=>{
  assert.deepEqual(route({urgent:true,significant:true,conflictsWithCommitment:false,routine:false}),{immediate:'native',next:'deliberation'});
});
test('routine and appraisal routes stay distinct; confidence alone does not cause a lunch summit',()=>{
  assert.equal(route({urgent:false,significant:false,conflictsWithCommitment:false,routine:true}).next,'native');
  assert.equal(route({urgent:false,significant:false,conflictsWithCommitment:false,routine:false}).next,'appraisal');
  assert.equal(afterAppraisal({choice:'act',confidence:0.1},0.8,false),'native');
  assert.equal(afterAppraisal({choice:'act',confidence:0.1},0.8,true),'deliberation');
  assert.equal(afterAppraisal({choice:'deliberate',confidence:1},0.8,false),'deliberation');
});

test('observed recovery remains native attention and does not interrupt unrelated thought',()=>{
 assert.deepEqual(nativeAttention({kind:'casualty-recovered',detail:'No longer downed'}),{next:'native',interrupt:false});
 assert.deepEqual(nativeAttention({kind:'casualty',detail:'Downed'}),{next:'deliberation',interrupt:true});
});

test('need bands are native texture for pawns; a Food or Rest band reaching urgent is queued deliberation (item 7)',()=>{
 for(const kind of ['food','rest','mood'])for(const detail of ['1','2','3','4'])assert.deepEqual(nativeAttention({kind,detail}),{next:'native',interrupt:false});
 assert.deepEqual(nativeAttention({kind:'food',detail:'0'}),{next:'deliberation',interrupt:false});
 assert.deepEqual(nativeAttention({kind:'rest',detail:'0'}),{next:'deliberation',interrupt:false});
 assert.deepEqual(nativeAttention({kind:'mood',detail:'0'}),{next:'native',interrupt:false});
 assert.deepEqual(nativeAttention({kind:'intent-ordinary',detail:'intent=x;count=5'}),{next:'native',interrupt:false});
 assert.equal(nativeAttention({kind:'something-new',detail:''}).next,'appraisal','the appraisal route stays defined for unknown kinds');
});
