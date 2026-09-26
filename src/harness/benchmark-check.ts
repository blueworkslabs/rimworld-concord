import {readFileSync,readdirSync} from 'node:fs';
import {Snapshot} from './perception.js';
import type {BenchmarkTask} from './benchmark-task.js';
import {checkT1,type CheckResult} from './checker.js';
import {checkT2,checkT3} from './checker-colony.js';
/** Observer filenames carry a strictly increasing sequence, independent of game ticks. */
export function readObservations(dir:string):Snapshot[]{
 const files=readdirSync(dir).map(name=>({name,match:/^observer-\d+-(\d+)\.json$/.exec(name)})).filter(f=>f.match).sort((a,b)=>Number(a.match![1])-Number(b.match![1]));
 const seen=new Set<number>();return files.map(f=>{const n=Number(f.match![1]);if(seen.has(n))throw Error('Duplicate observer sequence');seen.add(n);return Snapshot.parse(JSON.parse(readFileSync(dir+'/'+f.name,'utf8')));});
}
/** Fail closed without throwing out the run's final receipt on corrupt observer evidence. */
export function retainedCheck(task:BenchmarkTask,start:Snapshot|undefined,end:Snapshot|undefined,dir:string):{checker:CheckResult|null;checkerFailure:string|null}{
 try{
  if(!start||!end)return {checker:null,checkerFailure:null};
  let checker:CheckResult;
  if(task.id==='T1'){
   let configured:Snapshot|undefined;
   const files=readdirSync(dir);if(files.includes('configured.json'))configured=Snapshot.parse(JSON.parse(readFileSync(dir+'/configured.json','utf8')));
   checker=checkT1(start,end,configured);
  }else{const history=readObservations(dir);checker=task.id==='T2'?checkT2(start,end,task.rules,history):checkT3(start,end,task.rules,history);}
  return {checker,checkerFailure:null};
 }catch(e){return {checker:{task:task.id,completed:false,evidence:{},missing:['checker evidence invalid; see checkerFailure']},checkerFailure:String(e)};}
}
