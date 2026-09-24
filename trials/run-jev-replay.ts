/**
 * Offline Jev replay CLI. Dry by default: builds and sizes every request, calls nothing.
 *
 *   node dist/trials/run-jev-replay.js <evidence.json> --out <dir>            # dry
 *   node dist/trials/run-jev-replay.js <evidence.json> --out <dir> --live --ledger <sqlite>
 *   node dist/trials/run-jev-replay.js <evidence.json> --out <dir> --report <answers.json>
 *
 * Live mode needs the Gateway-host protected transport (see src/protected-jev.ts) and a
 * fresh trial ledger under the `jev-replay-v1` policy. Nothing in the game or the
 * coordinator changes; outputs are files under --out.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {TrialBudget} from '../src/appraisal.js';
import {protectedJevTransport} from '../src/protected-jev.js';
import {buildRequests,loadCases,report,runReplay,jevReplayVersion} from './jev-replay.js';

const args=process.argv.slice(2);const flag=(k:string)=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined;};
const evidencePath=args[0],out=flag('--out'),live=args.includes('--live'),reportOnly=flag('--report'),ledger=flag('--ledger');
if(!evidencePath||!out){console.error('usage: run-jev-replay <evidence.json> --out <dir> [--live --ledger <sqlite>] [--report <answers.json>]');process.exit(2);}
await mkdir(out,{recursive:true});
const cases=loadCases(JSON.parse(await readFile(evidencePath,'utf8')));
const requests=buildRequests(cases);
await writeFile(join(out,'requests.json'),JSON.stringify({version:jevReplayVersion,evidence:evidencePath,cases:cases.length,requests:requests.map(r=>({kind:r.kind,index:r.index,bytes:r.bytes,questions:r.questions,questionKeys:Object.keys(r.request.questions)})),bodies:requests.map(r=>r.request)},null,1));
console.log(`${cases.length} core turns, ${requests.length} requests (${requests.filter(r=>r.kind==='wake').length} wake, ${requests.filter(r=>r.kind==='grounding').length} grounding), largest state ${Math.max(...requests.map(r=>r.bytes))} bytes`);
let answers;
if(reportOnly)answers=JSON.parse(await readFile(reportOnly,'utf8'));
else if(live){
 if(!ledger){console.error('--live requires --ledger <sqlite path>');process.exit(2);}
 // 29 calls at the 0.002 ceiling is 0.058; the allowance leaves no room for a second pass.
 const budget=new TrialBudget(ledger,0.08,32,'jev-replay-v1');
 try{answers=await runReplay(requests,protectedJevTransport(),budget,AbortSignal.timeout(10*60_000));
  await writeFile(join(out,'answers.json'),JSON.stringify(answers,null,1));
  console.log('ledger',budget.summary());}
 finally{budget.close();}
}
if(answers){const r=report(cases,answers);await writeFile(join(out,'report.json'),JSON.stringify(r,null,1));
 console.log(JSON.stringify({calls:r.calls,failed:r.failed,costUSD:r.reportedCostUSD,coreWaits:r.wake.coreWaits,curve:r.wake.curve,closure:r.wake.closureAgreement,grounding:Object.fromEntries(Object.entries(r.grounding.perCategory).map(([k,v])=>[k,v.atOrAbove05]))},null,1));}
else console.log('dry run: no calls made; inspect requests.json');
