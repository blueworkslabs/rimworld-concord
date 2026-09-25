/**
 * Annotate-only live grounding: the first one-use Jev wiring (JEV_REPLAY decisions, 2026-09-25).
 *
 * After a core reply has been returned to the coordinator, ask the seven grounding nouls
 * about that reply beside the records the core was shown, and `asks_core` when the wake
 * carried pawn messages. Scores and flags are journaled per core turn. Nothing here gates,
 * delays, rewrites or rejects a reply: the annotation runs after the result is sent and
 * every failure (budget, transport, contract, size) is recorded and swallowed.
 *
 * The request built here is byte-identical to the offline replay's grounding request for
 * the same input and reply, so live flags are comparable with E1/E2 and can be adjudicated
 * by hand the same way (the next recorded scene is the held-out set).
 */
import {createHash,randomUUID} from 'node:crypto';
import {open} from 'node:fs/promises';
import {dirname} from 'node:path';
import {z} from 'zod';
import type {AppraisalTransport,TrialBudget} from './appraisal.js';
import {asksCoreQuestion,coreWakeState,groundingCategories,groundingQuestions,groundingState,jevRequest,validateJevResponse,thresholds,JEV_CALL_CEILING_USD,type GroundingViewInput,type JevAnswer,type JevRequest,type WakeViewInput} from './jev-questions.js';

export const jevAnnotateVersion='jev-annotate-v1';
/** Reporting threshold from the replay interpretation: a flag, never a decision. */
export const JEV_ANNOTATE_FLAG=thresholds.grounding.flag;
export const sha256=(x:unknown)=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');

/** The published core reply shape, shared with the offline replay so both see the same state. */
export const CoreReply=z.object({topics:z.array(z.object({sourceId:z.string(),text:z.string(),status:z.string()})).default([]),
 actionTopicId:z.string().nullable().optional(),action:z.object({kind:z.string(),reason:z.string().default(''),text:z.string().optional(),pawn:z.string().optional(),opportunityId:z.string().optional(),proposalId:z.string().optional()})});
export type CoreReply=z.infer<typeof CoreReply>;

export type AnnotationKind='grounding'|'asks_core';
export type AnnotationRequest={kind:AnnotationKind;request:JevRequest;bytes:number;sha256:string};
export type AnnotationSkip={kind:AnnotationKind;reason:string};

/** Requests for one core turn. Non-core modes and unparseable replies produce nothing;
 * an oversized state is a skip, recorded but never sent. */
export function annotationRequests(mode:string,view:unknown,output:unknown):{requests:AnnotationRequest[];skipped:AnnotationSkip[]}{
 const requests:AnnotationRequest[]=[],skipped:AnnotationSkip[]=[];
 if(mode!=='core')return {requests,skipped};
 const reply=CoreReply.safeParse(output);if(!reply.success)return {requests,skipped:[{kind:'grounding',reason:'reply is not a core choice'}]};
 const add=(kind:AnnotationKind,build:()=>JevRequest)=>{
  try{const request=build();requests.push({kind,request,bytes:Buffer.byteLength(JSON.stringify(request.state)),sha256:sha256(request)});}
  catch(e){skipped.push({kind,reason:e instanceof Error?e.message:'unbuildable'});}
 };
 add('grounding',()=>jevRequest(groundingState(view as GroundingViewInput,reply.data),groundingQuestions()));
 const wake=coreWakeState(view as WakeViewInput);
 if(wake.messagesToCore.length)add('asks_core',()=>jevRequest(wake,{asks_core:asksCoreQuestion}));
 return {requests,skipped};
}

export type Annotation={attemptId:string;decisionId:string;kind:AnnotationKind;requestSha256:string;at:string;
 model?:string;answers?:Record<string,JevAnswer>;flags?:string[];costUSD?:number;error?:string;raw?:string};
export type AnnotationEvent=
 |{event:'skipped';decisionId:string;kind:AnnotationKind;reason:string;at:string}
 |{event:'attempted';attemptId:string;decisionId:string;kind:AnnotationKind;requestSha256:string;at:string}
 |({event:'received'|'result'|'failure'}&Annotation);

/** Flags: every noul at or above the reporting threshold, by question key. */
export function flagsOf(answers:Record<string,JevAnswer>|undefined,threshold=JEV_ANNOTATE_FLAG):string[]{
 return Object.entries(answers??{}).filter(([,a])=>a.type==='noul'&&a.noul>=threshold).map(([k])=>k);
}

const Billing=z.object({usage:z.object({cost:z.number().finite().nonnegative()})});

/** Sequential per turn, concurrent across turns, never throws out of `annotate`. */
export class JevAnnotator{
 private inflight=new Set<Promise<unknown>>();
 private counts={attempted:0,answered:0,failed:0,skipped:0,costUSD:0,flagged:Object.fromEntries([...groundingCategories,'asks_core'].map(k=>[k,0])) as Record<string,number>};
 constructor(private transport:AppraisalTransport,private budget:TrialBudget,private sink:(e:AnnotationEvent)=>Promise<void>|void=()=>{},private timeoutMs=8000){
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Invalid annotation timeout');
 }
 annotate(decisionId:string,mode:string,view:unknown,output:unknown,signal:AbortSignal=new AbortController().signal):Promise<Annotation[]>{
  const p=this.run(decisionId,mode,view,output,signal).catch(():Annotation[]=>[]);
  this.inflight.add(p);p.finally(()=>this.inflight.delete(p)).catch(()=>{});
  return p;
 }
 private async run(decisionId:string,mode:string,view:unknown,output:unknown,signal:AbortSignal):Promise<Annotation[]>{
  const out:Annotation[]=[];
  const {requests,skipped}=annotationRequests(mode,view,output);
  for(const s of skipped){this.counts.skipped++;await this.sink({event:'skipped',decisionId,kind:s.kind,reason:s.reason,at:new Date().toISOString()});}
  for(const r of requests){
   const attemptId=randomUUID(),at=new Date().toISOString();
   const base={attemptId,decisionId,kind:r.kind,requestSha256:r.sha256,at};
   let annotation:Annotation;
   try{
    signal.throwIfAborted();this.budget.assertHealthy();
    await this.sink({event:'attempted',...base});
    this.counts.attempted++;
    const id=this.budget.reserve(JEV_CALL_CEILING_USD);
    // A referenced timer, not AbortSignal.timeout: the host must not exit with a call pending.
    const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),this.timeoutMs);
    const bounded=AbortSignal.any([signal,timeout.signal]);
    let raw:unknown,transportError:unknown;
    // An already-cancelled call is never handed to the transport.
    try{if(signal.aborted)throw Error('cancelled');raw=await this.transport(r.request,bounded);}
    catch(e){transportError=bounded.aborted?Error(signal.aborted?'cancelled':'timeout'):e;}
    finally{clearTimeout(timer);}
    let receipt:Pick<Annotation,'raw'|'costUSD'>={};
    if(raw!==undefined){
     receipt={raw:JSON.stringify(raw)};
     const cost=Billing.safeParse(raw);if(cost.success)receipt.costUSD=cost.data.usage.cost;
     // The paid response is journaled before validation or ledger settlement can throw.
     await this.sink({event:'received',...base,...receipt});
    }
    try{
     if(transportError)throw transportError;
     const billing=Billing.safeParse(raw);if(billing.success)this.budget.settle(id,billing.data.usage.cost);
     const parsed=validateJevResponse(raw,r.request.questions);
     annotation={...base,model:parsed.model,answers:parsed.answers,flags:flagsOf(parsed.answers),...receipt};
    }catch(e){annotation={...base,error:e instanceof Error?e.message:'failed',...receipt};}
   }catch(e){
    // Budget exhausted or locked, cancelled before the call, or a sink failure: no call was made.
    annotation={...base,error:e instanceof Error?e.message:'failed'};
   }
   if(annotation.error){this.counts.failed++;}else{this.counts.answered++;for(const f of annotation.flags??[])this.counts.flagged[f]=(this.counts.flagged[f]??0)+1;}
   this.counts.costUSD+=annotation.costUSD??0;
   try{await this.sink({event:annotation.error?'failure':'result',...annotation});}catch{/* journaled as far as possible; never surfaces */}
   out.push(annotation);
  }
  return out;
 }
 summary(){return {version:jevAnnotateVersion,flagThreshold:JEV_ANNOTATE_FLAG,...structuredClone(this.counts)};}
 /** Wait for every in-flight annotation; used at drain and before the receipt is written. */
 async drain(){await Promise.allSettled([...this.inflight]);}
}

/** Durable append for the annotation journal (one JSON object per line). */
export async function appendAnnotation(path:string,e:AnnotationEvent&{runId:string}){
 const f=await open(path,'a',0o600);
 try{await f.writeFile(JSON.stringify(e)+'\n');await f.sync();}finally{await f.close();}
 const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}
}
