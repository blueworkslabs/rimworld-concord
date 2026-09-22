import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {interpretationSuite,requestContract} from '../trials/interpretation-cases.js';
import {runInterpretation} from '../trials/run-interpretation.js';
import {ClaudeDecisionBackend,CLAUDE_MODEL} from '../src/claude-decision.js';
test('matched interpretation stages differ only in received speech initially, later only validated outlook',()=>{
 const suite=interpretationSuite();assert.equal(suite.cases.length,6);assert.equal(suite.maxAttempts,12);
 const stripped=suite.cases.map(c=>{const v=structuredClone(c.reflection);delete v.character.messages;return v;});
 for(const v of stripped)assert.deepEqual(v,stripped[0]);
 for(const c of suite.cases){assert.deepEqual(c.later,suite.cases[0]!.later);assert.equal(c.later.character.messages,undefined);assert.equal(c.later.character.outlook,undefined);assert.equal(c.reflection.proposals.length,0);assert.deepEqual(c.reflectionRequest,requestContract('reflection',c.reflection));assert(!c.reflectionRequest.prompt.includes(c.id));}
});
test('interpretation suite is checked before backend creation; failure retains attempt and prohibits replay',async()=>{
 const root=mkdtempSync(tmpdir()+'/interpretation-fail-'),file=root+'/suite.json',out=root+'/run';
 const suite=interpretationSuite();let created=0,closed=false;
 writeFileSync(file,JSON.stringify({...suite,maxAttempts:13}));await assert.rejects(runInterpretation(file,out,()=>{created++;throw Error('not called');}),/Frozen/);assert.equal(created,0);assert(!existsSync(out));
 writeFileSync(file,JSON.stringify(suite));
 const backend:any={rawResponses:[],receipts:[],failures:[],close(){closed=true;},summary:()=>({attempts:1}),async reflect(){const receipt=JSON.parse(readFileSync(out+'/receipt.json','utf8'));assert.equal(receipt.attempts,1);assert.equal(receipt.results[0].status,'started');assert(receipt.results[0].request.prompt);throw Error('No retry');}};
 const r=await runInterpretation(file,out,()=>backend);assert.equal(r.attempts,1);assert.equal(r.results[0].status,'failed');assert(closed);await assert.rejects(runInterpretation(file,out,()=>backend),/EEXIST/);
});
test('mock native two-stage run retains attribution, records exact prompts and enforces persistent 12-call cap',async()=>{
 const root=mkdtempSync(tmpdir()+'/interpretation-provider-'),file=root+'/suite.json',out=root+'/run',binary=root+'/fake-claude',capture=root+'/prompts.jsonl';
 writeFileSync(file,JSON.stringify(interpretationSuite()));
 const init={type:'system',subtype:'init',model:CLAUDE_MODEL,tools:[],mcp_servers:[],plugins:[],skills:[],slash_commands:[]};
 const raw={type:'result',subtype:'success',is_error:false,total_cost_usd:.001,num_turns:1,modelUsage:{[CLAUDE_MODEL]:{}}};
 const script=`#!/usr/bin/env node
if(process.argv.includes('auth')){console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'max'}));process.exit(0);}
let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
 const p=JSON.parse(input);require('node:fs').appendFileSync(${JSON.stringify(capture)},JSON.stringify(p)+'\\n');
 const m=p.perspective.character.messages?.[0];
 const structured_output=p.task==='reflection'?{reflection:m?{choice:'revise_private_outlook',reason:'I may respect the request',update:{expectedRevision:0,notes:[{kind:'stance',subject:m.from,text:'B asked to finish it. I may leave it for B.',messageIds:[m.id]}]}}:{choice:'keep_current_activity',reason:'No change'}}:{decision:{kind:p.perspective.character.outlook?'refuse':'accept',reason:'Scripted diagnostic choice'}};
 console.log(JSON.stringify(${JSON.stringify(init)}));console.log(JSON.stringify({...${JSON.stringify(raw)},structured_output}));
});
`;
 writeFileSync(binary,script,{mode:0o700});
 const options={ledgerPath:out+'/allowance.db',scratchRoot:out+'/scratch',trial:'interpretation-v1' as const,binary};
 const receipt=await runInterpretation(file,out,()=>new ClaudeDecisionBackend(options));assert.equal(receipt.attempts,12);assert(receipt.results.every((r:any)=>r.status==='completed'));
 const sent=readFileSync(capture,'utf8').trim().split('\n').map(s=>JSON.parse(s));assert.equal(sent.length,12);
 receipt.results.forEach((r:any,i:number)=>assert.deepEqual(sent[i],JSON.parse(r.request.prompt)));
 for(const row of receipt.results.filter((r:any)=>r.mode==='decision')){assert.equal(row.view.character.messages,undefined);if(row.condition==='message'){assert.equal(row.result.kind,'refuse');assert.equal(row.view.character.outlook.notes[0].messages[0].from,'B');assert.deepEqual(row.view.character.outlook.notes[0].evidence,[]);}else{assert.equal(row.result.kind,'accept');assert.equal(row.view.character.outlook,undefined);}}
 const reopened=new ClaudeDecisionBackend(options);try{await assert.rejects(reopened.decide(interpretationSuite().cases[0]!.later,new AbortController().signal));assert.equal(reopened.summary().attempts,12);}finally{reopened.close();}
});
