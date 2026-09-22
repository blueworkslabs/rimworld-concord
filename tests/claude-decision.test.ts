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
 const r={...result,structured_output:{reflection:{choice:'keep_current_activity',reason:'Keep routine'}}};
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
   await assert.rejects(backend.decide({...view,history:[{...view.proposal,pawn:'other'}]},new AbortController().signal),/ownership/);
   assert.equal(backend.summary().attempts,0);
   const abort=new AbortController();const pending=backend.decide(view,abort.signal);const rejected=assert.rejects(pending,/attempt retained/);
   const end=Date.now()+5000;while(Number(backend.summary().attempts)===0&&Date.now()<end)await delay(10);
   assert.equal(backend.summary().attempts,1);await delay(100);abort.abort();await rejected;
   backend.close();backend=new ClaudeDecisionBackend(options);
   assert.equal(backend.summary().attempts,1);assert.equal(backend.summary().reservedEquivalentUSD,0.1);
 }finally{backend?.close();await rm(dir,{recursive:true,force:true});}
});

test('rejected CLI outputs and failed exits retain known charges and lock overruns',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-cli-charge-'));
 const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},proposal:{id:'d8caec56-f2fa-4b50-a58e-f3a7588a3d20',pawn:'A',action:{kind:'move' as const,x:2,z:1},reason:'test',status:'pending' as const}};
 try {
  for(const [i,bad] of [
   {...result,total_cost_usd:1,structured_output:{decision:{kind:'accept',reason:'spoof',actor:'B'}}},
   {...result,total_cost_usd:1,subtype:'error_max_turns',is_error:true},
   {...result,total_cost_usd:.01,structured_output:{}},
  ].entries()) {
   const binary=join(dir,'fake-'+i),options={ledgerPath:join(dir,'trial-'+i+'.db'),scratchRoot:join(dir,'scratch'),binary};
   await writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\n'+
    'console.log('+JSON.stringify(JSON.stringify(init))+');\nconsole.log('+JSON.stringify(JSON.stringify(bad))+');\nprocess.exitCode='+String(i===1?1:0)+';\n',{mode:0o700});
   let b=new ClaudeDecisionBackend(options);
   try {
    await assert.rejects(b.decide(view,new AbortController().signal),/attempt retained/);
    assert.equal(b.summary().estimatedUsageUSD,bad.total_cost_usd);b.close();b=new ClaudeDecisionBackend(options);
    if(bad.total_cost_usd>0.1){await assert.rejects(b.decide(view,new AbortController().signal));assert.equal(b.summary().attempts,1);}
   }finally{b.close();}
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('work trial has its own persistent twelve-attempt cap; exhaustion never resets on reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-work-cap-')),binary=join(dir,'fake-claude');
 const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},proposal:{id:'d8caec56-f2fa-4b50-a58e-f3a7588a3d20',pawn:'A',action:{kind:'move' as const,x:2,z:1},reason:'test',status:'pending' as const}};
 const options={ledgerPath:join(dir,'work.db'),scratchRoot:join(dir,'scratch'),binary,trial:'work-v1' as const};let b:ClaudeDecisionBackend|undefined;
 try{
  await writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\nconsole.log('+JSON.stringify(JSON.stringify(init))+');\nconsole.log('+JSON.stringify(JSON.stringify(result))+');\n',{mode:0o700});
  b=new ClaudeDecisionBackend(options);for(let i=0;i<12;i++)await b.decide(view,new AbortController().signal);
  assert.equal(b.summary().attempts,12);await assert.rejects(b.decide(view,new AbortController().signal));b.close();b=new ClaudeDecisionBackend(options);
  await assert.rejects(b.decide(view,new AbortController().signal));assert.equal(b.summary().attempts,12);
 }finally{b?.close();await rm(dir,{recursive:true,force:true});}
});

test('reconsideration has its own persistent six-attempt cap; exhaustion never resets on reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-reconsider-cap-')),binary=join(dir,'fake-claude');
 const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},proposal:{id:'d8caec56-f2fa-4b50-a58e-f3a7588a3d20',pawn:'A',action:{kind:'move' as const,x:2,z:1},reason:'test',status:'pending' as const}};
 const options={ledgerPath:join(dir,'reconsider.db'),scratchRoot:join(dir,'scratch'),binary,trial:'reconsider-v1' as const};let b:ClaudeDecisionBackend|undefined;
 try{
  await writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\nconsole.log('+JSON.stringify(JSON.stringify(init))+');\nconsole.log('+JSON.stringify(JSON.stringify(result))+');\n',{mode:0o700});
  b=new ClaudeDecisionBackend(options);for(let i=0;i<6;i++)await b.decide(view,new AbortController().signal);
  assert.equal(b.summary().attempts,6);await assert.rejects(b.decide(view,new AbortController().signal));b.close();b=new ClaudeDecisionBackend(options);
  await assert.rejects(b.decide(view,new AbortController().signal));assert.equal(b.summary().attempts,6);
 }finally{b?.close();await rm(dir,{recursive:true,force:true});}
});

test('interruption follow-up has its own persistent six-attempt cap; exhaustion never resets on reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-interruption-cap-')),binary=join(dir,'fake-claude');
 const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},proposal:{id:'d8caec56-f2fa-4b50-a58e-f3a7588a3d20',pawn:'A',action:{kind:'move' as const,x:2,z:1},reason:'test',status:'pending' as const}};
 const options={ledgerPath:join(dir,'interruption.db'),scratchRoot:join(dir,'scratch'),binary,trial:'interruption-v1' as const};let b:ClaudeDecisionBackend|undefined;
 try{
  await writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\nconsole.log('+JSON.stringify(JSON.stringify(init))+');\nconsole.log('+JSON.stringify(JSON.stringify(result))+');\n',{mode:0o700});
  b=new ClaudeDecisionBackend(options);for(let i=0;i<6;i++)await b.decide(view,new AbortController().signal);
  assert.equal(b.summary().attempts,6);await assert.rejects(b.decide(view,new AbortController().signal));b.close();b=new ClaudeDecisionBackend(options);
  await assert.rejects(b.decide(view,new AbortController().signal));assert.equal(b.summary().attempts,6);
 }finally{b?.close();await rm(dir,{recursive:true,force:true});}
});

test('explicit intent follow-up has its own persistent six-attempt cap; exhaustion never resets on reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-intent-cap-')),binary=join(dir,'fake-claude');
 const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},proposal:{id:'d8caec56-f2fa-4b50-a58e-f3a7588a3d20',pawn:'A',action:{kind:'move' as const,x:2,z:1},reason:'test',status:'pending' as const}};
 const options={ledgerPath:join(dir,'intent.db'),scratchRoot:join(dir,'scratch'),binary,trial:'intent-v1' as const};let b:ClaudeDecisionBackend|undefined;
 try{
  await writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\nconsole.log('+JSON.stringify(JSON.stringify(init))+');\nconsole.log('+JSON.stringify(JSON.stringify(result))+');\n',{mode:0o700});
  b=new ClaudeDecisionBackend(options);for(let i=0;i<6;i++)await b.decide(view,new AbortController().signal);
  assert.equal(b.summary().attempts,6);await assert.rejects(b.decide(view,new AbortController().signal));b.close();b=new ClaudeDecisionBackend(options);
  await assert.rejects(b.decide(view,new AbortController().signal));assert.equal(b.summary().attempts,6);
 }finally{b?.close();await rm(dir,{recursive:true,force:true});}
});

test('native adapter retains explicit provider choice when its agreement ID is rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-choice-')),binary=join(dir,'fake-claude');
 const agreementId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
 const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},events:[],proposals:[]};
 const raw={...result,structured_output:{reflection:{choice:'withdraw_current_agreement',agreementId,reason:'This nonexistent agreement'}}};
 let backend:ClaudeDecisionBackend|undefined;
 try{
  await writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0); }\nconsole.log('+JSON.stringify(JSON.stringify(init))+');\nconsole.log('+JSON.stringify(JSON.stringify(raw))+');\n',{mode:0o700});
  backend=new ClaudeDecisionBackend({ledgerPath:join(dir,'trial.db'),scratchRoot:dir,binary,trial:'intent-v1'});
  await assert.rejects(backend.reflect(view,new AbortController().signal),/attempt retained/);
  assert.equal(backend.summary().attempts,1);assert.equal(backend.summary().estimatedUsageUSD,.001);
  assert.equal(backend.receipts[0]!.status,'rejected');assert.deepEqual(backend.receipts[0]!.providerChoice,raw.structured_output.reflection);
 }finally{backend?.close();await rm(dir,{recursive:true,force:true});}
});

test('alternative request follow-up has its own persistent six-attempt cap; exhaustion never resets on reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-alternative-cap-')),binary=join(dir,'fake-claude');
 const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},proposal:{id:'d8caec56-f2fa-4b50-a58e-f3a7588a3d20',pawn:'A',action:{kind:'move' as const,x:2,z:1},reason:'test',status:'pending' as const}};
 const options={ledgerPath:join(dir,'alternative.db'),scratchRoot:join(dir,'scratch'),binary,trial:'alternative-v1' as const};let b:ClaudeDecisionBackend|undefined;
 try{
  await writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\nconsole.log('+JSON.stringify(JSON.stringify(init))+');\nconsole.log('+JSON.stringify(JSON.stringify(result))+');\n',{mode:0o700});
  b=new ClaudeDecisionBackend(options);for(let i=0;i<6;i++)await b.decide(view,new AbortController().signal);
  assert.equal(b.summary().attempts,6);await assert.rejects(b.decide(view,new AbortController().signal));b.close();b=new ClaudeDecisionBackend(options);
  await assert.rejects(b.decide(view,new AbortController().signal));assert.equal(b.summary().attempts,6);
 }finally{b?.close();await rm(dir,{recursive:true,force:true});}
});

test('private outlook follow-up has its own persistent six-attempt cap; exhaustion never resets on reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'concord-outlook-cap-')),binary=join(dir,'fake-claude');
 const view={pawn:{id:'A',name:'Ada',x:1,z:1,job:'Wait',health:1},character:{id:'A',name:'Ada',memories:[]},proposal:{id:'d8caec56-f2fa-4b50-a58e-f3a7588a3d20',pawn:'A',action:{kind:'move' as const,x:2,z:1},reason:'test',status:'pending' as const}};
 const options={ledgerPath:join(dir,'outlook.db'),scratchRoot:join(dir,'scratch'),binary,trial:'outlook-v1' as const};let b:ClaudeDecisionBackend|undefined;
 try{
  await writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\nconsole.log('+JSON.stringify(JSON.stringify(init))+');\nconsole.log('+JSON.stringify(JSON.stringify(result))+');\n',{mode:0o700});
  b=new ClaudeDecisionBackend(options);for(let i=0;i<6;i++)await b.decide(view,new AbortController().signal);
  assert.equal(b.summary().attempts,6);await assert.rejects(b.decide(view,new AbortController().signal));b.close();b=new ClaudeDecisionBackend(options);
  await assert.rejects(b.decide(view,new AbortController().signal));assert.equal(b.summary().attempts,6);
 }finally{b?.close();await rm(dir,{recursive:true,force:true});}
});
