/**
 * Offline Jev replay CLI. Dry by default: builds and sizes every request, calls nothing.
 *
 *   node dist/trials/run-jev-replay.js <evidence.json> --out <dir>            # dry
 *   node dist/trials/run-jev-replay.js <evidence.json> --out <dir> --live     # one exclusive run
 *   node dist/trials/run-jev-replay.js <evidence.json> --out <dir> --report   # recompute from attempts.jsonl
 *
 * A live run owns its output directory: run.json binds the run id to the evidence and
 * request hashes and the expected model; attempts.jsonl receives every attempt before its
 * call and every outcome after; the ledger allows exactly one call per request. A second
 * live run in the same directory is refused. An interrupted run still writes its report.
 * Live mode needs the Gateway-host protected transport (see src/protected-jev.ts).
 */
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,appendFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {TrialBudget} from '../src/appraisal.js';
import {protectedJevTransport} from '../src/protected-jev.js';
import {JEV_EXPECTED_MODEL,JEV_MODEL,JEV_CALL_CEILING_USD} from '../src/jev-questions.js';
import {buildRequests,loadCases,report,runReplay,jevReplayVersion,sha256,type ReplayAnswer,type AttemptEvent} from './jev-replay.js';

const args=process.argv.slice(2);const flag=(k:string)=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined;};
const evidencePath=args[0],out=flag('--out'),live=args.includes('--live'),reportOnly=args.includes('--report');
if(!evidencePath||!out){console.error('usage: run-jev-replay <evidence.json> --out <dir> [--live | --report]');process.exit(2);}
const exists=async(p:string)=>{try{await stat(p);return true;}catch{return false;}};
await mkdir(out,{recursive:true});
const evidenceText=await readFile(evidencePath,'utf8');
const cases=loadCases(JSON.parse(evidenceText));
const requests=buildRequests(cases);
const requestsSha256=sha256(requests.map(r=>r.sha256).join('\n'));
await writeFile(join(out,'requests.json'),JSON.stringify({version:jevReplayVersion,evidence:evidencePath,evidenceSha256:sha256(evidenceText),requestsSha256,cases:cases.length,
 requests:requests.map(r=>({kind:r.kind,index:r.index,bytes:r.bytes,questions:r.questions,sha256:r.sha256,questionKeys:Object.keys(r.request.questions)})),bodies:requests.map(r=>r.request)},null,1));
console.log(`${cases.length} core turns (${cases.filter(c=>c.alignment==='aligned').length} aligned, ${cases.filter(c=>c.applied==='yes').length} applied), ${requests.length} requests (${requests.filter(r=>r.kind==='wake').length} wake, ${requests.filter(r=>r.kind==='grounding').length} grounding), largest state ${Math.max(...requests.map(r=>r.bytes))} bytes`);

const attemptsPath=join(out,'attempts.jsonl'),runPath=join(out,'run.json');
const readAnswers=async():Promise<ReplayAnswer[]>=>{
 if(!await exists(attemptsPath))return [];
 const events=(await readFile(attemptsPath,'utf8')).split('\n').filter(Boolean).map(l=>JSON.parse(l) as AttemptEvent&{runId?:string});
 return events.filter((e):e is Extract<AttemptEvent,{event:'result'|'failure'}>&{runId?:string}=>e.event!=='attempted').map(({event:_event,runId:_run,...a})=>a);
};
const write=async(answers:ReplayAnswer[],status:string)=>{
 const r=report(cases,answers);await writeFile(join(out,'report.json'),JSON.stringify({status,...r},null,1));
 console.log(JSON.stringify({status,calls:r.calls,failed:r.failed,costUSD:r.reportedCostUSD,unknown:r.unknown,coreWaits:r.wake.coreWaits,curve:r.wake.curve,closure:r.wake.closureAgreement,grounding:Object.fromEntries(Object.entries(r.grounding.perCategory).map(([k,v])=>[k,v.atOrAbove05]))},null,1));
};

if(reportOnly){await write(await readAnswers(),'report-only');}
else if(live){
 if(await exists(runPath)){console.error(`Refusing: ${runPath} exists; a live run owns its directory. Use --report or a new --out.`);process.exit(3);}
 const run={version:jevReplayVersion,runId:randomUUID(),createdAt:new Date().toISOString(),evidence:evidencePath,evidenceSha256:sha256(evidenceText),requestsSha256,
  model:JEV_MODEL,expectedModel:JEV_EXPECTED_MODEL,ceilingUSD:JEV_CALL_CEILING_USD,calls:requests.length,status:'running'};
 await writeFile(runPath,JSON.stringify(run,null,1));
 // Exactly one call per request; the ledger cannot be reopened for a second pass.
 const budget=new TrialBudget(join(out,'ledger.sqlite'),JEV_CALL_CEILING_USD*requests.length*1.25,requests.length,'jev-replay-v2');
 const sink=(e:AttemptEvent)=>appendFile(attemptsPath,JSON.stringify({runId:run.runId,...e})+'\n');
 let status='completed';
 try{await runReplay(requests,protectedJevTransport(),budget,AbortSignal.timeout(10*60_000),sink);}
 catch(e){status='interrupted';console.error('Replay interrupted:',e instanceof Error?e.message:e);}
 finally{
  const summary=budget.summary();budget.close();
  await writeFile(runPath,JSON.stringify({...run,status,finishedAt:new Date().toISOString(),ledger:summary},null,1));
  await write(await readAnswers(),status);
 }
}
else console.log('dry run: no calls made; inspect requests.json');
