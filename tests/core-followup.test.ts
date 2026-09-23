import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coreFollowupPolicy,followupInferencePassed,CORE_FOLLOWUP_POLICY as P} from '../trials/core-followup-policy.js';
import {decisionTrials} from '../src/decision-trials.js';
test('follow-up report preserves failed or silent replies and never treats a fifth core attempt as passing',()=>{
 assert.equal(P.coreCalls,decisionTrials['core-followup-core-v1'].calls);assert.equal(P.pawnCalls,decisionTrials['core-followup-pawns-v1'].calls);
 for(const status of ['delivered','silent'])assert(followupInferencePassed([{result:{status:'applied'},answer:{status}},{result:{status:'applied'}}]));
 for(const rounds of [[],Array.from({length:5},()=>({result:{status:'applied'}})),[{result:{status:'failed'}}],[{result:{status:'applied'},answer:{status:'failed'}}],[{result:{status:'applied'},pawnError:'unavailable'}],[{result:{status:'applied'},proposal:{}}]])assert(!followupInferencePassed(rounds));
 assert(followupInferencePassed([{result:{status:'applied'},proposal:{decision:{kind:'refuse'}}}]));
});

test('food follow-up has separate finite identities without increasing the earlier allowance',()=>{
 const old=coreFollowupPolicy('core-followup-v1'),next=coreFollowupPolicy('food-followup-v1');
 assert.equal(old.coreCalls,4);assert.equal(old.pawnCalls,5);
 for(const p of [old,next]){assert.equal(decisionTrials[p.coreTrial].calls,p.coreCalls);assert.equal(decisionTrials[p.pawnTrial].calls,p.pawnCalls);}
 assert.notEqual(old.coreTrial,next.coreTrial);assert.notEqual(old.pawnTrial,next.pawnTrial);
 assert.throws(()=>coreFollowupPolicy('food-followup-v2'),/Unknown/);
 const six=Array.from({length:6},()=>({result:{status:'applied'}}));
 assert(followupInferencePassed(six,next.coreCalls));assert(!followupInferencePassed(six,old.coreCalls));assert(!followupInferencePassed([...six,...six],next.coreCalls));
});

test('recovery follow-through keeps prior caps and uses new independent ledgers',()=>{
 const old=coreFollowupPolicy('food-followup-v1'),next=coreFollowupPolicy('recovery-followup-v1');
 assert.equal(next.coreCalls,6);assert.equal(next.pawnCalls,6);assert.equal(next.nativeMs,120000);assert.equal(next.jevCalls,0);
 assert.notEqual(old.coreTrial,next.coreTrial);assert.notEqual(old.pawnTrial,next.pawnTrial);
 for(const p of [old,next]){assert.equal(decisionTrials[p.coreTrial].calls,6);assert.equal(decisionTrials[p.pawnTrial].calls,6);assert.equal(decisionTrials[p.coreTrial].reservedEquivalentUSD,.60);}
});

test('identity follow-through keeps prior caps and uses new independent ledgers',()=>{
 const old=coreFollowupPolicy('recovery-followup-v1'),next=coreFollowupPolicy('identity-followup-v1');
 assert.equal(next.coreCalls,6);assert.equal(next.pawnCalls,6);assert.equal(next.nativeMs,120000);assert.equal(next.jevCalls,0);
 assert.notEqual(old.coreTrial,next.coreTrial);assert.notEqual(old.pawnTrial,next.pawnTrial);
 for(const p of [old,next]){assert.equal(decisionTrials[p.coreTrial].calls,6);assert.equal(decisionTrials[p.pawnTrial].calls,6);assert.equal(decisionTrials[p.coreTrial].reservedEquivalentUSD,.60);}
});

test('eating follow-through owns fresh ledgers and preserves all earlier caps',()=>{
 const next=coreFollowupPolicy('eating-followup-v1');
 assert.equal(next.coreCalls,6);assert.equal(next.pawnCalls,6);assert.equal(next.nativeMs,120000);assert.equal(next.scriptedNativeMs,30000);assert.equal(next.jevCalls,0);
 for(const id of ['core-followup-v1','food-followup-v1','recovery-followup-v1','identity-followup-v1']){const old=coreFollowupPolicy(id);assert.notEqual(old.coreTrial,next.coreTrial);assert.notEqual(old.pawnTrial,next.pawnTrial);assert.equal(old.scriptedNativeMs,15000);}
 for(const id of [next.coreTrial,next.pawnTrial]){assert.equal(decisionTrials[id].calls,6);assert.equal(decisionTrials[id].reservedEquivalentUSD,.60);}
});

test('closure follow-through has independent finite ledgers and leaves every prior policy unchanged',()=>{
 const next=coreFollowupPolicy('closure-followup-v1');
 assert.equal(next.coreCalls,6);assert.equal(next.pawnCalls,6);assert.equal(next.nativeMs,120000);assert.equal(next.scriptedNativeMs,30000);assert.equal(next.jevCalls,0);
 for(const id of ['core-followup-v1','food-followup-v1','recovery-followup-v1','identity-followup-v1','eating-followup-v1']){const old=coreFollowupPolicy(id);assert.notEqual(old.coreTrial,next.coreTrial);assert.notEqual(old.pawnTrial,next.pawnTrial);assert.equal(decisionTrials[old.coreTrial].calls,old.coreCalls);assert.equal(decisionTrials[old.pawnTrial].calls,old.pawnCalls);}
 for(const id of [next.coreTrial,next.pawnTrial]){assert.equal(decisionTrials[id].calls,6);assert.equal(decisionTrials[id].reservedEquivalentUSD,.60);}
});
