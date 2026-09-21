/** No-inference regression: an immediately rejected native action reaches owner memory. */
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Coordinator } from './coordinator.js';
import { Store } from './store.js';
import { LabBridge } from './lab-bridge.js';
import { scripted } from './backends.js';
const root=resolve(new URL('../..',import.meta.url).pathname),bridge=new LabBridge();
await mkdir(root+'/.runtime',{recursive:true});
const store=new Store(root+'/.runtime/immediate-outcome-'+Date.now()+'.db');
try {
 await bridge.admin('pause');const c=new Coordinator(store,bridge);await c.open();const pawn=(await bridge.state()).pawns[0]!;
 const p=await c.core().propose(pawn.id,{kind:'move',x:99999,z:99999},'Operator regression: deliberately invalid destination');
 const decided=await c.pawn(pawn.id).decide(p.id,scripted({kind:'accept',reason:'Scripted test, not live judgment'}));
 await c.reconcile();await c.reconcile();const state=c.inspect(),outcome=state.outcomes[decided.actionId!]!;
 assert.equal(outcome.status,'failed');
 assert.equal(state.characters[pawn.id]!.memories.filter(m=>m==='Action failed: '+outcome.reason).length,1);
 assert(Object.values(state.characters).filter(c=>c.id!==pawn.id).every(c=>!c.memories.some(m=>m.includes(outcome.reason))));
 const receipt={at:new Date().toISOString(),passed:true,inferenceCalls:0,kind:'immediate-outcome-memory',outcome:outcome.status,reason:outcome.reason,checks:['immediate native rejection becomes owner memory exactly once','other characters receive no failure memory']};
 await writeFile(root+'/.runtime/immediate-outcome.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{store.close();}
