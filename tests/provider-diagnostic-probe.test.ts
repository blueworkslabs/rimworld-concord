import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {providerDiagnosticSuite} from '../trials/provider-diagnostic-cases.js';
import {runProviderDiagnostic} from '../trials/run-provider-diagnostic.js';
import {ClaudeDecisionBackend,CLAUDE_MODEL} from '../src/claude-decision.js';
test('core probe rejects changed contract before backend, retains failures on predetermined cases and cannot replay',async()=>{
 const root=mkdtempSync(tmpdir()+'/core-probe-fail-'),file=root+'/suite.json',out=root+'/run',s=providerDiagnosticSuite();let created=0,closed=false,recorded:any;
 writeFileSync(file,JSON.stringify({...s,maxAttempts:7}));await assert.rejects(runProviderDiagnostic(file,out,()=>{created++;throw Error();}),/Frozen/);assert.equal(created,0);assert(!existsSync(out));
 writeFileSync(file,JSON.stringify(s));
 const backend:any={receipts:[],rawResponses:[],failures:[],summary:()=>({attempts:0}),close(){closed=true;},async plan(){recorded??=JSON.parse(readFileSync(out+'/receipt.json','utf8'));return {topics:[],actionTopicId:'brief',action:{kind:'wait',reason:'Invalid combination'}};}};
 const r=await runProviderDiagnostic(file,out,()=>backend);assert.equal(r.attempts,4);assert.equal(r.results[0].status,'failed');assert.equal(r.passed,false);assert(closed);assert.equal(recorded.results[0].status,'started');await assert.rejects(runProviderDiagnostic(file,out,()=>backend),/EEXIST/);
});
test('native adapter mock records four exact core requests and persists cap across reopening',async()=>{
 const root=mkdtempSync(tmpdir()+'/core-probe-provider-'),file=root+'/suite.json',out=root+'/run',binary=root+'/fake-claude',capture=root+'/requests.jsonl';const s=providerDiagnosticSuite();
 writeFileSync(file,JSON.stringify(s));
 const init={type:'system',subtype:'init',model:CLAUDE_MODEL,tools:['StructuredOutput'],mcp_servers:[],plugins:[],skills:[],slash_commands:[]};
 const raw={type:'result',subtype:'success',is_error:false,total_cost_usd:.001,num_turns:1,modelUsage:{[CLAUDE_MODEL]:{}}};
 writeFileSync(binary,`#!/usr/bin/env node
if(process.argv.includes('auth')){console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'max'}));process.exit(0);}
let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
const args=process.argv;require('node:fs').appendFileSync(${JSON.stringify(capture)},JSON.stringify({prompt:input,instructions:args[args.indexOf('--system-prompt')+1],schema:JSON.parse(args[args.indexOf('--json-schema')+1])})+'\\n');
console.log(JSON.stringify(${JSON.stringify(init)}));console.log(JSON.stringify({...${JSON.stringify(raw)},structured_output:{core:{topics:[],actionTopicId:null,action:{kind:'wait',reason:'Scripted contract check'}}}}));});`,{mode:0o700});
 const options={ledgerPath:out+'/allowance.db',scratchRoot:out+'/scratch',trial:'provider-diagnostic-v1' as const,binary};
 const r=await runProviderDiagnostic(file,out,()=>new ClaudeDecisionBackend(options));assert.equal(r.passed,true);assert.equal(r.summary.attempts,4);assert.equal(r.results.length,4);
 const sent=readFileSync(capture,'utf8').trim().split('\n').map(l=>JSON.parse(l));assert.equal(sent.length,4);sent.forEach((v,i)=>assert.deepEqual(v,s.cases[i]!.request));
 const reopened=new ClaudeDecisionBackend(options);try{await assert.rejects(reopened.plan(s.cases[0]!.view,new AbortController().signal));assert.equal(reopened.summary().attempts,4);}finally{reopened.close();}
 assert.equal(readFileSync(capture,'utf8').trim().split('\n').length,4);
});

test('provider diagnostic cases preserve both exact saved situations and repeat order',()=>{
 const s=providerDiagnosticSuite();const original=JSON.parse(readFileSync('docs/evidence/food-followthrough.json','utf8')).coreSituations;
 assert.deepEqual(s.cases.map(c=>c.condition),['initial-with-food','final-without-local-food','initial-with-food','final-without-local-food']);
 s.cases.forEach((c,i)=>assert.deepEqual(c.view,original[i%2===0?0:original.length-1]));
 assert.equal(s.maxAttempts,4);assert.equal(s.stopOnPreflightFailure,true);
});

test('provider diagnostic stops on a preflight failure without trying another case',async()=>{
 const root=mkdtempSync(tmpdir()+'/provider-preflight-'),file=root+'/suite.json';writeFileSync(file,JSON.stringify(providerDiagnosticSuite()));let calls=0,closed=false;
 const backend:any={receipts:[],rawResponses:[],failures:[],summary:()=>({attempts:0}),close(){closed=true;},async plan(){calls++;this.failures.push({stage:'authentication',attemptReserved:false,cancelled:false});throw Error('No native login');}};
 const r=await runProviderDiagnostic(file,root+'/run',()=>backend);assert.equal(calls,1);assert.equal(r.results.length,1);assert.equal(r.results[0].status,'failed');assert.equal(r.summary.attempts,0);assert(closed);
});

test('rejected native initialization stops the frozen probe after its first retained attempt',async()=>{
 const root=mkdtempSync(tmpdir()+'/provider-isolation-'),file=root+'/suite.json',binary=root+'/fake',capture=root+'/calls',out=root+'/run';writeFileSync(file,JSON.stringify(providerDiagnosticSuite()));
 const badInit={type:'system',subtype:'init',model:CLAUDE_MODEL,tools:['Bash'],mcp_servers:[],plugins:[],skills:[],slash_commands:[]};
 writeFileSync(binary,`#!/usr/bin/env node
if(process.argv.includes('auth')){console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'max'}));process.exit(0);}
require('node:fs').appendFileSync(${JSON.stringify(capture)},'attempt\\n');console.log(${JSON.stringify(JSON.stringify(badInit))});`,{mode:0o700});
 const r=await runProviderDiagnostic(file,out,()=>new ClaudeDecisionBackend({ledgerPath:out+'/allowance.db',scratchRoot:out+'/scratch',trial:'provider-diagnostic-v1',binary}));
 assert.equal(r.passed,false);assert.equal(r.results.length,1);assert.equal(r.results[0].failure.stage,'isolation');assert.equal(r.results[0].failure.attemptReserved,true);assert.equal(r.summary.attempts,1);assert.equal(readFileSync(capture,'utf8'),'attempt\n');
});
