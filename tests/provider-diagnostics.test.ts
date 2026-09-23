import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ClaudeDecisionBackend,CLAUDE_MODEL,parseClaudeResult} from '../src/claude-decision.js';
import {providerResultMetadata,validationIssues} from '../src/provider-diagnostics.js';
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
