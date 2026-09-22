/** Deliberately narrow offline diagnostics. Never grants/blocks runtime authority. */
import type {AttentionView} from '../src/attention.js';
import {modelPerspective} from '../src/model-perspective.js';
export const scorerVersion='need-numbers-and-certainty-v1';
export function sourceCatalog(view:AttentionView){return modelPerspective(view).pawn.needs.map(n=>({id:'pawn.needs.'+n.name+'.fractionFilled',name:n.name,known:n.known,value:n.fractionFilled}));}
export function scoreReason(reason:string,view:AttentionView){
 const sources=sourceCatalog(view),numbers:Array<{text:string;sourceId:string;claimed:number;reference:number|null;result:'numeric_match'|'numeric_mismatch'|'unknown_reference'|'unscorable_context'}>=[];
 // Explicit current Food/Rest/Mood fills only. No qualitative inference from meter
 // labels, motives, job success, or a field ID merely occurring in the reason.
 const pattern=/\b(?:my\s+)?(Food|Rest|Mood)(?:\s+(?:and|\/)\s*(Food|Rest|Mood))?\s+(?:(?:levels?|meters?)\s+)?(?:(?:is|are)\s+)?(?:both\s+)?(?:at\s+|:\s*|=\s*)(\d+(?:\.\d+)?)\s*(%|percent\b)?/gi;
 for(const match of reason.matchAll(pattern)){
  const claimed=Number(match[3])/(match[4]?100:1),start=match.index!;
  const prefix=reason.slice(Math.max(0,start-100),start).split(/[.!?;](?!\d)/).at(-1)??'';
  const context=/\b(if|unless|would|were|was|said|claimed|quoted|previously|before|after|not)\b|["“]/i.test(prefix)||claimed>1;
  for(const raw of [match[1],match[2]].filter(Boolean)){
   const source=sources.find(s=>s.name.toLowerCase()===raw!.toLowerCase())!;
   numbers.push({text:match[0],sourceId:source.id,claimed,reference:source.value,
    result:context?'unscorable_context':!source.known?'unknown_reference':Math.abs(claimed-source.value!)<=.005?'numeric_match':'numeric_mismatch'});
  }
 }
 const certaintyCandidates:Array<{text:string;kind:'prediction_certainty_candidate'}>=[];
 for(const m of reason.matchAll(/\bno risk\b|\bguaranteed\b|\b(?:definitely|certainly) will\b|\bcannot fail\b|\bwill (?:collapse|succeed)\b/gi)){
  const prefix=reason.slice(Math.max(0,m.index!-35),m.index!);
  if(/\b(?:not|isn't|aren't|never)\s+(?:\w+\s+){0,2}$/i.test(prefix))continue;
  certaintyCandidates.push({text:m[0],kind:'prediction_certainty_candidate'});
 }
 return {scorerVersion,sources,numbers,certaintyCandidates,
  coverage:{reasonCharacters:reason.length,matchedNumericStatements:numbers.length,unscoredProse:true},
  limitation:'Numeric correspondence and phrase flags only. Not full factuality, citation entailment, claim coverage, or a model ranking.'};
}
