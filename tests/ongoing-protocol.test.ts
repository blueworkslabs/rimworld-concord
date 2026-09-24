import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ongoingProtocol} from '../trials/ongoing-protocol.js';
test('historical observation stays frozen; recording extends time without a turn cap or inference pause',()=>{
 assert.deepEqual(ongoingProtocol(false,false),{policy:'luna-ongoing-v1',turnCap:null,cooldownTicks:300,nativeMs:180000,pausedInference:false,wallMs:600000,jevCalls:0,model:'gpt-5.6-luna'});
 const live=ongoingProtocol(true,false),dry=ongoingProtocol(true,true);
 assert.equal(live.nativeMs,600000);assert.equal(dry.nativeMs,45000);assert.equal(live.policy,dry.policy);
 assert(live.wallMs-live.nativeMs>=300000);assert.equal(live.turnCap,null);assert.equal(live.pausedInference,false);
});
