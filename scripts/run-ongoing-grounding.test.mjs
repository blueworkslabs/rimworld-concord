import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {caseBank} from './export-ongoing-grounding.mjs';
import {run,validateBank,verifyResult} from './run-ongoing-grounding.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const rawText=JSON.stringify({core:{topics:[],actionTopicId:null,action:{kind:'wait',reason:'No action chosen.'}}});
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'concord-grounding-')),bank=caseBank(),catalogs={};
 for(const model of bank.models){catalogs[model]=join(dir,model+'.json');await writeFile(catalogs[model],JSON.stringify({models:[{slug:model,tool_mode:'direct',multi_agent_version:'disabled',supports_search_tool:false}]}));}
 return {dir,bank,catalogs,root:join(dir,'run')};
}
test('case bank is exactly three original public projections, not labels or private diagnostics',()=>{
 const bank=caseBank();assert.deepEqual(bank.cases.map(c=>c.index),[1,3,5]);
 for(const c of bank.cases){const prompt=JSON.parse(c.request.prompt);assert(!('character' in prompt));assert(!('expected' in prompt));}
 const mutated=structuredClone(bank);mutated.cases[0].view.privateThought='CANARY';assert.throws(()=>validateBank(mutated));
 const altered=structuredClone(bank);altered.cases[0].request.prompt+=' hint';assert.throws(()=>validateBank(altered));
});
test('frozen paired requests reserve first, retain all six results and refuse replay',async()=>{
 const f=await setup();let calls=0;const observations=[];
 try{
  const report=await run(f.bank,f.catalogs,f.root,{invokeHelper:async([request,catalog,output,flag,model])=>{
   calls++;const disk=JSON.parse(await readFile(join(f.root,'report.json'),'utf8'));
   observations.push({status:disk.attempts.at(-1).status,count:disk.attempts.length,flag,model,request:await readFile(request,'utf8')});
   await mkdir(output);await writeFile(join(output,'result.json'),JSON.stringify({status:'completed',model,requestHash:hash(await readFile(request)),catalogHash:hash(await readFile(catalog)),preflight:{requests:1,toolsExposed:0},rawText}));return true;
  }});
  assert.equal(report.status,'completed');assert.equal(calls,6);assert.equal(report.attempts.length,6);
  assert(observations.every((o,i)=>o.status==='reserved'&&o.count===i+1&&o.flag==='--model'));
  for(let i=0;i<6;i+=2)assert.equal(observations[i].request,observations[i+1].request);
  await assert.rejects(run(f.bank,f.catalogs,f.root));assert.equal(calls,6);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('failure is retained and stops subsequent calls, including unknown outcome',async()=>{
 const f=await setup();let calls=0;try{
  await assert.rejects(run(f.bank,f.catalogs,f.root,{invokeHelper:async()=>{calls++;throw Error('Uncertain transport');}}));
  const report=JSON.parse(await readFile(join(f.root,'report.json'),'utf8'));
  assert.equal(calls,1);assert.equal(report.status,'stopped');assert.equal(report.attempts[0].status,'failed-or-uncertain');
  await assert.rejects(run(f.bank,f.catalogs,f.root));assert.equal(calls,1);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('matching provenance and a legal choice are required, not just successful provider status',()=>{
 const v=caseBank().cases[0].view,m='gpt-5.6-luna',r={status:'completed',model:m,requestHash:'r',catalogHash:'c',preflight:{requests:1,toolsExposed:0},rawText};
 assert.equal(verifyResult(r,m,'r','c',v).action.kind,'wait');
 for(const delta of [{model:'gpt-5.6-terra'},{requestHash:'wrong'},{catalogHash:'wrong'},{preflight:{requests:1,toolsExposed:1}},{rawText:JSON.stringify({core:{topics:[],actionTopicId:null,action:{kind:'ask',pawn:'invented',text:'Food?',reason:'Ask'}}})}])assert.throws(()=>verifyResult({...r,...delta},m,'r','c',v));
});
