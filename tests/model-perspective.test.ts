import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelPerspective,modelPrompt,pawnInstructions} from '../src/model-perspective.js';
import {contractCases} from '../src/contract-cases.js';
import {perspectiveCases,preparedPerspectiveCases,checkPerspectiveResult} from '../trials/perspective-cases.js';
import {decisionTrials} from '../src/decision-trials.js';
import {JevAppraiser,TrialBudget} from '../src/appraisal.js';

test('native need fill is explicit, unknown is not zero and input remains unchanged',()=>{
 const v=contractCases()[0]!.view;v.pawn.facts=[{key:'need',value:'Food',level:0},{key:'need',value:'Rest',level:.9},{key:'trait',value:'Kind',level:1}];
 const before=structuredClone(v),mapped=modelPerspective(v);
 assert.deepEqual(v,before);assert.equal(mapped.pawn.needs[0]!.fractionFilled,0);assert.equal(mapped.pawn.needs[0]!.known,true);
 assert.equal(mapped.pawn.needs[1]!.percentFilled,90);assert.match(mapped.pawn.needs[1]!.meaning,/LESS tiredness/);
 assert.equal(mapped.pawn.needs[2]!.known,false);assert.equal(mapped.pawn.needs[2]!.fractionFilled,null);
 assert.deepEqual(mapped.pawn.facts,[{key:'trait',value:'Kind',level:1}]);
 for(const level of [NaN,Infinity,-1,2]){v.pawn.facts=[{key:'need',value:'Food',level}];assert.equal(modelPerspective(v).pawn.needs[0]!.known,false);}
 v.pawn.facts=[{key:'need',value:'Food',level:.1},{key:'need',value:'Food',level:.9}];assert.equal(modelPerspective(v).pawn.needs[0]!.unknownReason,'conflicting observations');
});
test('irrelevant action rules are absent while replacement and private update effects stay explicit',()=>{
 const quiet=contractCases()[0]!.view;const p=modelPrompt('reflection',quiet);
 assert(!('haul' in p.contracts));assert(!('rescue' in p.contracts));assert(pawnInstructions.length<1000);
 const offered=contractCases()[3]!.view;const proposal={...offered.proposals[0]!,replacesAgreementId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'};
 const decision=modelPrompt('decision',{pawn:offered.pawn,character:offered.character,proposal});
 assert.match(JSON.stringify(decision.executableChoices),/confirmed cancellation/);assert.match(JSON.stringify(decision.executableChoices),/fresh consent/);
 const reflection=modelPrompt('reflection',offered);assert.match(JSON.stringify(reflection.executableChoices),/whole notes array/);
 assert.deepEqual(reflection.perspective.character,offered.character);
});
test('appraisal and deliberation receive the same need meanings without borrowing another perspective',async()=>{
 const budget=new TrialBudget(':memory:');const v=contractCases()[1]!.view;
 let state:any;const a=new JevAppraiser(async(body:any)=>{state=JSON.parse(body.state);return {model:'typesafe/jev-1.13',answers:{reflect:{type:'noul',noul:.2}},usage:{cost:.00001}};},budget);
 try{const r=await a.assess({...v,event:v.events[0]!},new AbortController().signal);assert.equal(r.route,'native');assert.deepEqual(state.pawn,modelPerspective(v).pawn);}finally{budget.close();}
});
test('broader fixed cases repeat exactly, omit rubrics from prompts and retain valid refusal/no-change',()=>{
 const cases=perspectiveCases();assert.equal(cases.length,12);
 for(let i=0;i<6;i++)assert.deepEqual(cases[i]!.view,cases[i+6]!.view);
 for(const c of preparedPerspectiveCases()){
  assert(!c.prompt.includes(c.rubric));assert.deepEqual(JSON.parse(c.prompt),modelPrompt('reflection',c.view));
  assert.equal(checkPerspectiveResult(c.id,{reflection:{choice:'keep_current_activity',reason:'No change'}}).choice,'keep_current_activity');
  if(c.view.proposals.length)assert.doesNotThrow(()=>checkPerspectiveResult(c.id,{reflection:{choice:'answer_pending_proposal',proposalId:c.view.proposals[0]!.id,decision:{kind:'refuse',reason:'I decline'}}}));
 }
});
test('trial table preserves every historical policy and adds a distinct twelve-call evaluation',()=>{
 for(const [name,p] of Object.entries(decisionTrials)){
  const calls=name==='campfire-core-v1'?8:name==='legacy'?3:['core-followup-pawns-v1','core-pawns-v1','core-events-pawns-v1'].includes(name)?5:['core-followup-core-v1','core-events-planner-v1','core-planner-v1','reliability-v1','needs-v1','social-v1','retention-game-v1','retention-names-v1','retention-indirect-v1'].includes(name)?4:['campfire-pawns-v1','integration-v1','work-v1','observer-v1','paced-v1','perspective-v1','outlook-check-v1','speech-check-v1','interpretation-v1'].includes(name)?12:6;
  assert.equal(p.calls,calls);assert.equal(p.reservedEquivalentUSD,Number((calls*.1).toFixed(2)));assert.equal(p.policy,name==='legacy'?'legacy':'claude-'+name);
 }
});

test('offline evaluation persists consumption before failure and cannot replay the batch',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {runPerspectiveClaude}=await import('../trials/run-perspective-claude.js');
 const root=mkdtempSync(join(tmpdir(),'concord-semantic-'));const file=join(root,'cases.json'),output=join(root,'run');
 writeFileSync(file,JSON.stringify({version:'concord-perspective-v1',authored:true,cases:preparedPerspectiveCases()}));
 let calls=0,closed=false;
 const fake:any={receipts:[],rawResponses:[],failures:[],reflect:async()=>{calls++;const receipt=JSON.parse(readFileSync(join(output,'receipt.json'),'utf8'));assert.equal(receipt.attempts,1);assert.equal(receipt.results[0].status,'started');throw Error('simulated failure');},summary:()=>({attempts:1}),close:()=>{closed=true;}};
 try{
  const r=await runPerspectiveClaude(file,output,()=>fake);assert.equal(calls,1);assert.equal(r.results[0].status,'failed');assert.equal(r.results[0].response,null);assert(closed);
  await assert.rejects(runPerspectiveClaude(file,output,()=>fake),/EEXIST/);assert.equal(calls,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
