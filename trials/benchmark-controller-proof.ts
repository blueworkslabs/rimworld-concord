/** Controller isolation proof for the benchmark (docs/HARNESS.md): no game, no model. Runs the exact
 * scored command line for both arms against a local request recorder and requires that the arms
 * differ only in the arm server's declared tools (src/harness/controller-proof.ts). A verified
 * receipt for the same model, reasoning, controller version and task is required by scored runs. */
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {recordFirstRequest,compareArms,type ArmEvidence} from '../src/harness/controller-proof.js';
const root=new URL('../..',import.meta.url).pathname;
const model=process.argv.find(a=>a.startsWith('--model='))?.slice(8);if(!model)throw Error('Usage: benchmark-controller-proof --model=<alias> [--reasoning=low|medium|high]');
const reasoning=(process.argv.find(a=>a.startsWith('--reasoning='))?.slice(12)??'medium') as 'low'|'medium'|'high';
if(!['low','medium','high'].includes(reasoning))throw Error('reasoning must be low, medium or high');
const codex=process.env.CODEX_BIN??'codex';
const taskText=readFileSync(root+'/benchmark/tasks/T1.json','utf8'),task=JSON.parse(taskText);
const lab=mkdtempSync(join(tmpdir(),'concord-proof-lab-'));mkdirSync(lab+'/concord');
const uiBackend=join(lab,'ui-backend.json');writeFileSync(uiBackend,JSON.stringify({command:'/bin/false',args:[],env:{}}));
const evidence:Partial<Record<'harness'|'ui',ArmEvidence>>={};
for(const arm of ['harness','ui'] as const){
  const dir=join(lab,'run-'+arm);mkdirSync(dir+'/cwd',{recursive:true});
  // The arm servers' hidden observer reads the runner's start snapshot at startup; a fixture stands in.
  writeFileSync(dir+'/start.json',readFileSync(root+'/tests/fixtures/perception-snapshot.json','utf8'));
  evidence[arm]=await recordFirstRequest({codex,root,dir,arm,model,reasoning,callLog:dir+'/calls.jsonl',uiServer:arm==='ui'?uiBackend:undefined,env:{RIMWORLD_LAB_ROOT:lab,PATH:process.env.PATH}},
    task.prompt,{},join(lab,`first-request-${arm}.json`));
}
const findings=compareArms(evidence.harness!,evidence.ui!);
const receipt={runId:randomUUID(),at:new Date().toISOString(),model,reasoning,controllerVersion:evidence.harness!.controllerVersion,
  task:{id:task.id,sha256:createHash('sha256').update(taskText).digest('hex')},verified:findings.length===0,findings,evidence,privateFirstRequests:lab};
const path=root+`/.runtime/benchmark-controller-proof-${receipt.runId}.json`;mkdirSync(root+'/.runtime',{recursive:true});writeFileSync(path,JSON.stringify(receipt,null,2));
const names=(e:ArmEvidence)=>e.tools.map(t=>t.tools?`${t.name}[${t.tools.join(',')}]`:t.name);
console.log(JSON.stringify({path,verified:receipt.verified,findings,model,reasoning,tools:{harness:names(evidence.harness!),ui:names(evidence.ui!)},context:evidence.harness!.input.map(i=>`${i.role}:${i.bytes}`)},null,1));
if(!receipt.verified)process.exitCode=1;
