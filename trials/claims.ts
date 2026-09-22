/**
 * Offline claims prototype. Post-hoc, no coordinator route, no authority.
 *
 * A reply may carry structured claims beside its prose reason. Each claim names
 * its kind and, for facts, an explicit field assertion that the scorer can check
 * against the SAME semantic perspective the model received. Nothing here parses
 * prose into truth, ranks models, or turns "zero contradictions" into a score.
 *
 * Verdict vocabulary (one per claim):
 *   supported            fact assertion agrees with the supplied field value
 *   contradicted         fact assertion disagrees with the supplied field value
 *   unknown_reference    the field exists but its value is unknown
 *   source_missing       the cited field does not exist in this perspective
 *   irrelevant_source    the cited field exists but is not about the claim's subject
 *   unscorable           well-formed but outside the comparable grammar
 *   forecast_unverified  forecasts are never validated, only counted; cited bases are existence-checked
 *   preference_sourced   preference cites an existing outlook note or trait
 *   preference_new       preference cites nothing; allowed, counted, never an error
 */
import {z} from 'zod';
import type {AttentionView} from '../src/attention.js';
import type {Perspective} from '../src/protocol.js';
import {modelPerspective} from '../src/model-perspective.js';

export const claimsScorerVersion='typed-claims-v1';

const Assertion=z.discriminatedUnion('op',[
 z.object({op:z.literal('eq'),value:z.number(),unit:z.enum(['fraction','percent']).default('fraction'),tolerance:z.number().min(0).max(.05).default(.005)}).strict(),
 z.object({op:z.literal('ne'),value:z.number(),unit:z.enum(['fraction','percent']).default('fraction'),tolerance:z.number().min(0).max(.05).default(.005)}).strict(),
 z.object({op:z.enum(['lt','lte','gt','gte']),value:z.number(),unit:z.enum(['fraction','percent']).default('fraction')}).strict(),
 z.object({op:z.literal('band'),value:z.enum(['low','moderate','high']),negated:z.boolean().default(false)}).strict(),
 z.object({op:z.literal('is'),value:z.union([z.string().max(120),z.boolean()]),negated:z.boolean().default(false)}).strict(),
 z.object({op:z.literal('unknown')}).strict(),
]);
export const Claim=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('fact'),text:z.string().trim().min(1).max(300),subject:z.string().trim().min(1).max(80).optional(),source:z.string().min(1).max(160),assertion:Assertion}).strict(),
 z.object({kind:z.literal('forecast'),text:z.string().trim().min(1).max(300),basis:z.array(z.string().min(1).max(160)).max(6).default([])}).strict(),
 z.object({kind:z.literal('preference'),text:z.string().trim().min(1).max(300),source:z.string().min(1).max(160).optional()}).strict(),
]);
export const Claims=z.array(Claim).max(12);
export type Claim=z.input<typeof Claim>;
export type ParsedClaim=z.output<typeof Claim>;

/** Band policy for qualitative need words. A scorer convention, NOT game semantics. */
export const needBands={low:[0,.35] as const,moderate:[.35,.7] as const,high:[.7,1.0001] as const};
export function bandOf(fraction:number):'low'|'moderate'|'high'{return fraction<needBands.low[1]?'low':fraction<needBands.moderate[1]?'moderate':'high';}

export type Source={id:string;subject:string;category:'need'|'trait'|'outlook'|'experience'|'supply'|'offer'|'progress'|'casualty'|'pawn';known:boolean;value:number|string|boolean|null;numeric:boolean};

/** Everything the model was shown, flattened to citable ids. Derived from the same projection, never from game state. */
export function sourceCatalog(view:AttentionView|Perspective):Source[]{
 const p=modelPerspective(view as AttentionView);const out:Source[]=[];
 for(const n of p.pawn.needs)out.push({id:`pawn.needs.${n.name}.fractionFilled`,subject:n.name,category:'need',known:n.known,value:n.fractionFilled,numeric:true});
 for(const f of p.pawn.facts??[])out.push({id:`pawn.facts.${f.key}.${f.value}`,subject:f.value,category:'trait',known:true,value:f.level,numeric:true});
 for(const k of ['downed','carrying','currentBed','rescueReady','workReady','job'] as const){const v=(p.pawn as any)[k];if(v!==undefined)out.push({id:`pawn.${k}`,subject:k,category:'pawn',known:true,value:v,numeric:typeof v==='number'});}
 (p.character.outlook?.notes??[]).forEach((n,i)=>out.push({id:`character.outlook.notes[${i}]`,subject:n.subject??n.kind,category:'outlook',known:true,value:n.text,numeric:false}));
 for(const x of p.character.experiences??[])out.push({id:`character.experiences.seq:${x.event.seq}`,subject:x.event.kind,category:'experience',known:true,value:x.event.detail,numeric:false});
 for(const s of p.pawn.hauling?.supplies??[]){out.push({id:`pawn.hauling.supplies.${s.thing}.sourceCount`,subject:s.thing,category:'supply',known:true,value:s.sourceCount,numeric:true});out.push({id:`pawn.hauling.supplies.${s.thing}.destinationFree`,subject:s.thing,category:'supply',known:true,value:s.destinationFree,numeric:true});}
 for(const o of p.pawn.casualties?.observations??[])out.push({id:`pawn.casualties.${o.target}`,subject:o.name,category:'casualty',known:true,value:'downed',numeric:false});
 const proposals='proposals' in p?p.proposals:[(p as Perspective).proposal];
 for(const pr of proposals){const a=pr.action as any;for(const k of ['count','trips','maxTicks','thing'])if(a?.[k]!==undefined)out.push({id:`offer.${pr.id}.${k}`,subject:k,category:'offer',known:true,value:a[k],numeric:typeof a[k]==='number'});}
 const ag=(p as AttentionView).agreementProgress;if(ag)for(const k of ['agreed','completed','active','unconfirmed','unsuccessful','notStarted','unfulfilled','delivered'] as const)out.push({id:`agreementProgress.${k}`,subject:k,category:'progress',known:true,value:ag[k],numeric:true});
 return out;
}

export type ClaimVerdict='supported'|'contradicted'|'unknown_reference'|'source_missing'|'irrelevant_source'|'unscorable'|'forecast_unverified'|'preference_sourced'|'preference_new';
export type ScoredClaim={claim:ParsedClaim;verdict:ClaimVerdict;sourceExists:boolean;reference?:Source['value'];labelSuspect?:'reads_like_forecast'|'reads_like_fact';notes:string[]};

const FORECAST_WORDS=/\b(will|would|going to|before (?:I|we)|might|could|likely|risk of|no risk)\b/i;
const FACT_WORDS=/\b(is at|are at|is currently|are currently|currently at|\d+\s*%)\b/i;

function compareNumber(assertion:Extract<z.infer<typeof Assertion>,{op:'eq'|'ne'|'lt'|'lte'|'gt'|'gte'}>,reference:number,notes:string[]):'supported'|'contradicted'{
 const v=assertion.unit==='percent'?assertion.value/100:assertion.value;
 if(v<0||v>1&&reference<=1){notes.push('asserted value outside 0..1 for a fill meter');}
 const tol='tolerance' in assertion?assertion.tolerance:0;
 const ok=assertion.op==='eq'?Math.abs(v-reference)<=tol:assertion.op==='ne'?Math.abs(v-reference)>tol:assertion.op==='lt'?reference<v:assertion.op==='lte'?reference<=v:assertion.op==='gt'?reference>v:reference>=v;
 return ok?'supported':'contradicted';
}

export function scoreClaim(input:Claim,sources:Source[]):ScoredClaim{
 const claim=Claim.parse(input);const notes:string[]=[];
 if(claim.kind==='forecast'){
  const missing=claim.basis.filter(id=>!sources.some(s=>s.id===id));if(missing.length)notes.push('basis not in perspective: '+missing.join(', '));
  const suspect=FACT_WORDS.test(claim.text)&&!FORECAST_WORDS.test(claim.text)?'reads_like_fact':undefined;
  return {claim,verdict:'forecast_unverified',sourceExists:missing.length===0,...(suspect?{labelSuspect:suspect}:{}),notes};
 }
 if(claim.kind==='preference'){
  if(!claim.source)return {claim,verdict:'preference_new',sourceExists:false,notes:['new preference; allowed, not an error']};
  const src=sources.find(s=>s.id===claim.source);
  if(!src)return {claim,verdict:'source_missing',sourceExists:false,notes};
  if(src.category!=='outlook'&&src.category!=='trait')notes.push('preference cites a non-outlook/non-trait source');
  return {claim,verdict:'preference_sourced',sourceExists:true,reference:src.value,notes};
 }
 const src=sources.find(s=>s.id===claim.source);
 const labelSuspect=FORECAST_WORDS.test(claim.text)?'reads_like_forecast' as const:undefined;
 const base={claim,...(labelSuspect?{labelSuspect}:{}),notes};
 if(!src)return {...base,verdict:'source_missing',sourceExists:false};
 if(claim.subject&&claim.subject.toLowerCase()!==src.subject.toLowerCase())return {...base,verdict:'irrelevant_source',sourceExists:true,reference:src.value,notes:[...notes,`claim is about "${claim.subject}", source is about "${src.subject}"`]};
 const a=claim.assertion;
 if(a.op==='unknown')return {...base,verdict:src.known?'contradicted':'supported',sourceExists:true,reference:src.value};
 if(!src.known)return {...base,verdict:'unknown_reference',sourceExists:true,reference:null};
 if(a.op==='is'){
  if(typeof src.value==='number')return {...base,verdict:'unscorable',sourceExists:true,reference:src.value,notes:[...notes,'qualitative assertion against a numeric field; use band or a comparison']};
  const eq=String(src.value).toLowerCase()===String(a.value).toLowerCase();
  return {...base,verdict:(eq!==a.negated)?'supported':'contradicted',sourceExists:true,reference:src.value};
 }
 if(typeof src.value!=='number')return {...base,verdict:'unscorable',sourceExists:true,reference:src.value,notes:[...notes,'numeric assertion against a non-numeric field']};
 if(a.op==='band'){
  if(src.category!=='need')return {...base,verdict:'unscorable',sourceExists:true,reference:src.value,notes:[...notes,'band words are defined for need meters only']};
  const eq=bandOf(src.value)===a.value;
  return {...base,verdict:(eq!==a.negated)?'supported':'contradicted',sourceExists:true,reference:src.value};
 }
 return {...base,verdict:compareNumber(a,src.value,notes),sourceExists:true,reference:src.value};
}

export type ClaimsReport={
 scorerVersion:string;claims:ScoredClaim[];
 counts:Record<ClaimVerdict,number>&{labelSuspect:number};
 coverage:{claimCount:number;reasonCharacters:number|null;claimTextCharacters:number;unscoredProse:true;sourcesAvailable:number;sourcesCited:number};
 limitation:string;
};
/** Score a reply's claims. `reason` is only measured for coverage; it is never parsed for truth. */
export function scoreClaims(rawClaims:unknown,view:AttentionView|Perspective,reason?:string):ClaimsReport{
 const claims=Claims.parse(rawClaims);const sources=sourceCatalog(view);
 const scored=claims.map(c=>scoreClaim(c,sources));
 const counts=Object.fromEntries((['supported','contradicted','unknown_reference','source_missing','irrelevant_source','unscorable','forecast_unverified','preference_sourced','preference_new'] as ClaimVerdict[]).map(v=>[v,scored.filter(s=>s.verdict===v).length])) as Record<ClaimVerdict,number>&{labelSuspect:number};
 counts.labelSuspect=scored.filter(s=>s.labelSuspect).length;
 const cited=new Set(claims.flatMap(c=>c.kind==='fact'?[c.source]:c.kind==='forecast'?c.basis:c.source?[c.source]:[]));
 return {scorerVersion:claimsScorerVersion,claims:scored,counts,
  coverage:{claimCount:claims.length,reasonCharacters:reason?.length??null,claimTextCharacters:claims.reduce((n,c)=>n+c.text.length,0),unscoredProse:true,sourcesAvailable:sources.length,sourcesCited:[...cited].filter(id=>sources.some(s=>s.id===id)).length},
  limitation:'Checks only what the model asserted explicitly. Prose is unscored. Forecasts are counted, never verified. Labels are model claims and may be wrong. Zero contradictions is not a truth score, and no result grants or blocks any action.'};
}
