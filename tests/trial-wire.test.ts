import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTrialMessage} from '../src/trial-wire.js';
test('accumulated receipt can exceed inference limit without admitting oversized model requests',()=>{
 const evidence='x'.repeat(100000);assert.equal(parseTrialMessage(JSON.stringify({type:'receipt',receipt:{evidence}})).receipt.evidence,evidence);
 assert.throws(()=>parseTrialMessage(JSON.stringify({type:'decision-request',view:evidence})),/inference/);
 assert.throws(()=>parseTrialMessage(JSON.stringify({type:'receipt',receipt:'x'.repeat(1024*1024)})),/transport/);
 assert.throws(()=>parseTrialMessage(JSON.stringify({type:'appraisal',view:'é'.repeat(20000)})),/inference/);
});
