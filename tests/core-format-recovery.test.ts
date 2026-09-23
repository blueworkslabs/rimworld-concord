import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ClaudeDecisionBackend,CLAUDE_MODEL,parseClaudeResult} from '../src/claude-decision.js';
import {ProviderStreamCounts,boundedCoreFormattingRecovery,validationIssues} from '../src/provider-diagnostics.js';
import {validateCoreChoice} from '../src/core-planner.js';
import {providerDiagnosticSuite} from '../trials/provider-diagnostic-cases.js';
const view=providerDiagnosticSuite().cases[0]!.view;
const choice={topics:[],actionTopicId:null,action:{kind:'wait',reason:'Wait for new information.'}};
const result={type:'result',subtype:'success',is_error:false,total_cost_usd:.001,num_turns:3,modelUsage:{[CLAUDE_MODEL]:{}},structured_output:{core:choice}};
function events(){return [
 {type:'assistant',message:{id:'m1',content:[{type:'tool_use',id:'t1',name:'StructuredOutput',input:{core:{...choice,topics:[{sourceId:'brief',status:'open',text:'x'.repeat(241)}]}}}]}},
 {type:'user',message:{content:[{type:'tool_result',tool_use_id:'t1',is_error:true,content:'Output does not match required schema: maxLength'}]}},
 {type:'assistant',message:{id:'m2',content:[{type:'tool_use',id:'t2',name:'StructuredOutput',input:{core:choice}}]}},
 {type:'user',message:{content:[{type:'tool_result',tool_use_id:'t2',content:'Structured output provided successfully'}]}},result];}
function proof(){const stream=new ProviderStreamCounts(input=>{try{const p=parseClaudeResult({...result,num_turns:1,structured_output:input},'core');validateCoreChoice(p.output,view);return [];}catch(e){return validationIssues(e);}});for(const e of events())stream.observe(e);return structuredClone({counts:stream.counts,details:stream.details});}
test('core recovery requires the complete ordered two-message formatting trace; every relaxed boundary fails closed',()=>{
 const p=proof();assert(boundedCoreFormattingRecovery(p));assert.equal(parseClaudeResult(result,'core',p).formattingRecovery,true);
 assert.throws(()=>parseClaudeResult(result,'core'));
 for(const mode of ['decision','reflection','social','core-answer'] as const)assert.throws(()=>parseClaudeResult(result,mode,p));
 for(const patch of [{num_turns:4},{subtype:'error_max_turns'},{is_error:true},{modelUsage:{other:{}}},{total_cost_usd:-1},{structured_output:{core:{...choice,action:{kind:'invented',reason:'Invalid'}}}}])assert.throws(()=>parseClaudeResult({...result,...patch},'core',p));
 const mutations:Array<(p:any)=>void>=[
 p=>p.details.truncated=true,p=>p.details.events.reverse(),p=>p.details.events.pop(),p=>p.details.events.push(p.details.events[0]),
 p=>p.details.events[0].concordInputContract='unchecked',p=>p.details.events[0].issues=[],p=>p.details.events[1].ordinal=2,
 p=>p.details.events[1].errorMarker='other',p=>p.details.events[1].error=false,p=>p.details.events[2].concordInputContract='invalid',
 p=>p.details.events[2].ordinal=1,p=>p.details.events[2].issues=[{code:'unclassified',path:[]}],p=>p.details.events[3].ordinal=null,
 p=>p.details.events[3].error=true,p=>p.details.events[4].error=true,p=>p.details.events[4].turns=2];
 for(const key of Object.keys(p.counts))mutations.push(p=>p.counts[key]++);
 for(const mutate of mutations){const bad=structuredClone(p);mutate(bad);assert.equal(boundedCoreFormattingRecovery(bad),false);assert.throws(()=>parseClaudeResult(result,'core',bad));}
});
test('native adapter accepts one bounded core formatting repair but still rejects context-invalid final choices',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-core-recovery-')),binary=join(dir,'fake');
 const init={type:'system',subtype:'init',model:CLAUDE_MODEL,tools:['StructuredOutput'],mcp_servers:[],plugins:[],skills:[],slash_commands:[]};
 const write=async(final:any)=>writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\n'+[init,...events().slice(0,-1),final].map(e=>'console.log('+JSON.stringify(JSON.stringify(e))+');').join('\n'),{mode:0o700});
 const b=new ClaudeDecisionBackend({ledgerPath:join(dir,'ledger.db'),scratchRoot:join(dir,'scratch'),binary,trial:'provider-diagnostic-v1'});
 try{
  await write(result);assert.deepEqual(await b.plan(view,new AbortController().signal),choice);assert.equal(b.receipts[0]!.formattingRecovery,true);assert.equal(b.receipts[0]!.status,'ok');assert.equal(b.summary().attempts,1);
  await write({...result,structured_output:{core:{...choice,topics:[{sourceId:'invented',status:'open',text:'Unknown source'}]}}});
  await assert.rejects(b.plan(view,new AbortController().signal),/attempt retained/);assert.equal(b.failures[0]!.stage,'validation');assert.equal(b.summary().attempts,2);
 }finally{b.close();await rm(dir,{recursive:true,force:true});}
});
