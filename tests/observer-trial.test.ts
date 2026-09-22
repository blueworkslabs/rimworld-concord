import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingObserverRequest} from '../src/observer-trial.js';
import type {Domain} from '../src/protocol.js';
test('observer core processes only pending deliberately addressed requests once',()=>{
 const d={requests:{a:{id:'a',status:'declined'},b:{id:'b',status:'pending'},c:{id:'c',status:'offered'}}} as unknown as Domain;
 assert.equal(pendingObserverRequest(d,new Set())?.id,'b');assert.equal(pendingObserverRequest(d,new Set(['b'])),undefined);
});
