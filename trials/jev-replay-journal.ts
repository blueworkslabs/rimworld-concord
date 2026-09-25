/** Run ownership and provenance are independent of model judgments. */
import {open,readFile,rename} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {type AttemptEvent,type ReplayAnswer,type ReplayRequest,sha256} from './jev-replay.js';
import {JEV_EXPECTED_MODEL,JEV_MODEL} from '../src/jev-questions.js';
export type RunIdentity={runId:string;evidenceSha256:string;requestsSha256:string;model:string;expectedModel:string};
export async function durableWrite(path:string,value:unknown,exclusive=false){
 const target=exclusive?path:`${path}.${randomUUID()}.tmp`;
 const f=await open(target,'wx',0o600);
 try{await f.writeFile(JSON.stringify(value,null,1));await f.sync();}finally{await f.close();}
 if(!exclusive)await rename(target,path);
 const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}
}
export async function appendAttempt(path:string,e:AttemptEvent&{runId:string}){
 const f=await open(path,'a',0o600);
 try{await f.writeFile(JSON.stringify(e)+'\n');await f.sync();}finally{await f.close();}
 const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}
}
export async function readReplay(out:string,identity:Omit<RunIdentity,'runId'>,requests:ReplayRequest[]){
 const run=JSON.parse(await readFile(join(out,'run.json'),'utf8')) as RunIdentity;
 for(const k of ['evidenceSha256','requestsSha256','model','expectedModel'] as const)
  if(run[k]!==identity[k])throw Error(`Replay provenance mismatch: ${k}`);
 const saved=JSON.parse(await readFile(join(out,'requests.json'),'utf8'));
 if(saved.evidenceSha256!==run.evidenceSha256||saved.requestsSha256!==run.requestsSha256||
  !Array.isArray(saved.bodies)||sha256(saved.bodies.map((r:unknown)=>sha256(r)).join('\n'))!==run.requestsSha256)
  throw Error('Saved requests do not match run identity');
 let text='';try{text=await readFile(join(out,'attempts.jsonl'),'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const entries=new Map<string,{attempt:Extract<AttemptEvent,{event:'attempted'}>;received?:ReplayAnswer;answer?:ReplayAnswer}>();
 const slots=new Set<string>();const hashes=new Map(requests.map(r=>[`${r.kind}:${r.index}`,r.sha256]));
 const lines=text.split('\n');let tornTail=false;
 for(let i=0;i<lines.length;i++){
  const line=lines[i]!;if(!line)continue;
  let e:AttemptEvent&{runId:string};
  try{e=JSON.parse(line);}catch(err){if(i===lines.length-1&&!text.endsWith('\n')){tornTail=true;break;}throw err;}
  if(e.runId!==run.runId||hashes.get(`${e.kind}:${e.index}`)!==e.requestSha256)throw Error('Attempt provenance mismatch');
  const {event,runId:_run,...a}=e;
  if(event==='attempted'){
   const slot=`${e.kind}:${e.index}`;
   if(slots.has(slot)||entries.has(e.attemptId))throw Error('Duplicate replay attempt');
   slots.add(slot);entries.set(e.attemptId,{attempt:e});
  }else{
   const row=entries.get(e.attemptId);
   if(!row||row.attempt.requestSha256!==e.requestSha256||row.attempt.kind!==e.kind||row.attempt.index!==e.index)throw Error('Outcome without matching attempt');
   if(event==='received'){if(row.received||row.answer)throw Error('Duplicate received outcome');row.received=a;}
   else if(event==='result'||event==='failure'){if(row.answer)throw Error('Duplicate final outcome');row.answer=a;}
   else throw Error('Unknown replay event');
  }
 }
 const answers=[...entries.values()].map(r=>{
  if(r.answer)return r.answer;
  const {event:_event,runId:_run,...attempt}=r.attempt as typeof r.attempt&{runId:string};
  return {...attempt,...r.received,error:r.received?'Interrupted after response; not scored':'Interrupted attempt; billing unknown'};
 });
 return {answers,tornTail,attempted:entries.size,unfinished:[...entries.values()].filter(r=>!r.answer).length};
}
export const replayIdentity=(evidenceText:string,requests:ReplayRequest[])=>({evidenceSha256:sha256(evidenceText),requestsSha256:sha256(requests.map(r=>r.sha256).join('\n')),model:JEV_MODEL,expectedModel:JEV_EXPECTED_MODEL});
