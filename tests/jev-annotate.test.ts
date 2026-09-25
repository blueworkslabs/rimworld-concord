import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TrialBudget} from '../src/appraisal.js';
import {JEV_EXPECTED_MODEL,groundingCategories} from '../src/jev-questions.js';
import {JevAnnotator,annotationRequests,flagsOf,type AnnotationEvent} from '../src/jev-annotate.js';
import {buildRequests,loadCases} from '../trials/jev-replay.js';

const evidence=JSON.parse(readFileSync(new URL('../../docs/evidence/recorded-scene.json',import.meta.url),'utf8'));
const cases=loadCases(evidence);
const aligned=cases.filter(c=>c.alignment==='aligned'&&c.returned);
const inputOf=(index:number)=>evidence.live.coreInputs.filter((i:{mode:string})=>i.mode==='core')[index].view;

/** Deterministic fake: scores by key, never by state. */
const fake=(scores:Record<string,number>={},model=JEV_EXPECTED_MODEL,cost=0.0001)=>{
 const calls:unknown[]=[];
 const transport=async(body:unknown)=>{calls.push(body);
  const q=(body as {questions:Record<string,{type:string}>}).questions;
  const answers:Record<string,unknown>={};
  for(const k of Object.keys(q))answers[k]={type:'noul',noul:scores[k]??0.1};
  return {model,answers,usage:{cost}};};
 return {transport,calls};
};
const journal=()=>{const events:AnnotationEvent[]=[];return {events,sink:(e:AnnotationEvent)=>{events.push(structuredClone(e));}};};

test('live annotation asks byte-for-byte what the offline replay asked for the same turn',()=>{
 const replay=buildRequests(cases);
 for(const c of aligned){
  const live=annotationRequests('core',inputOf(c.index),c.returned);
  const g=live.requests.find(r=>r.kind==='grounding')!;
  const r=replay.find(x=>x.kind==='grounding'&&x.index===c.index)!;
  assert.equal(g.sha256,r.sha256,`turn ${c.index}`);
  assert.deepEqual(Object.keys(g.request.questions).sort(),[...groundingCategories].sort());
  assert.equal(live.skipped.length,0);
 }
});

test('asks_core rides only on wakes that carry pawn messages; other modes and bad replies produce nothing',()=>{
 const withMessages=aligned.filter(c=>c.wake.messagesToCore.length),without=aligned.filter(c=>!c.wake.messagesToCore.length);
 assert.ok(withMessages.length>0&&without.length>0);
 for(const c of withMessages){const a=annotationRequests('core',inputOf(c.index),c.returned).requests.find(r=>r.kind==='asks_core');assert.ok(a);assert.deepEqual(Object.keys(a.request.questions),['asks_core']);}
 for(const c of without)assert.equal(annotationRequests('core',inputOf(c.index),c.returned).requests.some(r=>r.kind==='asks_core'),false);
 const c=aligned[0]!;
 assert.deepEqual(annotationRequests('reflection',inputOf(c.index),c.returned),{requests:[],skipped:[]});
 assert.deepEqual(annotationRequests('core-answer',inputOf(c.index),c.returned),{requests:[],skipped:[]});
 const bad=annotationRequests('core',inputOf(c.index),{choice:'say',text:'not a core reply'});
 assert.equal(bad.requests.length,0);assert.equal(bad.skipped[0]?.reason,'reply is not a core choice');
});

test('an oversized state is skipped without a reservation or a call',async()=>{
 const c=aligned[0]!;const view={...inputOf(c.index),brief:{id:'brief',text:'x'.repeat(20000)}};
 const f=fake(),j=journal(),budget=new TrialBudget(':memory:',0.1,10,'jev-annotate-v1');
 const out=await new JevAnnotator(f.transport,budget,j.sink).annotate('d1','core',view,c.returned);
 assert.equal(out.length,0);assert.equal(f.calls.length,0);
 assert.ok(j.events.some(e=>e.event==='skipped'&&/too large/.test(e.reason)));
 assert.equal(Number(budget.summary()!.calls),0);
 assert.equal(new JevAnnotator(f.transport,budget,j.sink).summary().skipped,0);
});

test('flags are nouls at or above 0.5, journaled attempted → received → result, cost settled',async()=>{
 const c=aligned[0]!;
 const f=fake({unsupported_fact:0.5,observation_time_as_event_time:0.75,speaks_for_other:0.49}),j=journal(),budget=new TrialBudget(':memory:',0.1,10,'jev-annotate-v1');
 const annotator=new JevAnnotator(f.transport,budget,j.sink);
 const out=await annotator.annotate('d1','core',inputOf(c.index),c.returned);
 assert.equal(out.length,1);assert.equal(out[0]!.error,undefined);
 assert.deepEqual(out[0]!.flags,['unsupported_fact','observation_time_as_event_time']);
 assert.equal(out[0]!.model,JEV_EXPECTED_MODEL);assert.equal(out[0]!.costUSD,0.0001);
 assert.deepEqual(j.events.map(e=>e.event),['attempted','received','result']);
 assert.ok(j.events.every(e=>e.event==='skipped'||e.decisionId==='d1'));
 const s=annotator.summary();
 assert.equal(s.attempted,1);assert.equal(s.answered,1);assert.equal(s.failed,0);
 assert.equal(s.flagged.unsupported_fact,1);assert.equal(s.flagged.observation_time_as_event_time,1);assert.equal(s.flagged.speaks_for_other,0);
 assert.equal(Number(budget.summary()!.reportedUSD),0.0001);
 assert.deepEqual(flagsOf({a:{type:'noul',noul:0.5},b:{type:'noul',noul:0.4999}}),['a']);
});

test('a wrong model, a transport failure and an exhausted budget are recorded, keep paid bytes, and never throw',async()=>{
 const c=aligned[0]!;const view=inputOf(c.index);
 // Wrong model: the paid response is journaled before the contract rejects it.
 {const f=fake({},'typesafe/jev-1.14-20261001'),j=journal(),budget=new TrialBudget(':memory:',0.1,10,'jev-annotate-v1');
  const [a]=await new JevAnnotator(f.transport,budget,j.sink).annotate('d1','core',view,c.returned);
  assert.match(a!.error!,/Unexpected Jev model/);assert.ok(a!.raw?.includes('jev-1.14'));assert.equal(a!.costUSD,0.0001);
  assert.deepEqual(j.events.map(e=>e.event),['attempted','received','failure']);
  assert.equal(Number(budget.summary()!.reportedUSD),0.0001);}
 // Transport failure: reservation kept, no raw.
 {const j=journal(),budget=new TrialBudget(':memory:',0.1,10,'jev-annotate-v1');
  const [a]=await new JevAnnotator(async()=>{throw Error('Protected Jev request failed');},budget,j.sink).annotate('d2','core',view,c.returned);
  assert.equal(a!.error,'Protected Jev request failed');assert.equal(a!.raw,undefined);
  assert.deepEqual(j.events.map(e=>e.event),['attempted','failure']);
  assert.equal(Number(budget.summary()!.calls),1);assert.equal(Number(budget.summary()!.reportedUSD),0);}
 // Exhausted budget: no call is made and the turn is unaffected.
 {const f=fake(),j=journal(),budget=new TrialBudget(':memory:',0.002,1,'jev-annotate-v1');
  const annotator=new JevAnnotator(f.transport,budget,j.sink);
  await annotator.annotate('d3','core',view,c.returned);
  const [b]=await annotator.annotate('d4','core',view,c.returned);
  assert.equal(f.calls.length,1);assert.equal(b!.error,'Trial budget exhausted');
  assert.equal(annotator.summary().failed,1);assert.equal(annotator.summary().answered,1);}
 // Timeout: the bounded call ends with a named cause.
 {const j=journal(),budget=new TrialBudget(':memory:',0.1,10,'jev-annotate-v1');
  const never=(_:unknown,signal:AbortSignal)=>new Promise<never>((_r,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
  const [a]=await new JevAnnotator(never,budget,j.sink,25).annotate('d5','core',view,c.returned);
  assert.equal(a!.error,'timeout');}
 // Cancelled by the host: named as such.
 {const j=journal(),budget=new TrialBudget(':memory:',0.1,10,'jev-annotate-v1');
  const ctl=new AbortController();
  const never=(_:unknown,signal:AbortSignal)=>new Promise<never>((_r,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
  const p=new JevAnnotator(never,budget,j.sink).annotate('d6','core',view,c.returned,ctl.signal);
  ctl.abort();const [a]=await p;assert.equal(a!.error,'cancelled');}
});

test('a sink failure on the attempt never reaches the caller and makes no call; drain waits for in-flight work',async()=>{
 const c=aligned[0]!;const f=fake(),budget=new TrialBudget(':memory:',0.1,10,'jev-annotate-v1');
 const broken=new JevAnnotator(f.transport,budget,()=>{throw Error('disk full');});
 const out=await broken.annotate('d1','core',inputOf(c.index),c.returned);
 assert.equal(f.calls.length,0);assert.equal(out[0]!.error,'Annotation journal unavailable');assert.equal(broken.summary().attempted,0);assert.ok(broken.summary().unjournaled.length>0);
 let resolved=false;const slow=new JevAnnotator(async(b)=>{await new Promise(r=>setTimeout(r,30));resolved=true;return f.transport(b);},budget);
 void slow.annotate('d2','core',inputOf(c.index),c.returned);
 await slow.drain();assert.equal(resolved,true);assert.equal(slow.summary().answered,1);
});

test('budget denial and cancellation during attempt journaling do not inflate actual calls',async()=>{
 const c=aligned[0]!,view=inputOf(c.index),f=fake(),j=journal(),budget=new TrialBudget(':memory:',0.002,1,'jev-annotate-v1');
 const a=new JevAnnotator(f.transport,budget,j.sink);
 await a.annotate('first','core',view,c.returned);await a.annotate('denied','core',view,c.returned);
 assert.equal(a.summary().attempted,1);assert.equal(f.calls.length,1);
 assert.equal(j.events.filter(e=>e.event==='attempted').length,1);budget.close();
 const ctl=new AbortController(),b=new TrialBudget(':memory:',0.01,5,'jev-annotate-v1'),noCall=fake();
 const cancelled=new JevAnnotator(noCall.transport,b,e=>{if(e.event==='attempted')ctl.abort();});
 const [out]=await cancelled.annotate('cancel','core',view,c.returned,ctl.signal);
 assert.equal(out!.error,'cancelled');assert.equal(noCall.calls.length,0);assert.equal(cancelled.summary().attempted,0);
 assert.equal(Number(b.summary()!.calls),1,'the reservation stays conservative even if no request was sent');b.close();
});

test('paid response and charge survive received/result journal faults; later annotation calls stop',async()=>{
 const c=aligned[0]!,view=inputOf(c.index);
 for(const brokenEvent of ['received','result'] as const){
  const f=fake(),b=new TrialBudget(':memory:',0.02,10,'jev-annotate-v1');
  const a=new JevAnnotator(f.transport,b,e=>{if(e.event===brokenEvent)throw Error('disk full');});
  const [out]=await a.annotate('paid','core',view,c.returned);
  assert.equal(out!.error,'Annotation journal unavailable');assert.equal(out!.costUSD,0.0001);assert.ok(out!.raw);
  assert.equal(Number(b.summary()!.reportedUSD),0.0001);
  const s=a.summary();assert.equal(s.answered,0);assert.equal(s.failed,1);assert.equal(s.costUSD,0.0001);
  assert.equal(s.journalFailures,1);assert.equal(s.unjournaled[0]!.event,brokenEvent);
  assert.ok('raw' in s.unjournaled[0]!&&s.unjournaled[0]!.raw);
  await a.annotate('later','core',view,c.returned);assert.equal(f.calls.length,1);assert.equal(a.summary().attempted,1);b.close();
 }
});

test('a journal failure cannot hide a paid overrun from the persistent budget lock',async()=>{
 const c=aligned[0]!,b=new TrialBudget(':memory:',0.02,10,'jev-annotate-v1');
 const f=fake({},JEV_EXPECTED_MODEL,0.003),a=new JevAnnotator(f.transport,b,e=>{if(e.event==='received')throw Error('disk full');});
 const [out]=await a.annotate('overrun','core',inputOf(c.index),c.returned);
 assert.equal(out!.error,'Provider cost exceeded reservation');assert.equal(out!.costUSD,0.003);
 assert.equal(Number(b.summary()!.reportedUSD),0.003);assert.throws(()=>b.assertHealthy(),/locked/);
 assert.ok(a.summary().unjournaled.some(e=>e.event==='received'&&e.costUSD===0.003));b.close();
});

test('a paid response returned after cancellation is retained but never scored as an answer',async()=>{
 const c=aligned[0]!,ctl=new AbortController(),b=new TrialBudget(':memory:',0.02,10,'jev-annotate-v1'),f=fake(),j=journal();
 const a=new JevAnnotator(async body=>{ctl.abort();return f.transport(body);},b,j.sink);
 const [out]=await a.annotate('late','core',inputOf(c.index),c.returned,ctl.signal);
 assert.equal(out!.error,'cancelled');assert.ok(out!.raw);assert.equal(out!.costUSD,0.0001);
 assert.equal(a.summary().answered,0);assert.equal(a.summary().failed,1);
 assert.deepEqual(j.events.map(e=>e.event),['attempted','received','failure']);b.close();
});

test('malformed projected input is explicitly skipped without a call',async()=>{
 const c=aligned[0]!,b=new TrialBudget(':memory:',0.02,10,'jev-annotate-v1'),f=fake(),j=journal();
 const a=new JevAnnotator(f.transport,b,j.sink);
 await a.annotate('malformed','core',{},c.returned);
 assert.equal(f.calls.length,0);assert.equal(a.summary().skipped,2);
 assert.equal(j.events.filter(e=>e.event==='skipped').length,2);b.close();
});
