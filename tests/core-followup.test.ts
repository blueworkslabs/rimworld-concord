import {test} from 'node:test';
import assert from 'node:assert/strict';
import {followupInferencePassed,CORE_FOLLOWUP_POLICY as P} from '../trials/core-followup-policy.js';
import {decisionTrials} from '../src/decision-trials.js';
test('follow-up report preserves failed or silent replies and never treats a fifth core attempt as passing',()=>{
 assert.equal(P.coreCalls,decisionTrials['core-followup-core-v1'].calls);assert.equal(P.pawnCalls,decisionTrials['core-followup-pawns-v1'].calls);
 for(const status of ['delivered','silent'])assert(followupInferencePassed([{result:{status:'applied'},answer:{status}},{result:{status:'applied'}}]));
 for(const rounds of [[],Array.from({length:5},()=>({result:{status:'applied'}})),[{result:{status:'failed'}}],[{result:{status:'applied'},answer:{status:'failed'}}],[{result:{status:'applied'},pawnError:'unavailable'}],[{result:{status:'applied'},proposal:{}}]])assert(!followupInferencePassed(rounds));
 assert(followupInferencePassed([{result:{status:'applied'},proposal:{decision:{kind:'refuse'}}}]));
});
