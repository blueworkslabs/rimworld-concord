import {TimingEvent,TimingKind,type SpanDescriptor} from './timing-journal.js';
type Interval={startMs:number;endMs:number};
type Start=Extract<TimingEvent,{event:'span_started'}>;
type End=Extract<TimingEvent,{event:'span_ended'}>;
type Sample=Extract<TimingEvent,{event:'game_sample'}>;
const length=(xs:Interval[])=>xs.reduce((sum,x)=>sum+x.endMs-x.startMs,0);
function union(xs:Interval[]):Interval[]{
 const out:Interval[]=[];
 for(const x of [...xs].sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs)){
  const last=out.at(-1);if(last&&x.startMs<=last.endMs)last.endMs=Math.max(last.endMs,x.endMs);else out.push({...x});
 }
 return out;
}
function gaps(xs:Interval[],startMs:number,endMs:number):Interval[]{
 const out:Interval[]=[];let cursor=startMs;
 for(const x of union(xs)){if(x.startMs>cursor)out.push({startMs:cursor,endMs:x.startMs});cursor=Math.max(cursor,x.endMs);}
 if(cursor<endMs)out.push({startMs:cursor,endMs});return out;
}
function overlap(a:Interval[],b:Interval[]):Interval[]{
 return union(a.flatMap(x=>b.map(y=>({startMs:Math.max(x.startMs,y.startMs),endMs:Math.min(x.endMs,y.endMs)})).filter(x=>x.endMs>x.startMs)));
}
const key=(e:{clockId:string;id:string})=>JSON.stringify([e.clockId,e.id]);

/** Strict, offline reduction. Wall times only help correlate logs; durations never cross
 * clock domains. Bad/partial records remain visible and are never silently repaired. */
export function timingFromEvents(raw:string,writeFailures:{callId:string;reason:string}[]=[]){
 const events:TimingEvent[]=[],issues:{line:number;reason:string}[]=[],invalidClocks=new Set<string>();
 const clocks=new Map<string,{monoMs:number;source:string}>();
 for(const [i,line] of raw.split('\n').entries()){
  if(!line.trim())continue;
  let e:TimingEvent;
  try{e=TimingEvent.parse(JSON.parse(line));}catch{issues.push({line:i+1,reason:'Malformed or unsupported timing event'});continue;}
  const prior=clocks.get(e.clockId);
  if(prior&&(e.monoMs<prior.monoMs||e.source!==prior.source)){
   invalidClocks.add(e.clockId);issues.push({line:i+1,reason:'Clock regressed or changed source; clock domain excluded'});
  }
  clocks.set(e.clockId,{monoMs:e.monoMs,source:e.source});events.push(e);
 }
 const starts=new Map<string,Start>(),ends=new Map<string,End>(),invalidSpans=new Set<string>();
 for(const e of events){
  if(e.event==='game_sample')continue;
  const k=key(e),map=e.event==='span_started'?starts:ends;
  if(map.has(k)){invalidSpans.add(k);issues.push({line:0,reason:'Duplicate timing boundary: '+k});}
  if(e.event==='span_started'){if(!starts.has(k))starts.set(k,e);}else{
   ends.set(k,e);
   if(!starts.has(k)){invalidSpans.add(k);issues.push({line:0,reason:'End without prior start: '+k});}
  }
 }
 const spans=[...starts].map(([k,s])=>{
  const e=ends.get(k),invalid=invalidClocks.has(s.clockId)||invalidSpans.has(k);
  const durationMs=!invalid&&e?e.monoMs-s.monoMs:null;
  return {id:s.id,clockId:s.clockId,source:s.source,...s.span,startAtMs:s.at,endAtMs:e?.at??null,
   startMs:s.monoMs,endMs:durationMs!==null?e!.monoMs:null,durationMs,outcome:e?.outcome??null,
   status:invalid?'invalid':e?'completed':'unresolved'};
 });
 const clockSummaries=[...clocks].map(([clockId,{source}])=>{
  const valid=!invalidClocks.has(clockId),points=events.filter(e=>e.clockId===clockId).map(e=>e.monoMs);
  const startMs=Math.min(...points),endMs=Math.max(...points);
  const local=spans.filter(s=>s.clockId===clockId),complete=local.filter(s=>s.durationMs!==null);
  const intervals=(kind?:SpanDescriptor['kind'])=>complete.filter(s=>!kind||s.kind===kind).map(s=>({startMs:s.startMs,endMs:s.endMs!}));
  const byKind=Object.fromEntries(TimingKind.options.map(kind=>{
   const found=local.filter(s=>s.kind===kind),closed=intervals(kind);
   return [kind,{completedSpans:closed.length,unresolvedSpans:found.filter(s=>s.status!=='completed').length,
    unionMs:valid&&closed.length?length(union(closed)):null,summedMs:valid&&closed.length?length(closed):null}];
  })) as Record<SpanDescriptor['kind'],{completedSpans:number;unresolvedSpans:number;unionMs:number|null;summedMs:number|null}>;
  const active=union(intervals('controller_active')),suspended=union(intervals('controller_suspended'));
  const conflicts=overlap(active,suspended);
  // A missing/invalid end cannot certify a state, but its explicit start can contradict
  // a closed opposite state. Preserve that uncertainty through the last observed point.
  const uncertainController=union(local.filter(s=>['controller_active','controller_suspended'].includes(s.kind)&&s.status!=='completed')
   .map(s=>({startMs:s.startMs,endMs})));
  const unknown=valid?gaps(intervals(),startMs,endMs):null;
  const controllerUnknown=valid?union([...gaps([...active,...suspended],startMs,endMs),...conflicts,...uncertainController]):null;
  return {clockId,source,valid,observedStartMs:startMs,observedEndMs:endMs,byKind,
   unattributedGaps:unknown,unattributedMs:unknown?length(unknown):null,
   controller:{activeMs:valid&&active.length?length(active)-length(overlap(active,controllerUnknown!)):null,
    suspendedMs:valid&&suspended.length?length(suspended)-length(overlap(suspended,controllerUnknown!)):null,
    conflictingMs:valid?length(conflicts):null,unresolvedStateMs:valid?length(uncertainController):null,unknownGaps:controllerUnknown,unknownMs:controllerUnknown?length(controllerUnknown):null}};
 });
 const gameProgress=clockSummaries.flatMap(c=>{
  if(!c.valid)return [];
  const samples=events.filter((e):e is Sample=>e.event==='game_sample'&&e.clockId===c.clockId);
  return samples.slice(1).map((b,i)=>{
   const a=samples[i]!,x=a.sample,y=b.sample;
   const reason=x.world!==y.world?'world changed':x.epoch!==y.epoch?'epoch changed':x.mapId!==y.mapId?'map changed':y.tick<x.tick?'tick regressed':null;
   return {clockId:c.clockId,from:{callId:a.callId,phase:a.phase,atMs:a.at,monoMs:a.monoMs,...x},
    to:{callId:b.callId,phase:b.phase,atMs:b.at,monoMs:b.monoMs,...y},elapsedSampleMs:b.monoMs-a.monoMs,tickDelta:reason?null:y.tick-x.tick,unknownReason:reason};
  });
 });
 return {version:1,status:writeFailures.length?'partial':!events.length?'unavailable':issues.length||spans.some(s=>s.status!=='completed')||clockSummaries.some(c=>(c.controller.conflictingMs??0)>0)?'partial':'recorded',
  issues,writeFailures,spans,clocks:clockSummaries,gameProgress,
  limitations:[
   'Only explicit trusted boundaries are measured. No model or controller state is inferred from tool calls, pauses or silence.',
   'Clock domains are independent; do not add their wall coverage or subtract their timestamps. Kind totals overlap and are not additive.',
   'Coverage is bounded by the first and last recorded event in each clock domain; leading/trailing run gaps remain unknown.',
   'Tool dispatch includes backend/bridge transport and execution, not isolated network or native work time. Tool call spans exclude client-side MCP transport.',
   'Game samples are observed endpoints, not an exact event clock or proof of continuous pause/progress. No stall threshold or failure classification is applied.',
  ]};
}
