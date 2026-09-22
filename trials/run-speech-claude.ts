/** Offline only. Reuses the native adapter, never imports a game bridge/coordinator. */
import {readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ClaudeDecisionBackend,CLAUDE_MODEL} from '../src/claude-decision.js';
import {bankVersion,preparedSpeechCases} from './speech-cases.js';
export async function runSpeechClaude(file:string,output:string,create=(dir:string)=>new ClaudeDecisionBackend({ledgerPath:join(dir,'allowance.db'),scratchRoot:join(dir,'scratch'),trial:'speech-check-v1'})){
 const data=readFileSync(file);const suite=JSON.parse(data.toString());
 const cases=preparedSpeechCases();
 if(suite.version!==bankVersion||suite.authored!==true||JSON.stringify(suite.cases)!==JSON.stringify(cases))throw Error('Frozen case bank differs from this build');
 const root=resolve(output);mkdirSync(root,{recursive:true,mode:0o700});
 const hash=createHash('sha256').update(data).digest('hex');
 writeFileSync(join(root,'started.json'),JSON.stringify({casesHash:hash,maxAttempts:12,caseTimeoutMs:60000}),{flag:'wx',mode:0o600});
 const receipt:any={model:CLAUDE_MODEL,casesHash:hash,limit:12,attempts:0,results:[]};
 const save=()=>{writeFileSync(join(root,'receipt.tmp'),JSON.stringify(receipt,null,2),{mode:0o600});renameSync(join(root,'receipt.tmp'),join(root,'receipt.json'));};
 let backend:ClaudeDecisionBackend|undefined;
 try{
  backend=create(root);
  for(const c of cases){
   receipt.attempts++;const row:any={id:c.id,status:'started'};receipt.results.push(row);save();const began=Date.now(),receiptIndex=backend.receipts.length,responseIndex=backend.rawResponses.length,failureIndex=backend.failures.length,sizeIndex=backend.requestSizes?.length??0;
   try{
    await backend.reflect(c.view,AbortSignal.timeout(60000));
    row.status='completed';
   }catch{row.status='failed';row.failure=backend.failures[failureIndex]??{stage:'unknown'};}
   row.elapsedMs=Date.now()-began;row.receipt=backend.receipts[receiptIndex]??null;
   row.response=backend.rawResponses[responseIndex]?.structuredOutput??null;
   receipt.summary=backend.summary();row.authoredSize=backend.requestSizes?.[sizeIndex]?.authoredSize??null;save();
   // Failure ends the batch; unused capacity is not permission to repair/retry.
   if(row.status==='failed')break;
  }
  receipt.finished=true;
 }finally{backend?.close();save();}
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==5||process.argv[4]!=='--live')throw Error('Usage: run-speech-claude CASES.json OUTPUT --live (fresh finite operator authorization required)');
 await runSpeechClaude(process.argv[2]!,process.argv[3]!);
}
