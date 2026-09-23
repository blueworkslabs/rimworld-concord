import {test} from 'node:test';
import {readFileSync} from 'node:fs';
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
function proof(input:any[]=events()){const stream=new ProviderStreamCounts(input=>{try{const p=parseClaudeResult({...result,num_turns:1,structured_output:input},'core');validateCoreChoice(p.output,view);return [];}catch(e){return validationIssues(e);}});for(const e of input)stream.observe(e);return structuredClone({counts:stream.counts,details:stream.details});}
test('core recovery requires the complete ordered two-message formatting trace; every relaxed boundary fails closed',()=>{
 const p=proof();assert(boundedCoreFormattingRecovery(p));assert.equal(parseClaudeResult(result,'core',p).formattingRecovery,true);
 assert.throws(()=>parseClaudeResult(result,'core'));
 for(const mode of ['decision','reflection','social','core-answer'] as const)assert.throws(()=>parseClaudeResult(result,mode,p));
 for(const patch of [{num_turns:4},{subtype:'error_max_turns'},{is_error:true},{modelUsage:{other:{}}},{total_cost_usd:-1},{structured_output:{core:{...choice,action:{kind:'invented',reason:'Invalid'}}}}])assert.throws(()=>parseClaudeResult({...result,...patch},'core',p));
 const mutations:Array<(p:any)=>void>=[
 p=>p.details.identity.complete=false,p=>p.details.identity.version=2,p=>p.details.identity.assistantEvents++,p=>p.details.events[0].messageOrdinal=2,p=>p.details.events[2].messageOrdinal=1,
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
 const write=async(final:any,tail="",block:any={type:'text',text:'Formatting answer.'})=>writeFile(binary,'#!/usr/bin/env node\nif(process.argv.includes("auth")){console.log(JSON.stringify({loggedIn:true,authMethod:"claude.ai",apiProvider:"firstParty",subscriptionType:"max"}));process.exit(0);}\n'+[init,{type:'assistant',message:{id:'m1',content:[block]}},...events().slice(0,-1),final].map(e=>'console.log('+JSON.stringify(JSON.stringify(e))+');').join('\n')+'\nprocess.stdout.write('+JSON.stringify(tail)+');',{mode:0o700});
 const b=new ClaudeDecisionBackend({ledgerPath:join(dir,'ledger.db'),scratchRoot:join(dir,'scratch'),binary,trial:'provider-diagnostic-v1'});
 try{
  await write(result);assert.deepEqual(await b.plan(view,new AbortController().signal),choice);assert.equal(b.receipts[0]!.formattingRecovery,true);assert.equal(b.receipts[0]!.status,'ok');assert.equal(b.summary().attempts,1);
  await write({...result,structured_output:{core:{...choice,topics:[{sourceId:'invented',status:'open',text:'Unknown source'}]}}});
  await assert.rejects(b.plan(view,new AbortController().signal),/attempt retained/);assert.equal(b.failures[0]!.stage,'validation');assert.equal(b.summary().attempts,2);
  for(const tail of ['{"type":"assistant",','{"type":"assistant","message":{"id":"extra","content":[]}}']){
   await write(result,tail);await assert.rejects(b.plan(view,new AbortController().signal),/attempt retained/);
   assert.equal(b.failures.at(-1)!.stage,'transport');assert.equal(b.rawResponses.at(-1)!.result.turns,3);
  }
  assert.equal(b.summary().attempts,4);
  const malformed=new ClaudeDecisionBackend({ledgerPath:join(dir,'malformed.db'),scratchRoot:join(dir,'scratch-malformed'),binary,trial:'provider-diagnostic-v1'});
  try{await write(result,'',{type:'text',text:7});await assert.rejects(malformed.plan(view,new AbortController().signal),/attempt retained/);assert.equal(malformed.failures[0]!.stage,'parsing');assert.equal(malformed.rawResponses[0]!.streamDetails.identity.complete,false);}finally{malformed.close();}
 }finally{b.close();await rm(dir,{recursive:true,force:true});}
});


test('split text/thinking events count as two identified messages without retaining their IDs or content',()=>{
 const base=events(),secret='private-identity-and-content-sentinel';
 for(const content of [{type:'text',text:secret},{type:'thinking',thinking:secret},{type:'redacted_thinking',data:secret}]){
  const input:any[]=structuredClone(base);input.splice(0,0,{type:'assistant',message:{id:'m1',content:[content]}} as any);
  const p=proof(input);assert.equal(p.counts.assistantEvents,3);assert.equal(p.counts.assistantMessages,2);assert.equal(p.details.identity.complete,true);
  assert(boundedCoreFormattingRecovery(p));assert.equal(parseClaudeResult(result,'core',p).formattingRecovery,true);
  assert.deepEqual(p.details.events.filter(e=>e.kind==='format-call').map(e=>e.messageOrdinal),[1,2]);assert(!JSON.stringify(p).includes(secret));
 }
 const input:any[]=structuredClone(base);input.splice(2,0,{type:'assistant',message:{id:'m2',content:[{type:'text',text:secret}]}} as any);
 input[0]!.message!.id=secret;
 const p=proof(input);assert(boundedCoreFormattingRecovery(p));assert(!JSON.stringify(p).includes(secret));
 assert.deepEqual(p.details.identity,{version:1,complete:true,assistantEvents:3});
});

test('missing/ambiguous identities, reopened messages, third messages and legacy coverage fail closed',()=>{
 const text=(id:any)=>({type:'assistant',message:{id,content:[{type:'text',text:'not retained'}]}});
 const variants:any[][]=[];
 for(const content of [[42],[null],[{}],[{type:'text',text:7}],[{type:'thinking',thinking:7}],[{type:'thinking',thinking:'x',signature:7}],[{type:'redacted_thinking',data:7}],[{type:'unrecognized'}],[{type:'tool_use',name:'StructuredOutput',id:'t',input:7}]]){const e:any[]=structuredClone(events());e.splice(0,0,{type:'assistant',message:{id:'m1',content}});variants.push(e);}
 for(const id of [undefined,null,'','   ','x'.repeat(201),7]){const e:any[]=structuredClone(events());e.splice(0,0,text(id));variants.push(e);}
 const malformed:any[]=structuredClone(events());malformed[0].message.content=null;variants.push(malformed);
 const third:any[]=structuredClone(events());third.splice(2,0,text('third'));variants.push(third);
 const reused:any[]=structuredClone(events());reused[2].message.id='m1';variants.push(reused);
 const afterTool:any[]=structuredClone(events());afterTool.splice(2,0,text('m1'));variants.push(afterTool);
 const oldAfterNew:any[]=structuredClone(events());oldAfterNew.splice(3,0,text('m1'));variants.push(oldAfterNew);
 const afterFinal:any[]=structuredClone(events());afterFinal.push(text('m2'));variants.push(afterFinal);
 const unknownResult:any[]=structuredClone(events());unknownResult[1].message.content[0].tool_use_id='unknown';variants.push(unknownResult);
 const duplicateCall:any[]=structuredClone(events());duplicateCall[2].message.content[0].id='t1';variants.push(duplicateCall);
 for(const input of variants){const p=proof(input);assert.equal(boundedCoreFormattingRecovery(p),false);assert.throws(()=>parseClaudeResult(result,'core',p));}
 const full:any=proof();delete full.details.identity;assert.equal(boundedCoreFormattingRecovery(full),false);
 const legacy=JSON.parse(readFileSync(new URL('../../docs/evidence/recovery-followthrough.json',import.meta.url),'utf8'));
 const rejected=legacy.providerDiagnostics.core.rawResponses.find((r:any)=>r.stream.assistantEvents===3&&r.result.turns===3);
 assert(rejected);assert.equal(boundedCoreFormattingRecovery({counts:rejected.stream,details:rejected.streamDetails}),false);
});

test('identity maps and event coverage fail closed at bounded capacity',()=>{
 const identities=new ProviderStreamCounts();
 for(let i=0;i<33;i++)identities.observe({type:'assistant',message:{id:'message-'+i,content:[]}});
 assert.equal(identities.counts.assistantMessages,32);assert.equal(identities.details.identity.complete,false);
 const chunks=new ProviderStreamCounts();
 for(let i=0;i<4097;i++)chunks.observe({type:'assistant',message:{id:'one-message',content:[]}});
 assert.equal(chunks.counts.assistantEvents,4096);assert.equal(chunks.details.identity.assistantEvents,4096);assert.equal(chunks.details.identity.complete,false);
});
