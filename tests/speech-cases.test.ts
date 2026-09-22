import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {preparedSpeechCases,speechCases,checkSpeechResult,bankVersion} from '../trials/speech-cases.js';
import {runSpeechClaude} from '../trials/run-speech-claude.js';
import {modelPrompt} from '../src/model-perspective.js';
import {ClaudeDecisionBackend,CLAUDE_MODEL} from '../src/claude-decision.js';
test('speech contrasts vary only correspondence; rubrics stay out of prompts, not new truth/consent',()=>{
 const cases=preparedSpeechCases();assert.equal(cases.length,12);
 const strip=(v:typeof cases[number]['view'])=>{const copy=structuredClone(v);delete copy.character.messages;return copy;};
 for(let i=0;i<cases.length;i++){
  const c=cases[i]!;assert.deepEqual(strip(c.view),strip(cases[0]!.view));
  if(i<6)assert.deepEqual(c.view,cases[i+6]!.view);
  assert.deepEqual(JSON.parse(c.prompt),modelPrompt('reflection',c.view));assert(!c.prompt.includes(c.rubric));
  assert.equal(c.view.proposals[0]!.status,'pending');assert.equal(c.view.character.intention,undefined);
  assert.equal(c.view.character.outlook,undefined);assert(!('otherPawns' in c.view));
  for(const m of c.view.character.messages??[]){assert.equal(m.from,'B');assert.equal(m.to,'A');assert(m.tick<40);}
  assert.equal(checkSpeechResult(c.id,{reflection:{choice:'keep_current_activity',reason:'Unchanged'}}).choice,'keep_current_activity');
  for(const kind of ['refuse','accept'])assert.doesNotThrow(()=>checkSpeechResult(c.id,{reflection:{choice:'answer_pending_proposal',proposalId:c.view.proposals[0]!.id,decision:{kind,reason:'My independent choice'}}}));
 }
 assert.equal(speechCases().find(c=>c.caseId==='corrected-report')!.view.character.messages!.length,2);
 assert.throws(()=>checkSpeechResult(cases[0]!.id,{reflection:{choice:'answer_pending_proposal',proposalId:'wrong',decision:{kind:'accept',reason:'Claimed'}}}));
});
test('speech bank is frozen before backend creation, failures preserve consumed attempt; no replay',async()=>{
 const root=mkdtempSync(tmpdir()+'/speech-run-'),file=root+'/cases.json',out=root+'/run';
 const suite={version:bankVersion,authored:true,cases:preparedSpeechCases()};const bad=structuredClone(suite);bad.cases[1]!.view.character.messages![0]!.text='Changed';
 writeFileSync(file,JSON.stringify(bad));let created=0,calls=0,closed=false;
 const backend:any={receipts:[],rawResponses:[],failures:[],requestSizes:[],close(){closed=true;},summary:()=>({attempts:calls}),async reflect(){calls++;const r=JSON.parse(readFileSync(out+'/receipt.json','utf8'));assert.equal(r.attempts,1);assert.equal(r.results[0].status,'started');throw Error('Retained failure');}};
 await assert.rejects(runSpeechClaude(file,out,()=>{created++;return backend;}),/Frozen/);assert.equal(created,0);
 writeFileSync(file,JSON.stringify(suite));const result=await runSpeechClaude(file,out,()=>backend);assert.equal(calls,1);assert(closed);assert.equal(result.results[0].status,'failed');
 await assert.rejects(runSpeechClaude(file,out,()=>backend),/EEXIST/);assert.equal(calls,1);
});
test('mock native speech-check batch sends all frozen prompts and keeps twelve-call cap after reopening',async()=>{
 const root=mkdtempSync(tmpdir()+'/speech-provider-'),file=root+'/cases.json',binary=root+'/fake-claude',capture=root+'/prompts.jsonl',out=root+'/run';
 const cases=preparedSpeechCases();writeFileSync(file,JSON.stringify({version:bankVersion,authored:true,cases}));
 const init={type:'system',subtype:'init',model:CLAUDE_MODEL,tools:[],mcp_servers:[],plugins:[],skills:[],slash_commands:[]};
 const raw={type:'result',subtype:'success',is_error:false,total_cost_usd:.001,num_turns:1,modelUsage:{[CLAUDE_MODEL]:{}},structured_output:{reflection:{choice:'keep_current_activity',reason:'Mock no change'}}};
 writeFileSync(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\nlet input="";process.stdin.on("data",c=>input+=c);process.stdin.on("end",()=>{require("node:fs").appendFileSync('+JSON.stringify(capture)+',JSON.stringify(JSON.parse(input))+"\\n");console.log('+JSON.stringify(JSON.stringify(init))+');console.log('+JSON.stringify(JSON.stringify(raw))+');});\n',{mode:0o700});
 const options={ledgerPath:out+'/allowance.db',scratchRoot:out+'/scratch',trial:'speech-check-v1' as const,binary};
 const r=await runSpeechClaude(file,out,()=>new ClaudeDecisionBackend(options));
 assert.equal(r.attempts,12);assert(r.finished);assert(r.results.every((row:any)=>row.status==='completed'));
 const sent=readFileSync(capture,'utf8').trim().split('\n').map(s=>JSON.parse(s));assert.equal(sent.length,12);
 sent.forEach((p,i)=>assert.deepEqual(p,JSON.parse(cases[i]!.prompt)));
 const reopened=new ClaudeDecisionBackend(options);try{await assert.rejects(reopened.reflect(cases[0]!.view,new AbortController().signal));assert.equal(reopened.summary().attempts,12);}finally{reopened.close();}
});
test('cold-reader exporter contains only retained public log and neutral questions, no answer key or private context',()=>{
 const exported=JSON.parse(execFileSync(process.execPath,['scripts/export-log-reader.mjs'],{encoding:'utf8'}));
 const fixture=JSON.parse(readFileSync('trials/fixtures/social-public-log.json','utf8'));
 assert.equal(exported.cases.length,1);assert.equal(fixture.source.synthetic,false);
 const prompt=JSON.parse(exported.cases[0].prompt);assert.deepEqual(prompt.log,fixture.log);
 assert.deepEqual(Object.keys(prompt).sort(),['log','questions']);assert.deepEqual(Object.keys(prompt.log).sort(),['agreements','entries']);
 for(const e of prompt.log.entries)assert.deepEqual(Object.keys(e).sort(),['actor','key','kind','recipient','seq','subject','text','tick']);
 assert(!exported.cases[0].prompt.includes(fixture.source.receiptSha256));
});
