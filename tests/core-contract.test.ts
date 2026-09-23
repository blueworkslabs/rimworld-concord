import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {coreContractSuite} from '../trials/core-contract-cases.js';
import {runCoreContract} from '../trials/run-core-contract.js';
import {ClaudeDecisionBackend,CLAUDE_MODEL} from '../src/claude-decision.js';
test('frozen core cases retain saved perspective; variants change only declared availability',()=>{
 const s=coreContractSuite();assert.equal(s.cases.length,6);
 for(const c of s.cases){
  const v=structuredClone(c.view),original=s.cases[0]!.view;
  v.opportunities=original.opportunities;v.counters=original.counters;v.availability=original.availability;v.questionRecipients=original.questionRecipients;
  assert.deepEqual(v,original);
  if(c.condition==='wait-only')assert.equal(c.view.questionRecipients.length,0);
  if(c.condition!=='original')assert.equal(c.view.opportunities.length,0);
  for(const b of c.request.schema.properties.core.anyOf)if(['ask','wait'].includes(b.properties.action.properties.kind.const))assert.deepEqual(b.properties.actionTopicId,{type:'null'});
 }
});
test('core probe rejects changed contract before backend, stops on invalid output and cannot replay',async()=>{
 const root=mkdtempSync(tmpdir()+'/core-probe-fail-'),file=root+'/suite.json',out=root+'/run',s=coreContractSuite();let created=0,closed=false,recorded:any;
 writeFileSync(file,JSON.stringify({...s,maxAttempts:7}));await assert.rejects(runCoreContract(file,out,()=>{created++;throw Error();}),/Frozen/);assert.equal(created,0);assert(!existsSync(out));
 writeFileSync(file,JSON.stringify(s));
 const backend:any={receipts:[],rawResponses:[],failures:[],summary:()=>({attempts:0}),close(){closed=true;},async plan(){recorded=JSON.parse(readFileSync(out+'/receipt.json','utf8'));return {topics:[],actionTopicId:'brief',action:{kind:'wait',reason:'Invalid combination'}};}};
 const r=await runCoreContract(file,out,()=>backend);assert.equal(r.attempts,1);assert.equal(r.results[0].status,'failed');assert.equal(r.passed,false);assert(closed);assert.equal(recorded.results[0].status,'started');await assert.rejects(runCoreContract(file,out,()=>backend),/EEXIST/);
});
test('native adapter mock records six exact core requests and persists cap across reopening',async()=>{
 const root=mkdtempSync(tmpdir()+'/core-probe-provider-'),file=root+'/suite.json',out=root+'/run',binary=root+'/fake-claude',capture=root+'/requests.jsonl';const s=coreContractSuite();
 writeFileSync(file,JSON.stringify(s));
 const init={type:'system',subtype:'init',model:CLAUDE_MODEL,tools:['StructuredOutput'],mcp_servers:[],plugins:[],skills:[],slash_commands:[]};
 const raw={type:'result',subtype:'success',is_error:false,total_cost_usd:.001,num_turns:1,modelUsage:{[CLAUDE_MODEL]:{}}};
 writeFileSync(binary,`#!/usr/bin/env node
if(process.argv.includes('auth')){console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty',subscriptionType:'max'}));process.exit(0);}
let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
const args=process.argv;require('node:fs').appendFileSync(${JSON.stringify(capture)},JSON.stringify({prompt:input,instructions:args[args.indexOf('--system-prompt')+1],schema:JSON.parse(args[args.indexOf('--json-schema')+1])})+'\\n');
console.log(JSON.stringify(${JSON.stringify(init)}));console.log(JSON.stringify({...${JSON.stringify(raw)},structured_output:{core:{topics:[],actionTopicId:null,action:{kind:'wait',reason:'Scripted contract check'}}}}));});`,{mode:0o700});
 const options={ledgerPath:out+'/allowance.db',scratchRoot:out+'/scratch',trial:'core-contract-v1' as const,binary};
 const r=await runCoreContract(file,out,()=>new ClaudeDecisionBackend(options));assert.equal(r.passed,true);assert.equal(r.summary.attempts,6);assert.equal(r.results.length,6);
 const sent=readFileSync(capture,'utf8').trim().split('\n').map(l=>JSON.parse(l));assert.equal(sent.length,6);sent.forEach((v,i)=>assert.deepEqual(v,s.cases[i]!.request));
 const reopened=new ClaudeDecisionBackend(options);try{await assert.rejects(reopened.plan(s.cases[0]!.view,new AbortController().signal));assert.equal(reopened.summary().attempts,6);}finally{reopened.close();}
 assert.equal(readFileSync(capture,'utf8').trim().split('\n').length,6);
});
