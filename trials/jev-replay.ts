/**
 * Offline Jev replay over recorded core turns. No game, no coordinator route, no authority.
 *
 * Two uses, both read-only:
 *  - core wake gating and topic bookkeeping: would a cheap "worth a turn" judgment have
 *    deferred turns that changed nothing, and do per-topic judgments agree with what the
 *    core actually did to its topics;
 *  - prose grounding: flag counts per category over the core's own replies, beside the
 *    records it was given. Annotate and count only; nothing is gated.
 *
 * Inputs are the public core inputs and returned choices already in docs/evidence.
 * Every attempt is persisted before and after its call; answers are stored verbatim;
 * the report is arithmetic over them. Turns whose returned choice is missing or does
 * not align with its input are unknown, never avoidable.
 */
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {AppraisalTransport, TrialBudget} from '../src/appraisal.js';
import {coreWakeQuestions,coreWakeState,groundingCategories,groundingQuestions,groundingState,jevRequest,validateJevResponse,JEV_CALL_CEILING_USD,JEV_EXPECTED_MODEL,jevQuestionsVersion,type CoreWakeState,type GroundingState,type JevAnswer,type JevRequest} from '../src/jev-questions.js';

export const jevReplayVersion='jev-replay-v2';
export const sha256=(x:unknown)=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');

const Choice=z.object({topics:z.array(z.object({sourceId:z.string(),text:z.string(),status:z.string()})).default([]),
 actionTopicId:z.string().nullable().optional(),action:z.object({kind:z.string(),reason:z.string().default(''),text:z.string().optional(),pawn:z.string().optional(),opportunityId:z.string().optional(),proposalId:z.string().optional()})});
type Choice=z.infer<typeof Choice>;
export type TopicEffect='resolves'|'blocks'|'advances'|'unrelated';

export type ReplayCase={
 index:number;tick:number;decisionId?:string;
 wake:CoreWakeState;
 /** The choice returned for this input, only if it structurally fits this input. */
 returned?:Choice;
 alignment:'aligned'|'misaligned'|'none';
 applied:'yes'|'no'|'ambiguous'|'unknown';
 grounding?:GroundingState;
 /** What actually happened to each open topic, from the aligned returned choice. */
 actualTopics:Record<string,TopicEffect>;newTopics:string[];
 /** null when the turn returned nothing usable: unknown, excluded from denominators. */
 actualConsequential:boolean|null;
};

/** Full action identity, so identical prose to different pawns or targets stays distinct. */
const canonical=(c:Choice)=>JSON.stringify({topics:c.topics.map(t=>[t.sourceId,t.status,t.text]).sort(),actionTopicId:c.actionTopicId??null,
 action:[c.action.kind,c.action.reason,c.action.text??'',c.action.pawn??'',c.action.opportunityId??'',c.action.proposalId??'']});

/** A returned choice belongs to an input only if every id it names exists in that input. */
function alignedWith(c:Choice,v:any):boolean{
 const sources=new Set<string>([v.brief?.id,...(v.messages??[]).map((m:any)=>m.id),...(v.agreements??[]).map((p:any)=>p.id),...(v.requests??[]).map((r:any)=>r.id),
  ...(v.topics??[]).map((t:any)=>t.sourceId),...(v.opportunities??[]).map((o:any)=>o.id),...(v.reoffers??[]).map((r:any)=>r.id),...(v.selfCare??[]).map((a:any)=>a.id)]);
 if(c.topics.some(t=>!sources.has(t.sourceId)))return false;
 if(c.actionTopicId&&!sources.has(c.actionTopicId))return false;
 const a=c.action;
 if(a.kind==='ask'&&!(v.questionRecipients??[]).includes(a.pawn))return false;
 if(a.kind==='propose'&&!(v.opportunities??[]).some((o:any)=>o.id===a.opportunityId))return false;
 if(a.kind==='adopt_counter'&&!(v.counters??[]).some((p:any)=>p.id===a.proposalId))return false;
 return ['wait','ask','propose','adopt_counter'].includes(a.kind);
}

/** Reads the shape written by scripts/run-ongoing.mjs into docs/evidence/*.json.
 * Inputs and backend decisions are recorded in the same order; that order is only trusted
 * when the counts match and each returned choice structurally fits its input. */
export function loadCases(evidence:unknown):ReplayCase[]{
 const live=z.object({live:z.object({coreInputs:z.array(z.object({mode:z.string(),view:z.any()})),
  coreBackendDecisions:z.array(z.object({id:z.string().optional(),mode:z.string().optional(),status:z.string(),rawText:z.string().nullable().optional()})),
  publicAnswers:z.array(z.object({index:z.number(),mode:z.string(),output:z.any()}))})}).parse(evidence).live;
 const inputs=live.coreInputs.filter(i=>i.mode==='core'),decisions=live.coreBackendDecisions.filter(d=>!d.mode||d.mode==='core');
 if(inputs.length!==decisions.length)throw Error(`Cannot pair ${inputs.length} core inputs with ${decisions.length} core decisions; a pairing manifest is required`);
 const published=new Map<string,number>();
 for(const a of live.publicAnswers.filter(a=>a.mode==='core')){const p=Choice.safeParse(a.output);if(p.success){const k=canonical(p.data);published.set(k,(published.get(k)??0)+1);}}
 const returnedKeys=new Map<string,number>();
 const parsed=inputs.map((input,index)=>{
  const decision=decisions[index]!;let returned:Choice|undefined;
  if(decision.status==='completed'&&decision.rawText){try{const raw=JSON.parse(decision.rawText);returned=Choice.parse(raw.core??raw);}catch{returned=undefined;}}
  const alignment:ReplayCase['alignment']=!returned?'none':alignedWith(returned,input.view)?'aligned':'misaligned';
  if(returned&&alignment==='aligned'){const k=canonical(returned);returnedKeys.set(k,(returnedKeys.get(k)??0)+1);}
  return {input,decision,returned,alignment};
 });
 return parsed.map(({input,decision,returned,alignment},index)=>{
  const v=input.view,wake=coreWakeState(v);
  const usable=alignment==='aligned'?returned:undefined;
  const actualTopics:Record<string,TopicEffect>={};
  for(const t of wake.openTopics){
   const before=v.topics.find((x:{sourceId:string})=>x.sourceId===t.id),after=usable?.topics.find(x=>x.sourceId===t.id);
   actualTopics[t.key]=!after||!before?'unrelated':['resolved','declined'].includes(after.status)?'resolves':after.status==='blocked'&&before.status!=='blocked'?'blocks':after.status!==before.status||after.text!==before.text?'advances':'unrelated';
  }
  const newTopics=usable?usable.topics.filter(t=>!v.topics.some((x:{sourceId:string})=>x.sourceId===t.sourceId)).map(t=>t.sourceId):[];
  const actualConsequential=usable?usable.action.kind!=='wait'||Object.values(actualTopics).some(x=>x!=='unrelated')||newTopics.length>0:null;
  let applied:ReplayCase['applied']='unknown';
  if(usable){const k=canonical(usable),n=published.get(k)??0;applied=n===0?'no':n===1&&returnedKeys.get(k)===1?'yes':'ambiguous';}
  return {index,tick:v.tick,...(decision.id?{decisionId:decision.id}:{}),wake,...(usable?{returned:usable}:{}),alignment,applied,
   ...(usable?{grounding:groundingState(v,usable)}:{}),actualTopics,newTopics,actualConsequential};
 });
}

export type ReplayRequest={kind:'wake'|'grounding';index:number;request:JevRequest;bytes:number;questions:number;sha256:string};
export function buildRequests(cases:ReplayCase[]):ReplayRequest[]{
 const out:ReplayRequest[]=[];
 const add=(kind:ReplayRequest['kind'],index:number,request:JevRequest)=>out.push({kind,index,request,bytes:Buffer.byteLength(JSON.stringify(request.state)),questions:Object.keys(request.questions).length,sha256:sha256(request)});
 for(const c of cases){
  add('wake',c.index,jevRequest(c.wake,coreWakeQuestions(c.wake)));
  if(c.grounding)add('grounding',c.index,jevRequest(c.grounding,groundingQuestions()));
 }
 return out;
}

export type ReplayAnswer={attemptId:string;kind:'wake'|'grounding';index:number;requestSha256:string;at:string;model?:string;answers?:Record<string,JevAnswer>;costUSD?:number;error?:string;raw?:string};
export type AttemptEvent={event:'attempted';attemptId:string;kind:'wake'|'grounding';index:number;requestSha256:string;at:string}|({event:'result'|'failure'}&ReplayAnswer);
/** One reservation per call, settled from the provider's receipt; failures keep their reservation.
 * The sink receives every attempt before its call and every outcome after, so an interruption
 * never loses a paid answer. Each slot runs at most once. */
export async function runReplay(requests:ReplayRequest[],transport:AppraisalTransport,budget:TrialBudget,signal:AbortSignal,sink:(e:AttemptEvent)=>Promise<void>|void=()=>{},timeoutMs=8000):Promise<ReplayAnswer[]>{
 const out:ReplayAnswer[]=[],slots=new Set<string>();
 for(const r of requests){
  const slot=r.kind+':'+r.index;if(slots.has(slot))throw Error(`Duplicate replay slot ${slot}`);slots.add(slot);
  signal.throwIfAborted();budget.assertHealthy();
  const attemptId=randomUUID(),at=new Date().toISOString();
  await sink({event:'attempted',attemptId,kind:r.kind,index:r.index,requestSha256:r.sha256,at});
  const id=budget.reserve(JEV_CALL_CEILING_USD);
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]);
  let raw:unknown;
  try{
   raw=await transport(r.request,bounded);
   const billing=z.object({usage:z.object({cost:z.number().finite().nonnegative()})}).safeParse(raw);
   if(billing.success)budget.settle(id,billing.data.usage.cost);
   const parsed=validateJevResponse(raw,r.request.questions);
   const answer:ReplayAnswer={attemptId,kind:r.kind,index:r.index,requestSha256:r.sha256,at,model:parsed.model,answers:parsed.answers,...(billing.success?{costUSD:billing.data.usage.cost}:{})};
   out.push(answer);await sink({event:'result',...answer});
  }catch(e){
   // Keep whatever came back: a paid answer that failed the contract is still evidence.
   const kept=raw===undefined?{}:{raw:JSON.stringify(raw).slice(0,8000)};
   const answer:ReplayAnswer={attemptId,kind:r.kind,index:r.index,requestSha256:r.sha256,at,error:e instanceof Error?e.message:'failed',...kept};
   out.push(answer);await sink({event:'failure',...answer});
   if(/locked|exhausted/.test(answer.error!))break;
  }
 }
 return out;
}

const noul=(a:Record<string,JevAnswer>|undefined,key:string)=>{const x=a?.[key];return x?.type==='noul'?x.noul:undefined;};
const pick=(a:Record<string,JevAnswer>|undefined,key:string)=>{const x=a?.[key];return x?.type==='choice'?{choice:x.choice,confidence:x.confidence}:undefined;};

export type ReplayReport=ReturnType<typeof report>;
export function report(cases:ReplayCase[],answers:ReplayAnswer[]){
 const wake=new Map(answers.filter(a=>a.kind==='wake'&&!a.error).map(a=>[a.index,a]));
 const grounding=new Map(answers.filter(a=>a.kind==='grounding'&&!a.error).map(a=>[a.index,a]));
 const turns=cases.map(c=>{const a=wake.get(c.index);return {index:c.index,tick:c.tick,alignment:c.alignment,applied:c.applied,actualAction:c.returned?.action.kind??null,actualConsequential:c.actualConsequential,newTopics:c.newTopics.length,
  worthTurn:noul(a?.answers,'worth_turn'),asksCore:noul(a?.answers,'asks_core'),
  topics:c.wake.openTopics.map(t=>({key:t.key,id:t.id,actual:c.actualConsequential===null?null:c.actualTopics[t.key]??null,jev:pick(a?.answers,'topic_'+t.key)})),
  messages:c.wake.messagesToCore.map(m=>({key:m.key,jev:pick(a?.answers,'message_'+m.key)}))};});
 const known=turns.filter(t=>t.worthTurn!==undefined&&t.actualConsequential!==null);
 const unknown={noWakeAnswer:turns.filter(t=>t.worthTurn===undefined).length,noUsableChoice:turns.filter(t=>t.actualConsequential===null).length,misaligned:cases.filter(c=>c.alignment==='misaligned').length,ambiguousApplied:cases.filter(c=>c.applied==='ambiguous').length};
 // Threshold curve over turns with a known consequence only. At t, Jev would defer turns with
 // worth_turn < t. Avoidable = deferred and the core changed nothing; missed = deferred and the
 // core did something. Counterfactual: deferring a turn changes later inputs.
 const curve=[0.3,0.4,0.5,0.6,0.7,0.8,0.9].map(t=>{const deferred=known.filter(x=>x.worthTurn!<t);return {threshold:t,scored:known.length,deferred:deferred.length,avoidable:deferred.filter(x=>!x.actualConsequential).length,missed:deferred.filter(x=>x.actualConsequential).length};});
 const topicPairs=turns.flatMap(t=>t.topics.filter(x=>x.jev&&x.actual).map(x=>({actual:x.actual as TopicEffect,jev:x.jev!.choice,confidence:x.jev!.confidence})));
 const confusion:Record<string,Record<string,number>>={};
 for(const p of topicPairs){const row=confusion[p.actual]??(confusion[p.actual]={});row[p.jev]=(row[p.jev]??0)+1;}
 const closureAgreement={resolvesPredicted:topicPairs.filter(p=>p.jev==='resolves').length,resolvesActual:topicPairs.filter(p=>p.actual==='resolves').length,
  resolvesAgreed:topicPairs.filter(p=>p.jev==='resolves'&&p.actual==='resolves').length,exactAgreement:topicPairs.length?topicPairs.filter(p=>p.jev===p.actual).length/topicPairs.length:null};
 const flags=cases.filter(c=>c.grounding).map(c=>{const a=grounding.get(c.index);return {index:c.index,tick:c.tick,applied:c.applied,answered:!!a,scores:Object.fromEntries(groundingCategories.map(k=>[k,noul(a?.answers,k)]))};});
 const perCategory=Object.fromEntries(groundingCategories.map(k=>{const s=flags.map(f=>f.scores[k]).filter((x):x is number=>x!==undefined);
  return [k,{scored:s.length,atOrAbove05:s.filter(x=>x>=0.5).length,atOrAbove08:s.filter(x=>x>=0.8).length,max:s.length?Math.max(...s):null,topTurns:flags.filter(f=>(f.scores[k]??0)>=0.5).map(f=>f.index)}];}));
 const cost=answers.reduce((s,a)=>s+(a.costUSD??0),0);
 return {version:{replay:jevReplayVersion,questions:jevQuestionsVersion,expectedModel:JEV_EXPECTED_MODEL},cases:cases.length,calls:answers.length,failed:answers.filter(a=>a.error).length,reportedCostUSD:cost,
  unknown,wake:{turns,curve,topicPairs:topicPairs.length,confusion,closureAgreement,coreWaits:turns.filter(t=>t.actualAction==='wait').length},
  grounding:{turns:flags,perCategory},
  caveats:['Counterfactual: deferring a turn changes later inputs; avoidable counts are upper bounds.','Turns without a usable returned choice are unknown and excluded from the curve; their count is in `unknown`.','Agreement with the core is not correctness; the core made its own errors.','Thresholds here are unvalidated starting points; pick from these curves, then validate on held-out cases.']};
}
