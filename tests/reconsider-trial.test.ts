import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rescueAfterWithdrawal,reconsiderSummary} from '../src/reconsider-trial.js';
import type {Domain} from '../src/protocol.js';
function state():Domain{return {schema:1,world:'w',epoch:'e',branch:'b',characters:{A:{id:'A',name:'Ada',memories:[]}},proposals:{p:{id:'p',pawn:'A',action:{kind:'haul',thing:'steel',x:1,z:1,count:10,trips:3,maxTicks:1800},reason:'Haul',status:'accepted',standing:{status:'stopped',deadline:1800,steps:['h'],reason:'Help instead'}}},outcomes:{h:{id:'h',actor:'A',status:'completed',reason:'Delivered',x:1,z:1,delivered:10}}};}
const thought={intention:{id:'p',standing:{status:'running'}},output:{kind:'withdraw',reason:'Help instead'}};
// Ordered-haul specific (the reconsider trial ran on an ordered haul; removed with it).
test('only applied pawn-owned withdrawal from this agreement can authorize a new rescue offer',()=>{
 assert(rescueAfterWithdrawal(state(),'A','p',thought,true));
 assert(!rescueAfterWithdrawal(state(),'A','p',thought,false));
 for(const kind of ['continue','proposal'])assert(!rescueAfterWithdrawal(state(),'A','p',{...thought,output:{...thought.output,kind}},true));
 for(const field of ['commitment','intention'] as const){const d=state();d.characters.A![field]='unresolved';assert(!rescueAfterWithdrawal(d,'A','p',thought,true));}
 const d=state();d.proposals.p!.standing!.reason='Operator trial ended';assert(!rescueAfterWithdrawal(d,'A','p',thought,true));
 assert(!rescueAfterWithdrawal(state(),'A','other',thought,true));
});
// Ordered-haul specific (the reconsider trial ran on an ordered haul; removed with it).
test('mixed trial counts rescue patients separately from steel and hauling trips',()=>{
 const d=state();d.proposals.r={id:'r',pawn:'A',action:{kind:'rescue',target:'B',bed:'bed',x:2,z:2,maxTicks:1800},status:'accepted',reason:'Rescue',standing:{status:'completed',deadline:1800,steps:['r1']}};
 d.outcomes.r1={id:'r1',actor:'A',status:'completed',reason:'Placed in bed',x:2,z:2,delivered:1};
 const summary=reconsiderSummary(d);assert.equal(summary.deliveredSteel,10);assert.equal(summary.completedRescues,1);assert.equal(summary.completedHaulTrips,1);
});
