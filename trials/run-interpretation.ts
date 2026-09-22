import {readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ClaudeDecisionBackend,CLAUDE_MODEL} from '../src/claude-decision.js';
import {Reflection} from '../src/attention.js';
import {Decision} from '../src/protocol.js';
import {reviseOutlook} from '../src/outlook.js';
import {interpretationSuite,requestContract} from './interpretation-cases.js';
/** Consumes each attempt before inference; no coordinator/game imports or retries. */
export async function runInterpretation(file:string,output:string,create=(dir:string)=>new ClaudeDecisionBackend({ledgerPath:join(dir,'allowance.db'),scratchRoot:join(dir,'scratch'),trial:'interpretation-v1'})){
 const data=readFileSync(file),suite=interpretationSuite();
 if(JSON.stringify(JSON.parse(data.toString()))!==JSON.stringify(suite))throw Error('Frozen interpretation suite differs from this build');
 const root=resolve(output);mkdirSync(root,{recursive:true,mode:0o700});
 const hash=createHash('sha256').update(data).digest('hex');
 writeFileSync(join(root,'started.json'),JSON.stringify({suiteHash:hash,maxAttempts:suite.maxAttempts,caseTimeoutMs:suite.caseTimeoutMs}),{flag:'wx',mode:0o600});
 const receipt:any={version:suite.version,model:CLAUDE_MODEL,suiteHash:hash,maxAttempts:12,attempts:0,results:[]};
 const save=()=>{writeFileSync(join(root,'receipt.tmp'),JSON.stringify(receipt,null,2),{mode:0o600});renameSync(join(root,'receipt.tmp'),join(root,'receipt.json'));};
 let backend:ClaudeDecisionBackend|undefined;
 try{
  backend=create(root);
  cases:for(const c of suite.cases){
   const later=structuredClone(c.later);
   for(const mode of ['reflection','decision'] as const){
    const view=mode==='reflection'?structuredClone(c.reflection):later;
    const row:any={id:c.id,condition:c.condition,repetition:c.repetition,mode,status:'started',view:structuredClone(view),request:requestContract(mode,view)};
    if(receipt.attempts>=12)throw Error('Attempt cap');receipt.attempts++;receipt.results.push(row);save();
    const start=Date.now(),rawIndex=backend.rawResponses.length,receiptIndex=backend.receipts.length,failureIndex=backend.failures.length;
    try{
     if(mode==='reflection'){
      const result=Reflection.parse(await backend.reflect(c.reflection,AbortSignal.timeout(suite.caseTimeoutMs)));
      if(result.kind==='revise_outlook')later.character.outlook=reviseOutlook(c.reflection.character,result.update,40);
      else if(result.kind!=='continue')throw Error('Unexpected reflection effect');
      row.result=result;row.retainedOutlook=later.character.outlook??null;
     }else row.result=Decision.parse(await backend.decide(later,AbortSignal.timeout(suite.caseTimeoutMs)));
     row.status='completed';
    }catch{row.status='failed';row.failure=backend.failures[failureIndex]??{stage:'validation_or_transport'};}
    row.elapsedMs=Date.now()-start;row.response=backend.rawResponses[rawIndex]?.structuredOutput??null;row.receipt=backend.receipts[receiptIndex]??null;receipt.summary=backend.summary();save();
    if(row.status==='failed')break cases;
   }
  }
  receipt.finished=true;
 }finally{backend?.close();save();}
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==5||process.argv[4]!=='--live')throw Error('Usage: run-interpretation SUITE.json OUTPUT --live');
 await runInterpretation(process.argv[2]!,process.argv[3]!);
}
