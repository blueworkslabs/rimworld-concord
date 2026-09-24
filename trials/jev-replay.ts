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
 * Answers are stored verbatim; the report is arithmetic over them.
 */
import {z} from 'zod';
import type {AppraisalTransport, TrialBudget} from '../src/appraisal.js';
import {coreWakeQuestions,coreWakeState,groundingCategories,groundingQuestions,groundingState,jevRequest,JevResponse,JEV_CALL_CEILING_USD,jevQuestionsVersion,type CoreWakeState,type GroundingState,type JevAnswer,type JevRequest} from '../src/jev-questions.js';

export const jevReplayVersion='jev-replay-v1';

const Choice=z.object({topics:z.array(z.object({sourceId:z.string(),text:z.string(),status:z.string()})).default([]),
 actionTopicId:z.string().nullable().optional(),action:z.object({kind:z.string(),reason:z.string().default(''),text:z.string().optional()})});
type Choice=z.infer<typeof Choice>;

export type ReplayCase={
 index:number;tick:number;
 wake:CoreWakeState;
 /** The choice the model returned for this input, if it returned one. Applied or not. */
 returned?:Choice;applied:boolean;
 grounding?:GroundingState;
 /** What actually happened to each open topic, from the returned choice. */
 actualTopics:Record<string,'resolves'|'blocks'|'advances'|'unrelated'>;
 actualConsequential:boolean;
};

/** Reads the shape written by scripts/run-ongoing.mjs into docs/evidence/*.json. */
export function loadCases(evidence:unknown):ReplayCase[]{
 const live=z.object({live:z.object({coreInputs:z.array(z.object({mode:z.string(),view:z.any()})),
  coreBackendDecisions:z.array(z.object({status:z.string(),rawText:z.string().nullable().optional()})),
  publicAnswers:z.array(z.object({index:z.number(),mode:z.string(),output:z.any()}))})}).parse(evidence).live;
 const inputs=live.coreInputs.filter(i=>i.mode==='core');
 // Key order and optional fields differ between the raw return and the published copy.
 const canonical=(c:Choice)=>JSON.stringify({topics:c.topics.map(t=>[t.sourceId,t.status,t.text]).sort(),action:[c.action.kind,c.action.reason,c.action.text??'']});
 const applied=live.publicAnswers.filter(a=>a.mode==='core').flatMap(a=>{const p=Choice.safeParse(a.output);return p.success?[canonical(p.data)]:[];});
 return inputs.map((input,index)=>{
  const v=input.view,decision=live.coreBackendDecisions[index];
  let returned:Choice|undefined;
  if(decision?.status==='completed'&&decision.rawText){
   try{const raw=JSON.parse(decision.rawText);returned=Choice.parse(raw.core??raw);}catch{returned=undefined;}
  }
  const wake=coreWakeState(v);
  const actualTopics:ReplayCase['actualTopics']={};
  for(const t of wake.openTopics){
   const before=v.topics.find((x:{sourceId:string})=>x.sourceId===t.id),after=returned?.topics.find(x=>x.sourceId===t.id);
   actualTopics[t.key]=!after?'unrelated':after.status==='resolved'||after.status==='declined'?'resolves':after.status==='blocked'?'blocks':after.text!==before?.text?'advances':'unrelated';
  }
  const actualConsequential=!!returned&&(returned.action.kind!=='wait'||Object.values(actualTopics).some(x=>x!=='unrelated'));
  return {index,tick:v.tick,wake,returned,applied:!!returned&&applied.includes(canonical(returned)),
   ...(returned?{grounding:groundingState(v,returned)}:{}),actualTopics,actualConsequential};
 });
}

export type ReplayRequest={kind:'wake'|'grounding';index:number;request:JevRequest;bytes:number;questions:number};
export function buildRequests(cases:ReplayCase[]):ReplayRequest[]{
 const out:ReplayRequest[]=[];
 for(const c of cases){
  const wake=jevRequest(c.wake,coreWakeQuestions(c.wake));
  out.push({kind:'wake',index:c.index,request:wake,bytes:Buffer.byteLength(JSON.stringify(wake.state)),questions:Object.keys(wake.questions).length});
  if(c.grounding){const g=jevRequest(c.grounding,groundingQuestions());out.push({kind:'grounding',index:c.index,request:g,bytes:Buffer.byteLength(JSON.stringify(g.state)),questions:Object.keys(g.questions).length});}
 }
 return out;
}

export type ReplayAnswer={kind:'wake'|'grounding';index:number;model?:string;answers?:Record<string,JevAnswer>;costUSD?:number;error?:string};
/** One reservation per call, settled from the provider's receipt; failures keep their reservation. */
export async function runReplay(requests:ReplayRequest[],transport:AppraisalTransport,budget:TrialBudget,signal:AbortSignal,timeoutMs=8000):Promise<ReplayAnswer[]>{
 const out:ReplayAnswer[]=[];
 for(const r of requests){
  signal.throwIfAborted();budget.assertHealthy();
  const id=budget.reserve(JEV_CALL_CEILING_USD);
  const bounded=AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]);
  try{
   const raw=await transport(r.request,bounded);
   const billing=z.object({usage:z.object({cost:z.number().finite().nonnegative()})}).safeParse(raw);
   if(billing.success)budget.settle(id,billing.data.usage.cost);
   const parsed=JevResponse.parse(raw);
   out.push({kind:r.kind,index:r.index,model:parsed.model,answers:parsed.answers,...(billing.success?{costUSD:billing.data.usage.cost}:{})});
  }catch(e){out.push({kind:r.kind,index:r.index,error:e instanceof Error?e.message:'failed'});}
 }
 return out;
}

const noul=(a:Record<string,JevAnswer>|undefined,key:string)=>{const x=a?.[key];return x?.type==='noul'?x.noul:undefined;};
const pick=(a:Record<string,JevAnswer>|undefined,key:string)=>{const x=a?.[key];return x?.type==='choice'?{choice:x.choice,confidence:x.confidence}:undefined;};

export type ReplayReport=ReturnType<typeof report>;
export function report(cases:ReplayCase[],answers:ReplayAnswer[]){
 const wake=new Map(answers.filter(a=>a.kind==='wake').map(a=>[a.index,a]));
 const grounding=new Map(answers.filter(a=>a.kind==='grounding').map(a=>[a.index,a]));
 const turns=cases.map(c=>{const a=wake.get(c.index);return {index:c.index,tick:c.tick,returned:!!c.returned,applied:c.applied,actualAction:c.returned?.action.kind??null,actualConsequential:c.actualConsequential,
  worthTurn:noul(a?.answers,'worth_turn'),asksCore:noul(a?.answers,'asks_core'),error:a?.error,
  topics:c.wake.openTopics.map(t=>({key:t.key,id:t.id,actual:c.actualTopics[t.key],jev:pick(a?.answers,'topic_'+t.key)})),
  messages:c.wake.messagesToCore.map(m=>({key:m.key,jev:pick(a?.answers,'message_'+m.key)}))};});
 const scored=turns.filter(t=>t.worthTurn!==undefined);
 // Threshold curve: at t, Jev would defer turns with worth_turn < t. Avoidable = deferred and the
 // core changed nothing; missed = deferred and the core did something. Counterfactual only.
 const curve=[0.3,0.4,0.5,0.6,0.7,0.8,0.9].map(t=>{const deferred=scored.filter(x=>x.worthTurn!<t);return {threshold:t,deferred:deferred.length,avoidable:deferred.filter(x=>!x.actualConsequential).length,missed:deferred.filter(x=>x.actualConsequential).length};});
 const topicPairs=turns.flatMap(t=>t.topics.filter(x=>x.jev&&x.actual).map(x=>({actual:x.actual as string,jev:x.jev!.choice,confidence:x.jev!.confidence})));
 const confusion:Record<string,Record<string,number>>={};
 for(const p of topicPairs){const row=confusion[p.actual]??(confusion[p.actual]={});row[p.jev]=(row[p.jev]??0)+1;}
 const closureAgreement={resolvesPredicted:topicPairs.filter(p=>p.jev==='resolves').length,resolvesActual:topicPairs.filter(p=>p.actual==='resolves').length,
  resolvesAgreed:topicPairs.filter(p=>p.jev==='resolves'&&p.actual==='resolves').length,exactAgreement:topicPairs.length?topicPairs.filter(p=>p.jev===p.actual).length/topicPairs.length:null};
 const flags=cases.filter(c=>c.grounding).map(c=>{const a=grounding.get(c.index);return {index:c.index,tick:c.tick,applied:c.applied,error:a?.error,scores:Object.fromEntries(groundingCategories.map(k=>[k,noul(a?.answers,k)]))};});
 const perCategory=Object.fromEntries(groundingCategories.map(k=>{const s=flags.map(f=>f.scores[k]).filter((x):x is number=>x!==undefined);
  return [k,{scored:s.length,atOrAbove05:s.filter(x=>x>=0.5).length,atOrAbove08:s.filter(x=>x>=0.8).length,max:s.length?Math.max(...s):null,topTurns:flags.filter(f=>(f.scores[k]??0)>=0.5).map(f=>f.index)}];}));
 const cost=answers.reduce((s,a)=>s+(a.costUSD??0),0);
 return {version:{replay:jevReplayVersion,questions:jevQuestionsVersion},cases:cases.length,calls:answers.length,failed:answers.filter(a=>a.error).length,reportedCostUSD:cost,
  wake:{turns,curve,topicPairs:topicPairs.length,confusion,closureAgreement,coreWaits:turns.filter(t=>t.actualAction==='wait').length},
  grounding:{turns:flags,perCategory},
  caveats:['Counterfactual: deferring a turn changes later inputs; avoidable counts are upper bounds.','Agreement with the core is not correctness; the core made its own errors.','Thresholds here are unvalidated starting points; pick from these curves, then validate on held-out cases.']};
}
