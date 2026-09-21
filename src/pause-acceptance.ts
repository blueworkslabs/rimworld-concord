/** No inference. Exercises the actual game's independent force-pause layer. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { LabBridge } from './lab-bridge.js';
const b=new LabBridge(),checks:string[]=[];
const receipt={kind:'game-owned-decision-pause',at:new Date().toISOString(),passed:false,checks};
try{
 await b.load('lab-initial');let state=await b.state();
 assert.equal(state.decisionPauses,0);assert.equal(state.manualPaused,true);
 const a={epoch:state.epoch,actor:state.pawns[0]!.id,leaseId:randomUUID(),ttlMs:10000};
 const other={...a,actor:state.pawns[1]!.id,leaseId:randomUUID()};
 await b.admin('run');await b.setDecisionPause(a);await b.setDecisionPause(other);
 state=await b.state();assert.equal(state.decisionPauses,2);assert.equal(state.manualPaused,false);assert(state.paused);
 await delay(350);assert.equal((await b.state()).ticks,state.ticks);
 await promisify(execFile)('python3',[b.root+'/bin/lab.py','screenshot','concord-decision-pause.png']);
 await assert.rejects(b.setDecisionPause({...a,actor:other.actor,ttlMs:0}),/ownership/);
 await b.setDecisionPause({...a,ttlMs:0});assert.equal((await b.state()).decisionPauses,1);
 checks.push('overlapping actor-owned claims hold stable ticks; wrong-owner release rejected; one release leaves the other pause');
 await b.admin('pause');await b.setDecisionPause({...other,ttlMs:0});state=await b.state();
 assert.equal(state.decisionPauses,0);assert.equal(state.manualPaused,true);assert(state.paused);
 checks.push('manual pause applied during deliberation remains after the last decision claim releases');
 await b.admin('run');await b.setDecisionPause({...a,leaseId:randomUUID(),ttlMs:600});await delay(1100);state=await b.state();
 assert.equal(state.decisionPauses,0);assert.equal(state.paused,false);
 checks.push('orphaned claim expires on wall clock while paused, resuming only the independently selected running speed');
 await b.admin('pause');await b.setDecisionPause({...a,leaseId:randomUUID(),ttlMs:600});await delay(1100);state=await b.state();
 assert.equal(state.decisionPauses,0);assert(state.paused&&state.manualPaused);
 checks.push('wall-clock expiry cannot undo a pre-existing manual pause');
 await b.setDecisionPause(a);await b.load('lab-initial');state=await b.state();
 assert.notEqual(state.epoch,a.epoch);assert.equal(state.decisionPauses,0);
 await assert.rejects(b.setDecisionPause({...a,ttlMs:0}),/Stale/);
 checks.push('reload clears old claims; a delayed old-epoch release is rejected');
 receipt.passed=true;
}finally{
 await b.admin('pause');await writeFile(new URL('../../.runtime/decision-pause.json',import.meta.url),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify(receipt,null,2));
}
