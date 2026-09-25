import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {appendAttempt,durableWrite,readReplay,replayIdentity} from '../trials/jev-replay-journal.js';
import {loadCases,buildRequests} from '../trials/jev-replay.js';

const evidencePath=new URL('../../docs/evidence/recorded-scene.json',import.meta.url);
const evidence=await readFile(evidencePath,'utf8');
const requests=buildRequests(loadCases(JSON.parse(evidence)));
const identity=replayIdentity(evidence,requests);
async function fixture(){
 const out=await mkdtemp(join(tmpdir(),'jev-journal-'));
 await durableWrite(join(out,'run.json'),{runId:'one',...identity},true);
 await durableWrite(join(out,'requests.json'),{...identity,bodies:requests.map(r=>r.request)});
 const r=requests[0]!;
 const attempted={runId:'one',event:'attempted' as const,attemptId:'a',at:'now',kind:r.kind,index:r.index,requestSha256:r.sha256};
 return {out,attempted};
}
test('run ownership is exclusive even for simultaneous claimants',async()=>{
 const out=await mkdtemp(join(tmpdir(),'jev-claim-'));const path=join(out,'run.json');
 const results=await Promise.allSettled([durableWrite(path,{id:'a'},true),durableWrite(path,{id:'b'},true)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected'&&(r.reason as NodeJS.ErrnoException).code==='EEXIST').length,1);
});
test('recovery counts unresolved paid attempts without scoring them and tolerates only torn tail',async()=>{
 const {out,attempted}=await fixture();const path=join(out,'attempts.jsonl');
 await appendAttempt(path,attempted);
 await appendAttempt(path,{...attempted,event:'received',raw:'{"large":"receipt"}',costUSD:0.001});
 await appendFile(path,'{"event":');
 const recovered=await readReplay(out,identity,requests);
 assert.equal(recovered.tornTail,true);assert.equal(recovered.unfinished,1);
 assert.equal(recovered.answers[0]!.costUSD,0.001);assert.equal(recovered.answers[0]!.answers,undefined);
 assert.match(recovered.answers[0]!.error!,/Interrupted after response/);
 await assert.rejects(readReplay(out,{...identity,evidenceSha256:'different'},requests),/provenance mismatch/);
});
test('report rejects altered input without overwriting retained requests; dry and live refuse owned directory',async()=>{
 const {out}=await fixture();const original=await readFile(join(out,'requests.json'),'utf8');
 const changed=JSON.parse(evidence);changed.live.coreInputs[0].view.tick++;
 const changedPath=join(out,'changed-evidence.json');await durableWrite(changedPath,changed);
 const cli=new URL('../trials/run-jev-replay.js',import.meta.url);
 for(const flag of ['--report','--live','']){
  const result=spawnSync(process.execPath,[cli.pathname,changedPath,'--out',out,...(flag?[flag]:[])],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.equal(await readFile(join(out,'requests.json'),'utf8'),original);
 }
});
test('journal rejects wrong run, request and duplicate slot instead of silently replacing answers',async()=>{
 for(const variant of ['run','hash','duplicate']){
  const {out,attempted}=await fixture();const path=join(out,'attempts.jsonl');
  await appendAttempt(path,attempted);
  if(variant==='duplicate')await appendAttempt(path,{...attempted,attemptId:'b'});
  else await appendAttempt(path,{...attempted,event:'failure',error:'failure',...(variant==='run'?{runId:'other'}:{requestSha256:'wrong'})});
  await assert.rejects(readReplay(out,identity,requests),/provenance|Duplicate/);
 }
});
