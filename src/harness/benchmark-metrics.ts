import type {CallLog} from './tool-server.js';
export function counts(log:CallLog[]){
 const issued=log.filter(x=>x.event==='issued'),completed=log.filter(x=>x.event==='completed');
 const count=(kind:string)=>issued.filter(x=>x.kind===kind).length;
 return {inputs:count('input')+count('control'),observations:count('observation'),controls:count('control'),calls:issued.length,
  errors:completed.filter(x=>!x.ok).length,unresolved:issued.length-completed.length,
  observedBytes:completed.filter(x=>x.kind==='observation').reduce((n,x)=>n+(x.bytes??0),0)};
}
/** JSONL may end mid-event after interruption. Missing accounting is unknown, never zero. */
export function usageFromEvents(raw:string,naturalExit:boolean){
 let last:any,turns=0,malformed=0;
 for(const line of raw.split('\n').filter(Boolean)){
  try{const e=JSON.parse(line);if(e.type==='turn.completed'&&e.usage){last=e.usage;turns++;}}catch{malformed++;}
 }
 const numeric=(k:string)=>typeof last?.[k]==='number'&&Number.isFinite(last[k])?last[k]:null;
 const input=numeric('input_tokens'),cached=numeric('cached_input_tokens');
 return {input_tokens:input,cached_input_tokens:cached,uncached_input_tokens:input!==null&&cached!==null?input-cached:null,
  output_tokens:numeric('output_tokens'),reasoning_output_tokens:numeric('reasoning_output_tokens'),turns,
  complete:naturalExit&&!!last&&malformed===0,malformedEvents:malformed,actualBilledUsd:null,
  reason:'Native subscription billing unavailable; missing fields/unfinished-turn usage are unknown. Latest completed turn is retained, not assumed cumulative across retries.'};
}
