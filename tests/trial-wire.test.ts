import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTrialMessage,MAX_TRIAL_RECEIPT_BYTES} from '../src/trial-wire.js';
test('accumulated receipt can exceed inference limit without admitting oversized model requests',()=>{
 const evidence='x'.repeat(100000);assert.equal(parseTrialMessage(JSON.stringify({type:'receipt',receipt:{evidence}})).receipt.evidence,evidence);
 assert.throws(()=>parseTrialMessage(JSON.stringify({type:'decision-request',view:evidence})),/inference/);
 assert.throws(()=>parseTrialMessage(JSON.stringify({type:'receipt',receipt:'x'.repeat(MAX_TRIAL_RECEIPT_BYTES)})),/transport/);
 assert.throws(()=>parseTrialMessage(JSON.stringify({type:'appraisal',view:'é'.repeat(20000)})),/inference/);
});
test('multi-frame integration receipts round-trip above the former cap; inference retains its byte bound',()=>{
 const receipt={frames:Array.from({length:240},(_,tick)=>({tick,report:{entries:[{text:'é'.repeat(3000)}]}}))};
 const line=JSON.stringify({type:'receipt',receipt});
 assert.ok(Buffer.byteLength(line)>1024*1024);
 assert.deepEqual(parseTrialMessage(line).receipt,receipt);
 assert.throws(()=>parseTrialMessage(JSON.stringify({type:'decision-request',view:receipt})),/inference/);
 const prefix='{"type":"receipt","receipt":"',suffix='"}';
 const boundary=prefix+'x'.repeat(MAX_TRIAL_RECEIPT_BYTES-prefix.length-suffix.length)+suffix;
 assert.equal(parseTrialMessage(boundary).receipt.length,MAX_TRIAL_RECEIPT_BYTES-prefix.length-suffix.length);
 assert.throws(()=>parseTrialMessage(boundary+' '),/transport/);
});
