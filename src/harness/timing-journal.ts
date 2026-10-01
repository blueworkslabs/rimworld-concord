import {appendFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {z} from 'zod';

/** Operator diagnostics only. No journal field is added to a model-visible tool result. */
const text=z.string().trim().min(1).max(256),ms=z.number().finite().nonnegative();
export const TimingKind=z.enum(['tool_call','observer_before','tool_dispatch','observer_after',
 'model_call','controller_active','controller_suspended','intentional_wait']);
export type TimingKind=z.infer<typeof TimingKind>;
export const GameSample=z.object({world:text,epoch:text,mapId:z.number().int(),tick:z.number().int().nonnegative(),
 snapshotId:z.number().int(),paused:z.boolean(),speed:text}).strict();
export type GameSample=z.infer<typeof GameSample>;
const descriptor=z.object({kind:TimingKind,callId:text.optional(),label:text.optional(),reason:text.optional()}).strict()
 .refine(s=>!['intentional_wait','controller_suspended'].includes(s.kind)||!!s.reason,'Explicit wait/suspension reason required')
 .refine(s=>!['tool_call','observer_before','tool_dispatch','observer_after'].includes(s.kind)||!!s.callId,'Tool timing requires a call ID');
export type SpanDescriptor=z.infer<typeof descriptor>;
const point={version:z.literal(1),clockId:text,source:text,at:ms,monoMs:ms};
export const TimingEvent=z.discriminatedUnion('event',[
 z.object({...point,event:z.literal('span_started'),id:text,span:descriptor}).strict(),
 z.object({...point,event:z.literal('span_ended'),id:text,outcome:z.enum(['ok','error'])}).strict(),
 z.object({...point,event:z.literal('game_sample'),callId:text,phase:z.enum(['before','after']),sample:GameSample}).strict(),
]);
export type TimingEvent=z.infer<typeof TimingEvent>;
export interface TimingClock {wallMs():number;monotonicMs():number}
const systemClock:TimingClock={wallMs:()=>Date.now(),monotonicMs:()=>performance.now()};

/** A clock domain belongs to one recorder process, never to a hostname or wall clock.
 * Trusted adapters may record explicit model/control/wait boundaries here. Silence, tool
 * execution and OS process lifetime are not evidence of controller suspension or activity. */
export class TimingJournal {
 private readonly clockId=randomUUID();
 private last=-Infinity;
 private open=new Set<string>();
 constructor(private write:(event:TimingEvent)=>undefined,private source:string,private clock:TimingClock=systemClock){text.parse(source);}
 static file(path:string,source:string){return new TimingJournal(e=>{appendFileSync(path,JSON.stringify(e)+'\n');},source);}
 private emit(event:TimingEvent){
  // A sink must commit synchronously. Reject accidental async JS callers without an
  // unhandled rejection taking down an otherwise successful game action.
  const returned:unknown=this.write(event);
  if(returned!==undefined){
   if(returned&&typeof (returned as {then?:unknown}).then==='function')void Promise.resolve(returned).catch(()=>{});
   throw Error('Timing sink must return undefined synchronously');
  }
 }
 private point(){
  const monoMs=ms.parse(this.clock.monotonicMs());
  if(monoMs<this.last)throw Error('Timing clock moved backwards');
  this.last=monoMs;
  return {version:1 as const,clockId:this.clockId,source:this.source,at:ms.parse(this.clock.wallMs()),monoMs};
 }
 begin(span:SpanDescriptor){
  const parsed=descriptor.parse(span),id=randomUUID();
  this.emit({...this.point(),event:'span_started',id,span:parsed});this.open.add(id);return id;
 }
 end(id:string,outcome:'ok'|'error'='ok'){
  if(!this.open.has(id))throw Error('Unknown or already ended timing span');
  this.emit({...this.point(),event:'span_ended',id,outcome});this.open.delete(id);
 }
 sample(callId:string,phase:'before'|'after',sample:GameSample){
  this.emit({...this.point(),event:'game_sample',callId:text.parse(callId),phase,sample:GameSample.parse(sample)});
 }
}
