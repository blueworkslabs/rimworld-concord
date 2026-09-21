import {test} from 'node:test';
import assert from 'node:assert/strict';
import {InferenceLane} from '../src/inference-lane.js';
test('new inference waits for cancelled provider cleanup and cancelled queued work never calls provider',async()=>{
 const lane=new InferenceLane(),first=new AbortController(),queued=new AbortController(),last=new AbortController();
 const events:string[]=[];let finish!:()=>void;
 const running=lane.run(first.signal,async()=>{events.push('start');await new Promise<void>(r=>finish=r);events.push('cleanup');throw Error('cancelled');});
 const rejected=assert.rejects(running,/cancelled/);await Promise.resolve();first.abort();
 const skipped=lane.run(queued.signal,async()=>{events.push('must-not-call');});const skippedResult=assert.rejects(skipped);queued.abort();
 const next=lane.run(last.signal,async()=>{events.push('next');return 7;});await Promise.resolve();assert.deepEqual(events,['start']);
 finish();await rejected;await skippedResult;assert.equal(await next,7);assert.deepEqual(events,['start','cleanup','next']);
});
