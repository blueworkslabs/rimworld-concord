import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {recordingProcess} from '../src/recording-process.js';
test('missing recorder is retained without an unattended rejected promise',async()=>{
 const recorder=recordingProcess('/concord-no-such-recorder',[],{stdio:'ignore'});
 await delay(30);assert.equal(recorder.finished,true);assert(recorder.failure);assert.equal(await recorder.completion,-1);await recorder.stop();
});
test('operator cleanup waits for its recorder to terminate',async()=>{
 const recorder=recordingProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
 await delay(100);assert.equal(recorder.finished,false);await recorder.stop();assert.equal(recorder.finished,true);assert.equal(recorder.failure,undefined);
});
