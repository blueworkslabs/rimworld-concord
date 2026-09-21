import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAUDE_MODEL,claudeArgs,verifyClaudeInit,parseClaudeResult } from '../src/claude-decision.js';
import { ClaudeDecisionBackend } from '../src/claude-decision.js';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const init={type:'system',subtype:'init',model:CLAUDE_MODEL,tools:[],mcp_servers:[],plugins:[],skills:[],slash_commands:[]};
const result={type:'result',subtype:'success',is_error:false,total_cost_usd:0.001,num_turns:1,modelUsage:{[CLAUDE_MODEL]:{}},structured_output:{decision:{kind:'refuse',reason:'I will keep my current work'}}};
test('subscription decision flags remove host tools, customizations and session reuse',()=>{
 const args=claudeArgs('decision');assert.equal(args[args.indexOf('--tools')+1],'');
 for(const flag of ['--safe-mode','--strict-mcp-config','--no-session-persistence','--disable-slash-commands'])assert(args.includes(flag));
 assert(!args.includes('--bare'));assert(!args.includes('--dangerously-skip-permissions'));assert(!args.includes('--resume'));
});
test('actual CLI initialization rejects host tools, MCP, customizations and model fallback',()=>{
 verifyClaudeInit(init);verifyClaudeInit({...init,tools:['StructuredOutput']});
 for(const bad of [{tools:['Read']},{mcp_servers:[{}]},{plugins:[{}]},{skills:['x']},{slash_commands:['x']},{model:'different'}])
   assert.throws(()=>verifyClaudeInit({...init,...bad}),/isolation/);
});
test('only successful strict decisions on the chosen model are accepted',()=>{
 assert.equal(parseClaudeResult(result,'decision').output.kind,'refuse');
 for(const bad of [{is_error:true},{total_cost_usd:-1},{num_turns:3},{modelUsage:{other:{}}},
   {structured_output:{decision:{kind:'accept',reason:'ok',actor:'another-pawn'}}}])assert.throws(()=>parseClaudeResult({...result,...bad},'decision'));
});
test('reflection schema accepts only continuation or an identified proposal decision',()=>{
 const r={...result,structured_output:{reflection:{kind:'continue',reason:'Keep routine'}}};
 assert.equal(parseClaudeResult(r,'reflection').output.kind,'continue');
 assert.throws(()=>parseClaudeResult({...r,structured_output:{reflection:{kind:'move',x:1,z:1}}},'reflection'));
});
test('cancelling a stubborn CLI kills the process group and preserves the attempt across reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-cli-'));const binary=join(dir,'fake-claude');
 const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},proposal:{id:'d8caec56-f2fa-4b50-a58e-f3a7588a3d20',pawn:'A',action:{kind:'move' as const,x:2,z:1},reason:'test',status:'pending' as const}};
 let backend:ClaudeDecisionBackend|undefined;
 try{
   await writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\nprocess.on("SIGTERM",()=>{});setInterval(()=>{},100);\n',{mode:0o700});
   const options={ledgerPath:join(dir,'trial.db'),scratchRoot:join(dir,'scratch'),binary};backend=new ClaudeDecisionBackend(options);
   await assert.rejects(backend.decide({...view,proposal:{...view.proposal,pawn:'other'}},new AbortController().signal),/ownership/);
   assert.equal(backend.summary().attempts,0);
   const abort=new AbortController();const pending=backend.decide(view,abort.signal);const rejected=assert.rejects(pending,/attempt retained/);
   const end=Date.now()+5000;while(Number(backend.summary().attempts)===0&&Date.now()<end)await delay(10);
   assert.equal(backend.summary().attempts,1);await delay(100);abort.abort();await rejected;
   backend.close();backend=new ClaudeDecisionBackend(options);
   assert.equal(backend.summary().attempts,1);assert.equal(backend.summary().reservedEquivalentUSD,0.1);
 }finally{backend?.close();await rm(dir,{recursive:true,force:true});}
});
