/** Offline four-attempt provider diagnostic. Fixed saved cases, never an operator reroll. No coordinator, game bridge, pawn calls or action dispatch. */
import {readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ClaudeDecisionBackend,CLAUDE_MODEL} from '../src/claude-decision.js';
import {validateCoreChoice} from '../src/core-planner.js';
import {providerDiagnosticSuite} from './provider-diagnostic-cases.js';
export async function runProviderDiagnostic(file:string,output:string,create=(dir:string)=>new ClaudeDecisionBackend({ledgerPath:join(dir,'allowance.db'),scratchRoot:join(dir,'scratch'),trial:'provider-diagnostic-v1'})){
 const data=readFileSync(file),suite=providerDiagnosticSuite();
 if(JSON.stringify(JSON.parse(data.toString()))!==JSON.stringify(suite))throw Error('Frozen suite or provider contract differs');
 const root=resolve(output);mkdirSync(root,{recursive:true,mode:0o700});
 const casesHash=createHash('sha256').update(data).digest('hex');
 writeFileSync(join(root,'started.json'),JSON.stringify({casesHash,maxAttempts:4,caseTimeoutMs:60000}),{flag:'wx',mode:0o600});
 const receipt:any={version:suite.version,model:CLAUDE_MODEL,casesHash,limit:4,attempts:0,results:[],gameActions:0,jevCalls:0};
 const save=()=>{writeFileSync(join(root,'receipt.tmp'),JSON.stringify(receipt,null,2),{mode:0o600});renameSync(join(root,'receipt.tmp'),join(root,'receipt.json'));};
 let backend:ClaudeDecisionBackend|undefined;
 try{
  backend=create(root);
  if(backend.summary().attempts!==0)throw Error('Fresh ledger required');
  for(const c of suite.cases){
   receipt.attempts++;const row:any={id:c.id,condition:c.condition,request:c.request,status:'started'};receipt.results.push(row);save();
   const began=Date.now(),ri=backend.receipts.length,rawi=backend.rawResponses.length,fi=backend.failures.length,si=backend.streamDiagnostics?.length??0;
   try{row.output=validateCoreChoice(await backend.plan(c.view,AbortSignal.timeout(suite.caseTimeoutMs)),c.view);row.status='completed';}
   catch{row.status='failed';row.failure=backend.failures[fi]??{stage:'runner-validation-or-unavailable'};}
   row.elapsedMs=Date.now()-began;row.receipt=backend.receipts[ri]??null;row.raw=backend.rawResponses[rawi]??null;row.stream=backend.streamDiagnostics?.[si]??null;
   receipt.summary=backend.summary();save();
   if(row.status==='failed'&&['authentication','setup','budget','isolation'].includes(row.failure.stage))break;
  }
  receipt.finished=true;receipt.passed=receipt.results.length===4&&receipt.results.every((r:any)=>r.status==='completed');
 }finally{backend?.close();save();}
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==5||process.argv[4]!=='--live')throw Error('Usage: run-provider-diagnostic CASES.json OUTPUT --live (fresh finite authorization required)');
 const result=await runProviderDiagnostic(process.argv[2]!,process.argv[3]!);console.log(JSON.stringify({passed:result.passed,attempts:result.attempts,summary:result.summary}));if(!result.passed)process.exitCode=1;
}
