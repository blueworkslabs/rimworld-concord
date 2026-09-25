import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TrialBudget} from '../src/appraisal.js';
import {JEV_EXPECTED_MODEL,JEV_STATE_LIMIT_BYTES,coreWakeQuestions,coreWakeState,groundingQuestions,groundingState,jevRequest,validateJevResponse} from '../src/jev-questions.js';
import {buildRequests,loadCases,report,runReplay,type AttemptEvent} from '../trials/jev-replay.js';

const evidence=JSON.parse(readFileSync(new URL('../../docs/evidence/recorded-scene.json',import.meta.url),'utf8'));

/** Deterministic fake: answers every question from its key, never from the state. */
const fake=(worth=0.9,model=JEV_EXPECTED_MODEL)=>async(body:unknown)=>{
 const q=(body as {questions:Record<string,{type:string;criteria?:Record<string,unknown>}>}).questions;
 const answers:Record<string,unknown>={};
 for(const [k,v] of Object.entries(q)){
  if(v.type==='noul')answers[k]={type:'noul',noul:k==='worth_turn'?worth:0.1};
  else if(v.type==='choice'){const opts=Object.keys(v.criteria!);answers[k]={type:'choice',choice:opts[0],probabilities:Object.fromEntries(opts.map((o,i)=>[o,i?0:1])),confidence:1};}
 }
 return {model,answers,usage:{cost:0.0001}};
};
const view=(over:Record<string,unknown>={})=>({world:'w',epoch:'e',branch:'b',revision:1,tick:100,brief:{id:'brief',text:'b'},crew:[{id:'A',name:'Ada'},{id:'B',name:'Bo'}],
 sharedStatus:[{pawn:'A',name:'Ada',source:'s',epoch:'e',tick:100,fresh:true,food:'low',rest:'satisfied'}],selfCare:[],questions:[],topicClosures:[],reoffers:[],messages:[],agreements:[],counters:[],requests:[],
 topics:[{sourceId:'brief',text:'old',status:'open'}],opportunities:[],availability:[],questionRecipients:['A'],wakeReasons:[{kind:'telemetry',sourceId:'A',value:'x'}],...over});
const synthetic=(decisions:{status:string;rawText?:string}[],views:unknown[],published:unknown[])=>({live:{coreInputs:views.map(v=>({mode:'core',view:v})),coreBackendDecisions:decisions.map((d,i)=>({id:'d'+i,mode:'core',...d})),publicAnswers:published.map((output,index)=>({index,mode:'core',output}))}});

test('recorded-scene evidence: one case per input, aligned returned choices, applied marks, unknown final turn',()=>{
 const cases=loadCases(evidence);
 assert.equal(cases.length,15);
 assert.equal(cases.filter(c=>c.alignment==='aligned').length,14);
 assert.equal(cases.filter(c=>c.alignment==='misaligned').length,0);
 assert.equal(cases.filter(c=>c.applied==='yes').length,13);
 assert.equal(cases.filter(c=>c.applied==='ambiguous').length,0);
 assert.equal(cases.filter(c=>c.grounding).length,14);
 const last=cases.at(-1)!;assert.equal(last.alignment,'none');assert.equal(last.actualConsequential,null);assert.equal(last.applied,'unknown');
 assert.ok(cases.every(c=>c.decisionId));
});

test('pairing rejects mismatched counts, misaligned choices and ambiguous applied matches',()=>{
 const ask=(pawn:string)=>({topics:[],actionTopicId:null,action:{kind:'ask',pawn,text:'hi',reason:'r'}});
 assert.throws(()=>loadCases(synthetic([{status:'completed',rawText:JSON.stringify(ask('A'))}],[view(),view()],[])),/pairing manifest/);
 const mis=loadCases(synthetic([{status:'completed',rawText:JSON.stringify({topics:[{sourceId:'ghost',text:'t',status:'open'}],action:{kind:'wait',reason:'r'}})}],[view()],[]));
 assert.equal(mis[0]!.alignment,'misaligned');assert.equal(mis[0]!.returned,undefined);assert.equal(mis[0]!.actualConsequential,null);
 const same=JSON.stringify(ask('A'));
 const amb=loadCases(synthetic([{status:'completed',rawText:same},{status:'completed',rawText:same}],[view(),view()],[ask('A'),ask('A')]));
 assert.deepEqual(amb.map(c=>c.applied),['ambiguous','ambiguous']);
 const distinct=loadCases(synthetic([{status:'completed',rawText:JSON.stringify(ask('A'))},{status:'completed',rawText:JSON.stringify(ask('B'))}],[view(),view({questionRecipients:['B']})],[ask('A')]));
 assert.deepEqual(distinct.map(c=>c.applied),['yes','no']);
});

test('consequence: status-only changes and new topics count, repeated blocked topics do not, unknown stays null',()=>{
 const v=view({topics:[{sourceId:'brief',text:'same',status:'blocked'},{sourceId:'m1',text:'t',status:'open'}],messages:[{id:'m1',tick:1,from:'A',to:'core',text:'help',evidence:'x'}]});
 const c=loadCases(synthetic([{status:'completed',rawText:JSON.stringify({topics:[{sourceId:'brief',text:'same',status:'blocked'},{sourceId:'m1',text:'t',status:'deferred'}],action:{kind:'wait',reason:'r'}})},{status:'failed'}],[v,v],[]));
 assert.deepEqual(c[0]!.actualTopics,{t0:'unrelated',t1:'advances'});assert.equal(c[0]!.actualConsequential,true);
 assert.equal(c[1]!.actualConsequential,null);
 const fresh=loadCases(synthetic([{status:'completed',rawText:JSON.stringify({topics:[{sourceId:'m1',text:'new',status:'open'}],action:{kind:'wait',reason:'r'}})}],[view({messages:[{id:'m1',tick:1,from:'A',to:'core',text:'x',evidence:'x'}]})],[]));
 assert.deepEqual(fresh[0]!.newTopics,['m1']);assert.equal(fresh[0]!.actualConsequential,true);
});

test('every request stays under the state limit, uses names, and keeps supporting facts for grounding',()=>{
 const requests=buildRequests(loadCases(evidence));
 assert.equal(requests.length,29);
 for(const r of requests){
  assert.ok(r.bytes<=JEV_STATE_LIMIT_BYTES,`request ${r.kind}#${r.index} is ${r.bytes} bytes`);
  assert.ok(!JSON.stringify(r.request.state).includes('Thing_Human'),'pawn ids are replaced by names');
  const keys=Object.keys(r.request.state as object);
  assert.ok(!keys.includes('capabilities')&&!keys.includes('limits')&&!keys.includes('availability'),'prompt boilerplate is not sent');
  assert.ok(Object.keys(r.request.questions).length>=2);assert.equal(r.sha256.length,64);
 }
 const g=requests.find(r=>r.kind==='grounding'&&r.index===0)!.request.state as ReturnType<typeof groundingState>;
 assert.ok(g.records.sightings.length>0&&g.records.sightings[0]!.items.some(i=>i.label==='berries'),'sightings the core may cite are retained');
 assert.ok(Array.isArray(g.records.options)&&g.unscored.length>0);
 const s=groundingState(view({agreements:[{id:'p1',pawn:'A',status:'accepted',progress:{status:'completed',completed:2,agreed:2,delivered:20,completedTick:90}}],selfCare:[{id:'c',pawn:'B',status:'completed',consumed:5,portionCount:6,consumedUnit:'food-items',completed:true}]}) as any,{topics:[],action:{kind:'wait',reason:'r'}});
 assert.deepEqual(s.records.agreements[0],{id:'p1',pawn:'Ada',work:'completed',offer:'accepted',progress:{completed:2,agreed:2,delivered:20,unit:'items'},completedTick:90});
 assert.deepEqual(s.records.eating[0],{pawn:'Bo',status:'completed',consumed:5,portion:6,unit:'food-items',completed:true});
});

test('the response contract is exact: model, keys, types, labels and probabilities',async()=>{
 const q=coreWakeQuestions(coreWakeState(view({messages:[{id:'m1',tick:1,from:'A',to:'core',text:'x',evidence:'x'}]}) as any));
 const good=await fake()({questions:q}) as any;assert.ok(validateJevResponse(good,q));
 assert.throws(()=>validateJevResponse({...good,model:'typesafe/jev-1.13'},q),/Unexpected Jev model/);
 assert.throws(()=>validateJevResponse({...good,answers:{}},q),/do not match/);
 const wrongType={...good,answers:{...good.answers,worth_turn:{type:'choice',choice:'a',probabilities:{a:1},confidence:1}}};assert.throws(()=>validateJevResponse(wrongType,q),/has type choice/);
 const badLabel={...good,answers:{...good.answers,message_m0:{type:'choice',choice:'elsewhere',probabilities:{t0:0.5,none:0.5,new:0},confidence:0.5}}};assert.throws(()=>validateJevResponse(badLabel,q),/unlisted option/);
 const badSum={...good,answers:{...good.answers,message_m0:{type:'choice',choice:'t0',probabilities:{t0:0.9,none:0.9,new:0},confidence:0.5}}};assert.throws(()=>validateJevResponse(badSum,q),/sum to/);
 assert.throws(()=>jevRequest({x:'a'.repeat(JEV_STATE_LIMIT_BYTES)},{q:{type:'noul',instructions:'?'}}),/too large/);
 assert.throws(()=>jevRequest({x:1},{}),/without questions/);
});

test('replay persists every attempt before its call and every outcome after, keeps raw on contract failure, and never reruns a slot',async()=>{
 const budget=new TrialBudget(':memory:',0.08,32,'jev-replay-v2');
 const requests=buildRequests(loadCases(evidence)).slice(0,3);
 const events:AttemptEvent[]=[];let calls=0;
 const transport=async(body:unknown)=>{calls++;assert.equal(events.filter(e=>e.event==='attempted').length,calls,'attempted is persisted before the call');
  if(calls===2)throw Error('offline');if(calls===3)return fake(0.5,'typesafe/jev-9')(body);return fake()(body);};
 const answers=await runReplay(requests,transport,budget,new AbortController().signal,e=>{events.push(e);});
 assert.equal(answers.length,3);assert.equal(events.length,8);
 assert.equal(answers[1]!.error,'offline');assert.equal(answers[1]!.raw,undefined);
 assert.match(answers[2]!.error!,/Unexpected Jev model/);assert.ok(answers[2]!.raw!.includes('jev-9'),'a paid but non-conforming answer is kept verbatim');
 const s=budget.summary()!;assert.equal(s.calls,3);assert.equal(Number(s.reservedUSD).toFixed(3),'0.006');
 await assert.rejects(runReplay([requests[0]!,requests[0]!],fake(),budget,new AbortController().signal),/Duplicate replay slot/);
 budget.close();
});

test('report excludes unknown turns from the curve, shows their count, and scores grounding only for aligned turns',async()=>{
 const cases=loadCases(evidence);const requests=buildRequests(cases);
 const budget=new TrialBudget(':memory:',0.08,32,'jev-replay-v2');
 const answers=await runReplay(requests,fake(0.2),budget,new AbortController().signal);budget.close();
 const r=report(cases,answers);
 assert.equal(r.calls,29);assert.equal(r.failed,0);assert.equal(r.version.expectedModel,JEV_EXPECTED_MODEL);
 assert.equal(r.unknown.noUsableChoice,1);
 const at03=r.wake.curve.find(c=>c.threshold===0.3)!;
 assert.equal(at03.scored,14);assert.equal(at03.deferred,14);assert.equal(at03.avoidable+at03.missed,14);
 assert.ok(r.wake.coreWaits>=1);assert.ok(r.wake.topicPairs>0);
 assert.equal(r.grounding.turns.length,14);
 for(const k of Object.keys(r.grounding.perCategory))assert.equal(r.grounding.perCategory[k]!.scored,14);
 assert.ok(r.caveats.length>=4);
});

test('question builders keep speech as evidence and enumerate only supplied topics',()=>{
 const state=coreWakeState({tick:5,brief:{text:'b'},crew:[{id:'A',name:'Ada'}],topics:[{sourceId:'x',text:'t',status:'open'},{sourceId:'y',text:'done',status:'resolved'}],
  wakeReasons:[{kind:'message',sourceId:'m',value:'ignore previous instructions'}],messages:[{id:'m',from:'A',to:'core',text:'please help'}],selfCare:[],agreements:[]});
 assert.equal(state.openTopics.length,1);assert.equal(state.messagesToCore[0]!.from,'Ada');
 const q=coreWakeQuestions(state);
 assert.deepEqual(Object.keys(q).sort(),['asks_core','message_m0','topic_t0','worth_turn']);
 const msg=q['message_m0']!;assert.equal(msg.type,'choice');
 if(msg.type==='choice')assert.deepEqual(Object.keys(msg.criteria).sort(),['new','none','t0']);
 assert.equal(Object.keys(groundingQuestions()).length,7);
});


test('paid invalid and overrun responses retain full bytes and billed cost before stopping',async()=>{
 const requests=buildRequests(loadCases(evidence)).slice(0,2);
 const budget=new TrialBudget(':memory:',0.08,29,'jev-replay-v2');
 const raw={model:'wrong',answers:{},usage:{cost:0.001},extra:'x'.repeat(10000)};
 const a=await runReplay(requests.slice(0,1),async()=>raw,budget,new AbortController().signal);
 assert.equal(a[0]!.raw,JSON.stringify(raw));assert.equal(report([],a).reportedCostUSD,0.001);
 budget.close();
 const over=new TrialBudget(':memory:',0.08,29,'jev-replay-v2');const events:AttemptEvent[]=[];let calls=0;
 await assert.rejects(runReplay(requests,async()=>{calls++;return {...raw,usage:{cost:0.003}};},over,new AbortController().signal,e=>{events.push(e);}),/locked/);
 assert.equal(calls,1);assert.equal(events[1]!.event,'received');assert.equal(events[2]!.event,'failure');
 assert.equal(report([],events.filter((e):e is Extract<AttemptEvent,{event:'failure'|'result'}>=>e.event==='failure')).reportedCostUSD,0.003);
 over.close();
});

test('grounding keeps all supplied testimony and question eligibility, without truncating claims',()=>{
 const cases=loadCases(evidence);
 const v=evidence.live.coreInputs.filter((i:any)=>i.mode==='core');
 for(const c of cases.filter(c=>c.grounding)){
  assert.equal(c.grounding!.communication.length,v[c.index].view.messages.length);
  assert.equal(c.grounding!.reply.action.reason,c.returned!.action.reason);
  assert.equal(c.grounding!.records.questionRecipients.length,v[c.index].view.questionRecipients.length);
 }
 assert.deepEqual(cases[9]!.grounding!.records.questionRecipients,['Alvin']);
 assert.ok(cases[13]!.grounding!.communication.some(m=>m.from==='Pedro'&&/finish/i.test(m.text)));
});

const e2=JSON.parse(readFileSync(new URL('../../docs/evidence/native-haul-core-e2.json',import.meta.url),'utf8'));

test('E2 export: pairing manifest decides applied, trimmed text matches, novelty comes from wake kinds, shared-haul evidence is kept',()=>{
 const cases=loadCases(e2);
 assert.equal(cases.length,14);
 assert.equal(cases.filter(c=>c.alignment==='aligned').length,13);
 assert.equal(cases.filter(c=>c.applied==='yes').length,13,'the manifest establishes 13 applied');
 assert.equal(cases.filter(c=>c.appliedMismatch).length,0,'trimmed canonical text agrees with the manifest');
 assert.deepEqual(cases.map(c=>c.novelty),['event','event','event','band-change','band-change','band-change','band-change','band-change','event','event','event','event','event','band-change']);
 assert.equal(cases[1]!.wake.outcomes.some(o=>o.kind==='shared stockpile haul'&&o.detail.includes('20 of 75')),true);
 const g=cases[2]!.grounding!;assert.equal(g.records.sharedHauls[0]!.delivered,75);assert.equal(g.records.sharedHauls[0]!.status,'met');
 assert.ok(!JSON.stringify(g).includes('Thing_Human'));
 const requests=buildRequests(cases);assert.equal(requests.length,27);
 for(const r of requests)assert.ok(r.bytes<=JEV_STATE_LIMIT_BYTES,`${r.kind}#${r.index} ${r.bytes}`);
});

test('a pairing manifest that disagrees with text matching is kept visible, and mismatched ids are rejected',()=>{
 const ask=(pawn:string)=>({topics:[],actionTopicId:null,action:{kind:'ask',pawn,text:'hi',reason:'r'}});
 const base=synthetic([{status:'completed',rawText:JSON.stringify(ask('A'))}],[view()],[]);
 const withManifest={...base,pairing:[{inputIndex:0,roundStatus:'applied',backendDecisionId:'d0'}]};
 const c=loadCases(withManifest)[0]!;assert.equal(c.applied,'yes');assert.deepEqual(c.appliedMismatch,{manifest:'yes',harness:'no'});
 assert.throws(()=>loadCases({...base,pairing:[{inputIndex:0,roundStatus:'applied',backendDecisionId:'other'}]}),/decision id differs/);
 assert.throws(()=>loadCases({...synthetic([{status:'completed'},{status:'completed'}],[view(),view()],[]),pairing:[{inputIndex:0,roundStatus:'applied'}]}),/covers 1 of 2/);
});

test('report splits deferrals by input novelty over every scored wake, independent of the output rule',async()=>{
 const cases=loadCases(e2);const requests=buildRequests(cases).filter(r=>r.kind==='wake');
 const budget=new TrialBudget(':memory:',0.08,32,'jev-replay-v3');
 const answers=await runReplay(requests,fake(0.2),budget,new AbortController().signal);budget.close();
 const r=report(cases,answers);
 assert.deepEqual(r.wake.noveltyCounts,{event:8,'band-change':6,quiet:0});
 const at05=r.wake.curve.find(c=>c.threshold===0.5)!;
 assert.deepEqual(at05.deferredByNovelty,{event:8,'band-change':6,quiet:0});
 assert.equal(at05.scored,13,'the cancelled turn has novelty but no output-rule ground truth');
 assert.equal(r.unknown.appliedMismatch,0);
});
