import {test} from 'node:test';
import {legacyPawn} from '../src/protocol.js';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {perspectiveCases} from '../trials/perspective-cases.js';
import {perspectiveCasesV2,checkNeedsFixture} from '../trials/perspective-v2.js';
import {decisionTrials} from '../src/decision-trials.js';
test('v2 removes readiness confounds without modifying retained v1',()=>{
 const before=perspectiveCases();const v2=perspectiveCasesV2();assert.equal(v2.length,12);
 assert.deepEqual(perspectiveCases(),before);
 assert.equal(before.find(c=>c.id==='needs-low-r1')!.view.pawn.rescueReady,true);
 const low=v2.find(c=>c.id==='needs-low-r1')!.view;low.pawn.rescueReady=true;
 assert.throws(()=>checkNeedsFixture(low,'low'));
 const unknown=v2.find(c=>c.id==='needs-unknown-r1')!.view;legacyPawn(unknown.pawn).workReady=true;
 assert.throws(()=>checkNeedsFixture(unknown,'unknown'));
});
import {NeedsRunGuard} from '../trials/needs-policy.js';
test('trial stop and observation guards reject disconnect, pause and no tick progress',()=>{
 const guard=new NeedsRunGuard();guard.sample(false,2,1);
 assert.throws(()=>guard.sample(true,2,1));assert.throws(()=>guard.sample(false,1,1));
 guard.stop();assert.throws(()=>guard.check());assert.throws(()=>guard.sample(false,2,1));
});
import {Writable} from 'node:stream';
import {needsOutput} from '../trials/needs-policy.js';
test('broken output stops once and does not crash or keep sending during cleanup',async()=>{
 let failures=0,writes=0;
 const output=new Writable({write(_chunk,_encoding,callback){writes++;callback(Error('EPIPE'));}});
 const send=needsOutput(output,()=>{failures++;send({type:'cancel'});});
 send({type:'request'});await new Promise(resolve=>setImmediate(resolve));
 send({type:'receipt'});assert.equal(failures,1);assert.equal(writes,1);
});



// The social, retention and needs live scenes offered ordered hauls and were retired with them;
// their evidence stays in docs/evidence. The policy allowances remain recorded.
test('social and retention policies keep their own four-attempt allowances',()=>{
 assert.equal(decisionTrials['social-v1'].calls,4);assert.equal(decisionTrials['social-v1'].reservedEquivalentUSD,.4);
 assert.equal(decisionTrials['retention-game-v1'].calls,4);assert.equal(decisionTrials['retention-game-v1'].reservedEquivalentUSD,.4);
});
