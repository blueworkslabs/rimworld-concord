import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JevAppraiser, TrialBudget } from '../src/appraisal.js';
const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Haul',health:1},character:{id:'A',name:'Ada',memories:[]},event:{seq:1,tick:1,pawn:'A',kind:'mood',detail:'low'}};
const reply=(noul=0.8,cost=0.00001)=>({model:'typesafe/jev-1.13',answers:{reflect:{type:'noul',noul}},usage:{cost}});
test('decimal reservations reach the exact limit without granting another call or real overage',()=>{
 const budget=new TrialBudget(':memory:',0.3,4);
 budget.reserve(0.1);budget.reserve(0.1);budget.reserve(0.1);
 assert.equal(budget.summary()!.calls,3);
 assert.throws(()=>budget.reserve(0.000001),/exhausted/);budget.close();
});
test('Jev asks a bounded question; does not execute actions; trial limit persists across adapter recreation',async()=>{
 const budget=new TrialBudget(':memory:',0.01,1);
 const transport=async(body:unknown)=>{assert.equal((body as {model:string}).model,'typesafe/jev-1.13');return reply();};
 const r=await new JevAppraiser(transport,budget).assess(view,new AbortController().signal);
 assert.equal(r.route,'deliberation');
 await assert.rejects(new JevAppraiser(transport,budget).assess(view,new AbortController().signal),/exhausted/);budget.close();
});
test('malformed scores, wrong owners and provider failures never produce an intention',async()=>{
 const budget=new TrialBudget(':memory:');const a=new JevAppraiser(async()=>reply(2),budget);
 await assert.rejects(a.assess({...view,event:{...view.event,pawn:'B'}},new AbortController().signal),/ownership/);
 assert.equal(budget.summary()!.calls,0);
 await assert.rejects(a.assess(view,new AbortController().signal));assert.equal(budget.summary()!.reservedUSD,0.002);budget.close();
});
test('uncertain charges remain reserved and unexpected pricing locks the ledger',async()=>{
 const budget=new TrialBudget(':memory:');
 await assert.rejects(new JevAppraiser(async()=>{throw Error('offline');},budget).assess(view,new AbortController().signal),/offline/);
 assert.equal(budget.summary()!.reservedUSD,0.002);
 await assert.rejects(new JevAppraiser(async()=>reply(0.8,1),budget).assess(view,new AbortController().signal),/exceeded/);
 await assert.rejects(new JevAppraiser(async()=>reply(),budget).assess(view,new AbortController().signal),/locked/);budget.close();
});

test('aborted requests retain their reservation even when transport ignores cancellation',async()=>{
 const budget=new TrialBudget(':memory:');const controller=new AbortController();
 const appraiser=new JevAppraiser(()=>new Promise(()=>{}),budget);
 const pending=appraiser.assess(view,controller.signal);
 controller.abort();await assert.rejects(pending,/cancelled/);
 assert.equal(budget.summary()!.reservedUSD,0.002);budget.close();
});

test('billing reservations survive closing and reopening the ledger',()=>{
 const root=mkdtempSync(join(tmpdir(),'concord-budget-'));
 try {
  const first=new TrialBudget(join(root,'budget.db'),0.002,1);first.reserve(0.002);first.close();
  const reopened=new TrialBudget(join(root,'budget.db'),0.002,1);
  assert.throws(()=>reopened.reserve(0.002),/exhausted/);reopened.close();
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('a persistent trial cannot be reopened with a larger or differently named allowance',()=>{
 const dir=mkdtempSync(join(tmpdir(),'concord-policy-')),path=join(dir,'budget.db');
 try{
  const budget=new TrialBudget(path,0.4,4,'reliability');budget.reserve(0.1);budget.close();
  assert.throws(()=>new TrialBudget(path,0.5,5,'reliability'),/policy mismatch/);
  assert.throws(()=>new TrialBudget(path,0.4,4,'replacement'),/policy mismatch/);
  const reopened=new TrialBudget(path,0.4,4,'reliability');assert.equal(reopened.summary()!.calls,1);reopened.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
