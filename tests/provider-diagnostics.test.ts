import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ClaudeDecisionBackend,CLAUDE_MODEL,parseClaudeResult} from '../src/claude-decision.js';
import {ProviderStreamCounts,apiErrorMetadata,providerResultMetadata,validationIssues} from '../src/provider-diagnostics.js';
const result={type:'result',subtype:'success',is_error:false,total_cost_usd:.001,num_turns:2,modelUsage:{[CLAUDE_MODEL]:{}},structured_output:{decision:{kind:'refuse',reason:'I prefer not to.'}}};
test('private result diagnostics distinguish envelope failures without accepting a plausible inner answer',()=>{
 for(const patch of [{subtype:'error_max_turns',is_error:true},{num_turns:3},{modelUsage:{other:{}}},{total_cost_usd:-1}]){
  const bad={...result,...patch};let failure:unknown;try{parseClaudeResult(bad,'decision');}catch(e){failure=e;}assert(failure);
  const metadata=providerResultMetadata(bad,CLAUDE_MODEL);assert.equal(metadata.structuredOutputPresent,true);assert(validationIssues(failure).length);
 }
 const secret='private-provider-sentinel';const metadata=providerResultMetadata({...result,session_id:secret,errors:[secret],subtype:secret,modelUsage:{[secret]:{payload:secret}}},CLAUDE_MODEL);
 assert.equal(metadata.subtype,'other');assert.equal(metadata.otherModelCount,1);assert(!JSON.stringify(metadata).includes(secret));
 let failure:unknown;try{parseClaudeResult({...result,structured_output:{decision:{kind:'refuse',reason:'valid',[secret]:secret}}},'decision');}catch(e){failure=e;}
 assert(failure);assert(!JSON.stringify(validationIssues(failure)).includes(secret));
});
test('rejected envelope and nonzero exit retain result diagnostics, while fourth-attempt cap survives reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-diagnostics-'));const binary=join(dir,'fake');
 const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},proposal:{id:'d8caec56-f2fa-4b50-a58e-f3a7588a3d20',pawn:'A',action:{kind:'move' as const,x:2,z:1},reason:'Optional',status:'pending' as const}};
 const init={type:'system',subtype:'init',model:CLAUDE_MODEL,tools:['StructuredOutput'],mcp_servers:[],plugins:[],skills:[],slash_commands:[]};
 const options={ledgerPath:join(dir,'ledger.db'),scratchRoot:join(dir,'scratch'),binary,trial:'retention-names-v1' as const};let b=new ClaudeDecisionBackend(options);
 try{
  for(let i=0;i<4;i++){
   const bad={...result,num_turns:3};await writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\nconsole.log('+JSON.stringify(JSON.stringify(init))+');\nconsole.log('+JSON.stringify(JSON.stringify(bad))+');\nprocess.exitCode='+String(i===3?1:0)+';\n',{mode:0o700});
   await assert.rejects(b.decide(view,new AbortController().signal),/attempt retained/);
   assert.equal(b.rawResponses.length,i+1);assert.equal(b.rawResponses[i]!.result.turns,3);assert.equal(b.rawResponses[i]!.structuredOutput!==null,true);
   if(i<3)assert(b.failures[i]!.issues!.some(x=>x.path.includes('num_turns')));else assert.equal(b.failures[i]!.stage,'transport');
  }
  b.close();b=new ClaudeDecisionBackend(options);assert.equal(b.summary().attempts,4);await assert.rejects(b.decide(view,new AbortController().signal));assert.equal(b.summary().attempts,4);
 }finally{b.close();await rm(dir,{recursive:true,force:true});}
});


test('typed API metadata and bounded stream sequence never retain provider text, inputs, IDs or unknown codes',()=>{
 const secret='private-value-never-retain';
 assert.deepEqual(apiErrorMetadata({api_error_status:429,api_error:'model_requires_usage_credits',api_error_code:secret}),{status:429,kind:'model_requires_usage_credits',code:'other'});
 assert.deepEqual(apiErrorMetadata({api_error_status:799,api_error:secret,api_error_code:'rate_limit_error'}),{status:null,kind:'other',code:'rate_limit_error'});
 const s=new ProviderStreamCounts();
 s.observe({type:'assistant',is_api_error_message:true,api_error_status:401,api_error:'provider_credentials',api_error_code:secret,message:{id:secret,content:[{type:'text',text:secret}]}});
 const call={type:'assistant',message:{id:secret,content:[{type:'tool_use',id:secret,name:'StructuredOutput',input:{secret}}]}};
 s.observe(call);s.observe(call);
 s.observe({type:'user',message:{content:[{type:'tool_result',tool_use_id:secret,is_error:true,content:'Output does not match required schema: '+secret}]}});
 assert.equal(s.counts.structuredOutputCalls,2);assert.equal(s.details.events.filter(x=>x.kind==='format-call').length,1);
 assert.deepEqual(s.details.events[2],{kind:'format-result',ordinal:1,error:true,errorMarker:'schema-mismatch'});
 assert.deepEqual(s.details.events,[{kind:'api-error',metadata:{status:401,kind:'provider_credentials',code:'other'}},{kind:'format-call',ordinal:1,messageOrdinal:1,concordInputContract:'unchecked',issues:[]},{kind:'format-result',ordinal:1,error:true,errorMarker:'schema-mismatch'}]);
 assert(!JSON.stringify(s.details).includes(secret));
 for(let i=0;i<60;i++)s.observe({type:'result',num_turns:2,is_error:false,result:secret});
 assert.equal(s.details.events.length,32);assert(s.details.truncated);
});

test('formatting diagnostics inspect attempted inputs without applying them or loosening the turn guard',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-format-diagnostic-')),binary=join(dir,'fake');
 const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},proposal:{id:'d8caec56-f2fa-4b50-a58e-f3a7588a3d20',pawn:'A',action:{kind:'move' as const,x:2,z:1},reason:'Optional',status:'pending' as const}};
 const secret='do-not-persist-this-value',init={type:'system',subtype:'init',model:CLAUDE_MODEL,tools:['StructuredOutput'],mcp_servers:[],plugins:[],skills:[],slash_commands:[]};
 const events=[init,
  {type:'assistant',message:{id:'m1',content:[{type:'tool_use',id:'t1',name:'StructuredOutput',input:{decision:{kind:secret,reason:secret}}}]}},
  {type:'user',message:{content:[{type:'tool_result',tool_use_id:'t1',is_error:true,content:'Output does not match required schema: '+secret}]}},
  {type:'assistant',message:{id:'m2',content:[{type:'tool_use',id:'t2',name:'StructuredOutput',input:result.structured_output}]}},
  {type:'user',message:{content:[{type:'tool_result',tool_use_id:'t2',content:'Structured output provided successfully'}]}},
  {...result,num_turns:3}];
 await writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\n'+events.map(e=>'console.log('+JSON.stringify(JSON.stringify(e))+');').join('\n'),{mode:0o700});
 const b=new ClaudeDecisionBackend({ledgerPath:join(dir,'ledger.db'),scratchRoot:join(dir,'scratch'),binary,trial:'retention-names-v1'});
 try{
  await assert.rejects(b.decide(view,new AbortController().signal),/attempt retained/);
  const details=b.rawResponses[0]!.streamDetails;
  const calls=details.events.filter(e=>e.kind==='format-call');assert.equal(calls.length,2);assert.equal(calls[0]!.concordInputContract,'invalid');assert(calls[0]!.issues.length);assert.equal(calls[1]!.concordInputContract,'valid');
  assert.deepEqual(details.events.filter(e=>e.kind==='format-result').map(e=>e.ordinal),[1,2]);
  assert.equal(b.summary().attempts,1);assert.equal(b.failures[0]!.stage,'parsing');assert(b.failures[0]!.issues!.some(i=>i.path.includes('num_turns')));
  assert(!JSON.stringify(b.streamDiagnostics).includes(secret));assert.deepEqual(b.streamDiagnostics[0]!.details,details);
 }finally{b.close();await rm(dir,{recursive:true,force:true});}
});
