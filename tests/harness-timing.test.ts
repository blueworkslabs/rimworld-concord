import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TimingJournal,type TimingEvent,type GameSample} from '../src/harness/timing-journal.js';
import {timingFromEvents} from '../src/harness/benchmark-metrics.js';
import {ToolServer,result} from '../src/harness/tool-server.js';
import {UiMcp} from '../src/harness/ui-mcp.js';
const call=(name='act')=>({id:1,method:'tools/call',params:{name,arguments:{}}});
const sample=(tick:number,overrides:Partial<GameSample>={}):GameSample=>({world:'world',epoch:'epoch',mapId:1,tick,snapshotId:tick,paused:false,speed:'Normal',...overrides});
function fixture(source='test-adapter'){
 let mono=0,wall=1000;const events:TimingEvent[]=[];
 const journal=new TimingJournal(e=>{events.push(e);},source,{monotonicMs:()=>mono,wallMs:()=>wall});
 return {journal,events,at:(m:number,w=1000+m)=>{mono=m;wall=w;},summary:()=>timingFromEvents(events.map(e=>JSON.stringify(e)).join('\n'))};
}

test('tool phases separate observer cost, backend/transport and sampled ticks without changing replies',async()=>{
 const f=fixture(),reply=result({ok:true});
 const server=new ToolServer('test',[],{act:'input'},async()=>{f.at(30);return reply;},undefined,{
  before:async()=>{f.at(10);return sample(100);},after:async()=>{f.at(35);return sample(120);}},f.journal);
 assert.deepEqual(await server.handle(call()),{jsonrpc:'2.0',id:1,result:reply});
 const m=f.summary(),c=m.clocks[0]!;
 assert.equal(c.byKind.tool_call.unionMs,35);assert.equal(c.byKind.observer_before.unionMs,10);
 assert.equal(c.byKind.tool_dispatch.unionMs,20);assert.equal(c.byKind.observer_after.unionMs,5);
 assert.equal(c.byKind.model_call.unionMs,null);assert.equal(c.controller.activeMs,null);assert.equal(c.controller.suspendedMs,null);
 assert.equal(c.controller.unknownMs,35);assert.equal(m.gameProgress[0]!.tickDelta,20);assert.equal(m.gameProgress[0]!.elapsedSampleMs,25);
 assert.equal(new Set(m.spans.map(s=>s.callId)).size,1);assert.equal(m.status,'recorded');
});

test('wall-clock rollback cannot create negative durations or join unrelated clock domains',()=>{
 const a=fixture(),b=fixture();
 const one=a.journal.begin({kind:'model_call',label:'route-request'});a.at(20,900);a.journal.end(one);
 b.at(1,100000);const two=b.journal.begin({kind:'model_call'});b.at(6,100005);b.journal.end(two);
 const m=timingFromEvents([...a.events,...b.events].map(e=>JSON.stringify(e)).join('\n'));
 assert.deepEqual(m.spans.map(s=>s.durationMs),[20,5]);assert.equal(m.clocks.length,2);assert.equal(m.spans[0]!.endAtMs,900);
});

test('explicit controller suspension and intentional wait retain their reasons and do not classify stalls',()=>{
 const f=fixture();let id=f.journal.begin({kind:'controller_active'});f.at(5);f.journal.end(id);
 id=f.journal.begin({kind:'controller_suspended',reason:'waiting for public event'});
 const wait=f.journal.begin({kind:'intentional_wait',reason:'allow native building work'});
 f.at(105);f.journal.end(wait);f.journal.end(id);
 const m=f.summary(),c=m.clocks[0]!;
 assert.equal(c.controller.activeMs,5);assert.equal(c.controller.suspendedMs,100);assert.equal(c.controller.unknownMs,0);
 assert.equal(c.byKind.intentional_wait.unionMs,100);assert.equal(m.spans.find(s=>s.kind==='intentional_wait')!.reason,'allow native building work');
 assert(!('stalls' in m));assert.throws(()=>f.journal.begin({kind:'intentional_wait'}));
 assert.throws(()=>f.journal.begin({kind:'controller_suspended',reason:'   '}));
});

test('overlapping calls use union coverage, and contradictory controller states stay unknown',()=>{
 const f=fixture();const a=f.journal.begin({kind:'controller_active'});f.at(5);
 const b=f.journal.begin({kind:'controller_suspended',reason:'explicit test suspension'});f.at(10);f.journal.end(a);f.at(20);f.journal.end(b);
 const c=f.summary().clocks[0]!;
 assert.equal(c.controller.activeMs,5);assert.equal(c.controller.suspendedMs,10);assert.equal(c.controller.conflictingMs,5);
 assert.deepEqual(c.controller.unknownGaps,[{startMs:5,endMs:10}]);
 const g=fixture();const x=g.journal.begin({kind:'model_call'});g.at(5);const y=g.journal.begin({kind:'model_call'});
 g.at(10);g.journal.end(x);g.at(15);g.journal.end(y);
 assert.equal(g.summary().clocks[0]!.byKind.model_call.unionMs,15);assert.equal(g.summary().clocks[0]!.byKind.model_call.summedMs,20);
});

test('unresolved or duplicate controller boundaries cannot erase contradictory state uncertainty',()=>{
 for(const missingKind of ['controller_suspended','controller_active'] as const){
  const f=fixture();const closed=f.journal.begin({kind:missingKind==='controller_active'?'controller_suspended':'controller_active',reason:'explicit state'});
  f.at(10);f.journal.begin({kind:missingKind,reason:'interrupted state'});f.at(100);f.journal.end(closed);
  const c=f.summary().clocks[0]!.controller;
  assert.equal(missingKind==='controller_active'?c.suspendedMs:c.activeMs,10);
  assert.equal(missingKind==='controller_active'?c.activeMs:c.suspendedMs,null);
  assert.equal(c.unknownMs,90);assert.equal(c.unresolvedStateMs,90);
 }
 const f=fixture();const a=f.journal.begin({kind:'controller_active'});f.at(10);
 const b=f.journal.begin({kind:'controller_suspended',reason:'explicit state'});f.at(20);f.journal.end(b);
 f.at(100);f.journal.end(a);
 const duplicate={...f.events[1]!,monoMs:100};
 const m=timingFromEvents([...f.events,duplicate].map(e=>JSON.stringify(e)).join('\n'));
 assert.equal(m.clocks[0]!.controller.activeMs,10);assert.equal(m.clocks[0]!.controller.unknownMs,90);
 assert.equal(m.spans.find(s=>s.kind==='controller_suspended')!.startMs,10,'keep earliest duplicate start');
});

test('silence and interrupted/truncated calls remain unknown, not model latency or deliberate waits',()=>{
 const f=fixture();let id=f.journal.begin({kind:'tool_call',callId:'a'});f.at(10);f.journal.end(id);
 f.at(40);id=f.journal.begin({kind:'tool_call',callId:'b'});f.at(50);f.journal.end(id);
 f.at(75);f.journal.begin({kind:'tool_call',callId:'interrupted'});
 const m=timingFromEvents(f.events.map(e=>JSON.stringify(e)).join('\n')+'\n{"event":');
 assert.equal(m.status,'partial');assert.equal(m.issues.length,1);assert.equal(m.spans[2]!.durationMs,null);
 assert.deepEqual(m.clocks[0]!.unattributedGaps,[{startMs:10,endMs:40},{startMs:50,endMs:75}]);
 assert.equal(m.clocks[0]!.byKind.intentional_wait.unionMs,null);assert.equal(m.clocks[0]!.byKind.model_call.unionMs,null);
 assert.equal(timingFromEvents('').status,'unavailable');
});

test('duplicate/orphan boundaries, clock regression and changing clock provenance cannot manufacture coverage',()=>{
 const f=fixture();const id=f.journal.begin({kind:'model_call'});f.at(10);f.journal.end(id);
 const duplicate=timingFromEvents([...f.events,f.events[1]!].map(e=>JSON.stringify(e)).join('\n'));
 assert.equal(duplicate.spans[0]!.status,'invalid');assert.equal(duplicate.clocks[0]!.byKind.model_call.unionMs,null);
 assert.equal(timingFromEvents(JSON.stringify(f.events[1])).issues.length,1);
 for(const patch of [{monoMs:0},{source:'other'}]){
  const broken=[f.events[0],{...f.events[1],...patch}];
  if('monoMs' in patch)broken[0]={...f.events[0]!,monoMs:1};
  const m=timingFromEvents(broken.map(e=>JSON.stringify(e)).join('\n'));
  assert.equal(m.clocks[0]!.valid,false);assert.equal(m.spans[0]!.durationMs,null);
 }
 f.at(9);assert.throws(()=>f.journal.begin({kind:'model_call'}),/backwards/);assert.throws(()=>f.journal.end(id),/already ended/);
});

test('tick progress only joins same-world epoch/map samples; zero ticks are evidence, not a stall',()=>{
 const f=fixture();f.journal.sample('a','before',sample(100));f.at(1);f.journal.sample('a','after',sample(100,{paused:true}));
 f.at(2);f.journal.sample('b','before',sample(110,{epoch:'restored'}));
 f.at(3);f.journal.sample('b','after',sample(105,{epoch:'restored'}));
 f.at(4);f.journal.sample('c','before',sample(120,{epoch:'restored',mapId:2}));
 f.at(5);f.journal.sample('c','after',sample(130,{world:'other',epoch:'restored',mapId:2}));
 const m=f.summary();assert.deepEqual(m.gameProgress.map(p=>p.tickDelta),[0,null,null,null,null]);
 assert.deepEqual(m.gameProgress.map(p=>p.unknownReason),[null,'epoch changed','tick regressed','map changed','world changed']);
});

test('pre-observer failures skip dispatch; thrown execution retains post-observer timing and receipt authority',async()=>{
 const f=fixture();let executed=0;
 const pre=new ToolServer('test',[],{act:'input'},async()=>{executed++;return result('accepted');},undefined,{
  before:async()=>{f.at(5);throw Error('before failed');},after:async()=>{}},f.journal);
 const before:any=await pre.handle(call());assert.equal(before.result.isError,true);assert.equal(executed,0);
 assert.equal(f.summary().spans.some(s=>s.kind==='tool_dispatch'),false);
 const g=fixture();let after=0;
 const failed=new ToolServer('test',[],{act:'input'},async()=>{g.at(3);throw Error('dispatch uncertain');},undefined,{
  before:async()=>{},after:async()=>{after++;g.at(8);}},g.journal);
 const r:any=await failed.handle(call());assert.match(r.result.content[0].text,/dispatch uncertain/);assert.equal(after,1);
 assert.equal(g.summary().spans.find(s=>s.kind==='tool_dispatch')!.outcome,'error');
 assert.equal(g.summary().clocks[0]!.byKind.observer_after.unionMs,5);
 const h=fixture(),accepted=result({ok:true,receipt:'native accepted'});
 const post=new ToolServer('test',[],{act:'input'},async()=>accepted,undefined,{
  before:async()=>{},after:async()=>{h.at(7);throw Error('after failed');}},h.journal);
 const response:any=await post.handle(call());assert.equal(response.result.content[0].text,accepted.content[0]!.type==='text'?accepted.content[0]!.text:'');
 assert.equal(h.summary().spans.find(s=>s.kind==='observer_after')!.outcome,'error');assert.equal(post.done,true);
});

test('unknown and post-done calls are timed without dispatch; hidden timing never enters UI replies',async()=>{
 const f=fixture();let executed=0;
 const server=new ToolServer('test',[],{report_done:'done'},async()=>{executed++;return result('done');},undefined,undefined,f.journal);
 await server.handle(call(''));await server.handle(call('   '));await server.handle(call('bogus'));await server.handle(call('report_done'));await server.handle(call('report_done'));
 assert.equal(executed,1);assert.equal(f.summary().spans.filter(s=>s.kind==='tool_call').length,5);assert.equal(f.summary().spans.filter(s=>s.kind==='tool_dispatch').length,1);
 const dir=mkdtempSync(join(tmpdir(),'timing-ui-'));
 try{
  const log=join(dir,'calls.jsonl');const ui=new UiMcp(async()=>({image:'pixels',mimeType:'image/png'}),log,{
   before:async()=>sample(1),after:async()=>sample(2)});
  const r:any=await ui.handle(call('screenshot'));assert.deepEqual(r.result.content,[{type:'image',data:'pixels',mimeType:'image/png'}]);
  const m=timingFromEvents(readFileSync(log+'.timing.jsonl','utf8'));assert.equal(m.gameProgress[0]!.tickDelta,1);
  const calls=readFileSync(log,'utf8').trim().split('\n').map(l=>JSON.parse(l));assert.equal(calls[0].id,m.spans[0]!.callId);
  assert.equal(calls[1].response.content[0].data,'pixels');assert(calls[1].durationMs>=0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('timing write failure is retained in call journal without replacing native results or observer behavior',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'timing-fail-'));let after=0;
 try{
  const journal=new TimingJournal(()=>{throw Error('diagnostic disk failure');},'failed-sink');
  const server=new ToolServer('test',[],{act:'input'},async()=>result('accepted'),join(dir,'calls'),{
   before:async()=>{},after:async()=>{after++;}},journal);
  const r:any=await server.handle(call());assert.equal(r.result.content[0].text,'accepted');assert.equal(r.result.isError,undefined);
  await server.handle(call());assert.equal(after,2);assert.equal(server.done,false);
  const rows=readFileSync(join(dir,'calls'),'utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(e=>e.event==='completed');
  assert(rows.every(r=>r.timingFailure.includes('diagnostic disk failure')&&r.ok));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('asynchronous diagnostic sinks are rejected without unhandled promise rejection',async()=>{
 const sink=(async()=>{throw Error('async sink rejected');}) as unknown as (event:TimingEvent)=>undefined;
 const journal=new TimingJournal(sink,'invalid-async-sink');
 assert.throws(()=>journal.begin({kind:'model_call'}),/synchronously/);
 await new Promise<void>(resolve=>setImmediate(resolve));
 const m=timingFromEvents('',[{callId:'failed-call',reason:'sink failure'}]);
 assert.equal(m.status,'partial');assert.equal(m.writeFailures.length,1);
});
