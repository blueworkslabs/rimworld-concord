import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {Coordinator} from '../src/coordinator.js';
import {Store} from '../src/store.js';
import {LabBridge} from '../src/lab-bridge.js';
import type {CoreView} from '../src/core-planner.js';
import {stopTrialWork,workSummary} from '../src/work-trial.js';
import {socialCleanup} from './social-cleanup.js';
import {retainedDomain} from './retention-policy.js';
if(process.env.CONCORD_CORE_LIFECYCLE_LOCKED!=='1')throw Error('Use scripts/run-core-lifecycle-lab.sh game|cold');
const deadline=Date.now()+240000;let operationDeadline=deadline;
const root=new URL('../..',import.meta.url).pathname,b=new LabBridge(undefined,()=>operationDeadline),cold=process.argv.includes('--cold');
const receipt:any={passed:false,mode:cold?'cold':'scripted-native',inferenceCalls:0,cases:[]};
let c:Coordinator|undefined,s:Store|undefined;
const check=()=>{if(Date.now()>deadline)throw Error('Native verification deadline');};
const planner=(fn:(v:CoreView)=>unknown)=>({name:'scripted-core-lifecycle',async plan(v:CoreView){check();return fn(v);}});
const wait={topics:[],actionTopicId:null,action:{kind:'wait',reason:'No further offer.'}};
async function pulse(until:()=>boolean,ms=35000){
 const end=Date.now()+ms;check();await b.admin('run');
 try{while(Date.now()<end){check();await c!.reconcile();await c!.advanceIntentions(()=>Date.now()<end&&Date.now()<deadline);if(until())return;await delay(300);}throw Error('Native condition did not occur');}
 finally{await b.admin('pause');await c!.reconcile();}
}
try{
 for(const response of ['accept','refuse'] as const){
  check();
  const marker=root+'/.runtime/core-lifecycle-'+response+'-latest.json';
  if(cold){
   check();
   const saved=JSON.parse(await readFile(marker,'utf8'));s=new Store(saved.db);c=new Coordinator(s,b);await c.restore(saved.checkpoint);retainedDomain(c.inspect(),saved.domain);assert.deepEqual(c.inspect().reoffers,saved.domain.reoffers);assert.deepEqual(c.inspect().coreState,saved.domain.coreState);
   check();receipt.cases.push({response,coldRestore:true,coreState:c.inspect().coreState,reoffers:c.inspect().reoffers,report:(await b.state()).crewLog});s.close();s=undefined;c=undefined;continue;
  }
  const f=JSON.parse(await readFile(root+'/.runtime/needs-fixture.json','utf8'));await b.load(f.name);await b.admin('pause');check();
  const runId=randomUUID(),db=root+'/.runtime/core-lifecycle-'+runId+'.db';s=new Store(db);c=new Coordinator(s,b);await c.open();await c.initializeCore('Optional wood hauling. Track linked work accurately; a declined offer is not completed work.');
  const first=await c.planCore(planner(v=>{const op=v.opportunities.find(o=>v.crew.find(p=>p.id===o.pawn)?.name==='Alvin')!;assert(op);return {topics:[{sourceId:op.id,text:'First haul',status:'open'}],actionTopicId:op.id,action:{kind:'propose',opportunityId:op.id,reason:'One optional agreement'}};}));assert.equal(first.status,'applied');if(first.status!=='applied')throw Error();
  const p=c.inspect().proposals[first.proposalId!]!,firstTopic=c.inspect().coreState!.topics[0]!.sourceId;
  await c.pawn(p.pawn).decide(p.id,{name:'scripted-defer',async decide(){return {kind:'defer',reason:'Not now. No promise to accept later.'};}});
  assert.equal(Object.keys(c.inspect().outcomes).length,0);assert(!(await c.corePerspective()).opportunities.some(o=>o.pawn===p.pawn));
  const beforeRequest='lab-concord-lifecycle-before-'+Date.now();await c.checkpoint(beforeRequest);
  // Typed pawn capability represents an authored deliberate message, not inferred readiness.
  const request=await c.pawn(p.pawn).requestReoffer(p.id,'You may offer that same haul once again; I will decide on the fresh terms.');
  assert.equal(Object.keys(c.inspect().outcomes).length,0);const pending='lab-concord-lifecycle-pending-'+Date.now();await c.checkpoint(pending);const pendingDomain=c.inspect();
  await c.restore(beforeRequest);assert.equal(c.inspect().reoffers,undefined);await c.restore(pending);assert.deepEqual(c.inspect().reoffers,pendingDomain.reoffers);
  const second=await c.planCore(planner(v=>{const op=v.opportunities.find(o=>o.reofferRequestId===request.id)!;assert(op);return {topics:[],actionTopicId:firstTopic,action:{kind:'propose',opportunityId:op.id,reason:'Fresh optional offer after your request'}};}));assert.equal(second.status,'applied');if(second.status!=='applied')throw Error();
  assert.equal(Object.keys(c.inspect().outcomes).length,0);await c.pawn(p.pawn).decide(second.proposalId!,{name:'scripted-fresh-consent',async decide(){return {kind:response,reason:response==='accept'?'I accept this fresh offer.':'I reconsidered. No.'};}});
  if(response==='accept'){
   await pulse(()=>c!.inspect().proposals[second.proposalId!]!.standing?.status==='completed');
   const third=await c.planCore(planner(v=>{const op=v.opportunities[0]!;assert(op);return {topics:[{sourceId:op.id,text:'Second distinct agreement',status:'open'}],actionTopicId:op.id,action:{kind:'propose',opportunityId:op.id,reason:'Separate optional work'}};}));assert.equal(third.status,'applied');if(third.status!=='applied')throw Error();
   const next=c.inspect().proposals[third.proposalId!]!;await c.pawn(next.pawn).decide(next.id,{name:'scripted-second-consent',async decide(){return {kind:'accept',reason:'Yes to this distinct agreement.'};}});await pulse(()=>c!.inspect().proposals[next.id]!.standing?.status==='completed');
  }else assert.equal(Object.keys(c.inspect().outcomes).length,0);
  const closed=await c.planCore(planner(v=>({topics:v.topics.map(t=>({sourceId:t.sourceId,text:response==='accept'?'Linked work completed.':'Fresh offer declined; no work performed.',status:response==='accept'?'resolved':'declined'})),actionTopicId:null,action:wait.action})));assert.equal(closed.status,'applied');
  const snapshot=c.inspect();assert(snapshot.coreState!.topics.every(t=>t.status===(response==='accept'?'resolved':'declined')));
  const checkpoint='lab-concord-lifecycle-final-'+Date.now();await c.checkpoint(checkpoint);const domain=c.inspect();await c.restore(checkpoint);retainedDomain(c.inspect(),domain);assert.deepEqual(c.inspect().coreState,domain.coreState);assert.deepEqual(c.inspect().reoffers,domain.reoffers);
  await writeFile(marker,JSON.stringify({runId,db,checkpoint,domain}));receipt.cases.push({response,runId,pairedRestore:true,rewindRequest:true,summary:workSummary(c.inspect()),coreState:c.inspect().coreState,reoffers:c.inspect().reoffers,report:(await b.state()).crewLog});s.close();s=undefined;c=undefined;
 }
 check();receipt.passed=true;
}catch(error){receipt.error=String(error);process.exitCode=1;}
finally{
 const cleanup=await socialCleanup(
  async()=>{operationDeadline=Date.now()+10000;await b.admin('pause');},
  async()=>{},
  async()=>{operationDeadline=Date.now()+20000;return c?stopTrialWork(c):{errors:[]};});
 receipt.cleanup=cleanup;
 if(cleanup.errors.length){receipt.passed=false;process.exitCode=1;}s?.close();
 await writeFile(root+'/.runtime/core-lifecycle-'+(cold?'cold':'game')+'.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
