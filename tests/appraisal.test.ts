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

test('invalid answers still account for known charges and persist overrun locks',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'concord-invalid-charge-')),path=join(dir,'budget.db');
 let budget=new TrialBudget(path);
 try {
  await assert.rejects(new JevAppraiser(async()=>reply(2,1),budget).assess(view,new AbortController().signal),/exceeded/);
  assert.equal(budget.summary()!.reportedUSD,1);budget.close();budget=new TrialBudget(path);
  assert.throws(()=>budget.reserve(.002),/locked/);
 }finally{budget.close();rmSync(dir,{recursive:true,force:true});}
});

test('old partially settled overruns fail closed and repeated receipts cannot erase charges',()=>{
 const budget=new TrialBudget(':memory:');
 try {
  const id=budget.reserve(.002);
  (budget as any).db.prepare("UPDATE attempts SET actual=1,state='settled' WHERE id=?").run(id);
  assert.throws(()=>budget.reserve(.002),/locked/);
  assert.throws(()=>budget.settle(id,.001),/exceeded/);
  assert.equal(budget.summary()!.reportedUSD,1);
  assert.throws(()=>budget.reserve(.002),/locked/);
 }finally{budget.close();}
});

test('a process exit after the settlement statement preserves both charge and overrun lock',async()=>{
 const {spawnSync}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'concord-charge-crash-')),path=join(dir,'budget.db');
 try {
  const source=`import {TrialBudget} from ${JSON.stringify(new URL('../src/appraisal.js',import.meta.url).href)};
   const budget=new TrialBudget(process.argv[1]);const id=budget.reserve(.002);
   const db=budget.db,prepare=db.prepare.bind(db);
   db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('UPDATE attempts SET actual='))return {get(...args){statement.get(...args);process.exit(86);}};return statement;};
   budget.settle(id,1);process.exit(87);`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',source,path],{encoding:'utf8'});
  assert.equal(child.status,86,child.stderr);
  const reopened=new TrialBudget(path);
  try{assert.equal(reopened.summary()!.reportedUSD,1);assert.throws(()=>reopened.reserve(.002),/locked/);}finally{reopened.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
