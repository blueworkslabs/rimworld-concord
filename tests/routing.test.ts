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
