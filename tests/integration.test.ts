import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IntegrationWindow} from '../trials/integration-policy.js';
import {decisionTrials} from '../src/decision-trials.js';
import {laterOfferEligible} from '../src/work-trial.js';
import {TrialBudget} from '../src/appraisal.js';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('integration midpoint and deadline are clock-based, including a request spanning deadline',()=>{
 let clock=100;const w=new IntegrationWindow(300000,()=>clock);
 assert(!w.laterDue());clock+=150000;assert(w.laterDue());assert(!w.ended());clock+=150000;assert(w.ended());clock+=500;assert(w.ended());
 assert.throws(()=>new IntegrationWindow(300001));assert.throws(()=>new IntegrationWindow(0));
});
test('new integration budget survives reopen and cannot borrow historical allowance',()=>{
 const p=decisionTrials['integration-v1'];assert.equal(p.calls,12);assert.equal(decisionTrials['retention-indirect-v1'].calls,4);
 const path=join(mkdtempSync(join(tmpdir(),'integration-cap-')),'cap.db');let b=new TrialBudget(path,p.reservedEquivalentUSD,p.calls,p.policy);
 for(let i=0;i<12;i++)b.reserve(.1);b.close();b=new TrialBudget(path,p.reservedEquivalentUSD,p.calls,p.policy);assert.throws(()=>b.reserve(.1));b.close();
});
test('later integration offers cannot reinterpret refusal or an unadopted counter as permission',()=>{
 const domain:any={characters:{A:{id:'A'}},proposals:{p:{id:'p',pawn:'A',status:'refused'}}};assert(!laterOfferEligible(domain,'A'));
 domain.proposals.p={id:'p',pawn:'A',status:'countered'};assert(!laterOfferEligible(domain,'A'));
 domain.proposals.p={id:'p',pawn:'A',status:'accepted',standing:{status:'running'}};assert(!laterOfferEligible(domain,'A'));
 domain.proposals.p.standing.status='completed';assert(laterOfferEligible(domain,'A'));
});
import {integrationHostAllowance,preservePartial} from '../trials/integration-policy.js';
test('delayed midpoint requests cannot renew their host cutoff or start on deadline',()=>{
 assert.equal(integrationHostAllowance(null,100),45000);
 assert.equal(integrationHostAllowance(500,100),400);
 assert.throws(()=>integrationHostAllowance(500,500));assert.throws(()=>integrationHostAllowance(500,700));
 assert.throws(()=>integrationHostAllowance(undefined,100));assert.throws(()=>integrationHostAllowance('500',100));
});
test('recoverable failure preserves partial paired state, without labelling the trial successful',async()=>{
 let saves=0;assert(await preservePartial(false,[],async()=>{saves++;}));assert.equal(saves,1);
 assert(!await preservePartial(true,[],async()=>{saves++;}));assert(!await preservePartial(false,['unresolved work'],async()=>{saves++;}));assert.equal(saves,1);
 await assert.rejects(preservePartial(false,[],async()=>{throw Error('unavailable bridge');}));
});
