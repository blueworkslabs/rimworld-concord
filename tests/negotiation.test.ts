import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyNegotiationContinuation} from '../src/negotiation-fixture.js';
import type {Domain,Proposal} from '../src/protocol.js';
test('continuation requires exactly the same completed choices, no pending thought or active action',()=>{
 const p:Proposal={id:'p',pawn:'A',action:{kind:'move',x:1,z:1},reason:'Walk',status:'accepted',decision:{kind:'accept',reason:'Yes'},actionId:'a'};
 const state:Domain={schema:1,world:'world',epoch:'now',branch:'branch',characters:{A:{id:'A',name:'A',memories:[]}},proposals:{p},outcomes:{a:{id:'a',actor:'A',status:'failed',reason:'Unavailable',x:1,z:1}}};
 const partial={decisions:[p],views:[{proposal:'p'}]};verifyNegotiationContinuation(state,partial,1);
 for(const bad of [0,2,6])assert.throws(()=>verifyNegotiationContinuation(state,partial,bad));
 assert.throws(()=>verifyNegotiationContinuation(state,{...partial,views:[{proposal:'unknown'}]},1));
 assert.throws(()=>verifyNegotiationContinuation({...state,outcomes:{}},partial,1));
 assert.throws(()=>verifyNegotiationContinuation({...state,characters:{A:{...state.characters.A!,commitment:'a'}}},partial,1));
 assert.throws(()=>verifyNegotiationContinuation({...state,proposals:{p:{...p,status:'pending'}}},partial,1));
 assert.throws(()=>verifyNegotiationContinuation(state,{...partial,decisions:[{...p,decision:{kind:'refuse',reason:'Changed'}}]},1));
});
