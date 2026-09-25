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
 try{const wake=coreWakeState(view as WakeViewInput);
  if(wake.messagesToCore.length)add('asks_core',()=>jevRequest(wake,{asks_core:asksCoreQuestion}));
 }catch(e){skipped.push({kind:'asks_core',reason:e instanceof Error?e.message:'unbuildable'});}
 return {requests,skipped};
}

export type Annotation={attemptId:string;decisionId:string;kind:AnnotationKind;requestSha256:string;at:string;ledgerAttemptId?:string;
 model?:string;answers?:Record<string,JevAnswer>;flags?:string[];costUSD?:number;error?:string;raw?:string};
export type AnnotationEvent=
 |{event:'skipped';decisionId:string;kind:AnnotationKind;reason:string;at:string}
 |{event:'attempted';attemptId:string;decisionId:string;kind:AnnotationKind;requestSha256:string;at:string;ledgerAttemptId:string}
 |({event:'received'|'result'|'failure'}&Annotation);

/** Flags: every noul at or above the reporting threshold, by question key. */
export function flagsOf(answers:Record<string,JevAnswer>|undefined,threshold=JEV_ANNOTATE_FLAG):string[]{
 return Object.entries(answers??{}).filter(([,a])=>a.type==='noul'&&a.noul>=threshold).map(([k])=>k);
}

const Billing=z.object({usage:z.object({cost:z.number().finite().nonnegative()})});

/** Sequential per turn, concurrent across turns, never throws out of `annotate`. */
export class JevAnnotator{
 private inflight=new Set<Promise<unknown>>();
 private journalFailed=false;
 private unjournaled:AnnotationEvent[]=[];
 private journalFailures=0;
 private async emit(event:AnnotationEvent):Promise<boolean>{
  try{await this.sink(event);return true;}catch{
   this.journalFailed=true;this.journalFailures++;this.unjournaled.push(structuredClone(event));return false;
  }
 }
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
  for(const s of skipped){this.counts.skipped++;await this.emit({event:'skipped',decisionId,kind:s.kind,reason:s.reason,at:new Date().toISOString()});}
  for(const r of requests){
   const base={attemptId:randomUUID(),decisionId,kind:r.kind,requestSha256:r.sha256,at:new Date().toISOString()};
   let annotation:Annotation={...base};
   try{
    if(signal.aborted)throw Error('cancelled');
    if(this.journalFailed)throw Error('Annotation journal unavailable');
    this.budget.assertHealthy();
    const id=this.budget.reserve(JEV_CALL_CEILING_USD);annotation.ledgerAttemptId=id;
    if(!await this.emit({event:'attempted',...base,ledgerAttemptId:id}))throw Error('Annotation journal unavailable');
    // Sink I/O may yield across cancellation. Count only actual transport invocations.
    if(signal.aborted)throw Error('cancelled');
    if(this.journalFailed)throw Error('Annotation journal unavailable');
    this.budget.assertHealthy();
    const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),this.timeoutMs);
    const bounded=AbortSignal.any([signal,timeout.signal]);
    let raw:unknown,transportError:unknown;
    try{this.counts.attempted++;raw=await this.transport(r.request,bounded);}
    catch(e){transportError=bounded.aborted?Error(signal.aborted?'cancelled':'timeout'):e;}
    finally{clearTimeout(timer);}
    let received=true;
    if(raw!==undefined){
     annotation.raw=JSON.stringify(raw);
     const billing=Billing.safeParse(raw);if(billing.success)annotation.costUSD=billing.data.usage.cost;
     // Retain paid bytes even if journaling fails; fallback is saved in the run receipt.
     received=await this.emit({event:'received',...annotation});
     // Billing is independent of journal/answer validity; an overrun must still lock.
     if(billing.success)this.budget.settle(id,billing.data.usage.cost);
    }
    if(!received)throw Error('Annotation journal unavailable');
    if(transportError)throw transportError;
    if(bounded.aborted)throw Error(signal.aborted?'cancelled':'timeout');
    const parsed=validateJevResponse(raw,r.request.questions);
    annotation={...annotation,model:parsed.model,answers:parsed.answers,flags:flagsOf(parsed.answers)};
   }catch(e){annotation.error=e instanceof Error?e.message:'failed';}
   if(!annotation.error&&!await this.emit({event:'result',...annotation}))annotation.error='Annotation journal unavailable';
   if(annotation.error){this.counts.failed++;await this.emit({event:'failure',...annotation});}
   else{this.counts.answered++;for(const f of annotation.flags??[])this.counts.flagged[f]=(this.counts.flagged[f]??0)+1;}
   this.counts.costUSD+=annotation.costUSD??0;out.push(annotation);
  }
  return out;
 }
 summary(){return {version:jevAnnotateVersion,flagThreshold:JEV_ANNOTATE_FLAG,...structuredClone(this.counts),journalFailures:this.journalFailures,unjournaled:structuredClone(this.unjournaled)};}
 /** Wait for every in-flight annotation; used at drain and before the receipt is written. */
 async drain(){await Promise.allSettled([...this.inflight]);}
}

/** Durable append for the annotation journal (one JSON object per line). */
export async function appendAnnotation(path:string,e:AnnotationEvent&{runId:string;backendDecisionId?:string}){
 const f=await open(path,'a',0o600);
 try{await f.writeFile(JSON.stringify(e)+'\n');await f.sync();}finally{await f.close();}
 const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}
}
