import {test} from 'node:test';
import assert from 'node:assert/strict';
import {laterOfferEligible,workSummary,WORK_TRIAL} from '../src/work-trial.js';
import type {Domain,Proposal} from '../src/protocol.js';
const proposal:Proposal={id:'p',pawn:'A',action:{kind:'haul',thing:'steel',x:1,z:1,count:10,trips:2,maxTicks:600},reason:'Supplies',status:'accepted',standing:{status:'completed',deadline:600,steps:['a','b']}};
function domain():Domain{return {schema:1,world:'w',epoch:'e',branch:'b',characters:{A:{id:'A',name:'Ada',memories:[]}},proposals:{p:structuredClone(proposal)},outcomes:{}};}
test('later work is a new offer only after completed agreements, never a refusal/failure retry',()=>{
 assert(laterOfferEligible(domain(),'A'));assert(!laterOfferEligible(domain(),'B'));
 for(const status of ['pending','refused','withdrawn','countered'] as const){const d=domain();d.proposals.p!.status=status;assert(!laterOfferEligible(d,'A'));}
 for(const status of ['running','stopped'] as const){const d=domain();d.proposals.p!.standing!.status=status;assert(!laterOfferEligible(d,'A'));}
 for(const key of ['commitment','intention'] as const){const d=domain();d.characters.A![key]='ongoing';assert(!laterOfferEligible(d,'A'));}
 const d=domain();d.proposals={};assert(!laterOfferEligible(d,'A'));
});
test('answered counter followed by completed consent allows optional later work',()=>{
 const d=domain();d.proposals.parent={...proposal,id:'parent',status:'countered',replyId:'p',standing:undefined};assert(laterOfferEligible(d,'A'));
 d.proposals.p!.status='refused';assert(!laterOfferEligible(d,'A'));
});
test('summary distinguishes delivered units, completed trips and stopped intentions',()=>{
 const d=domain();d.outcomes.a={id:'a',actor:'A',status:'completed',reason:'Delivered',x:1,z:1,delivered:10};d.outcomes.b={id:'b',actor:'A',status:'failed',reason:'Partial',x:1,z:1,delivered:2};d.proposals.p!.standing!.status='stopped';
 const s=workSummary(d);assert.equal(s.deliveredUnits,12);assert.equal(s.completedTrips,1);assert.equal(s.stopped.length,1);
 assert.deepEqual(WORK_TRIAL,{decisions:12,appraisals:12,reflections:3,observationMs:300000,secondRoundMs:120000,maxTurns:48});
});
