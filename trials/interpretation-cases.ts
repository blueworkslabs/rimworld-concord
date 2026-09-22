/** Two-stage authored diagnostic, not a game trial or a forced-belief task. */
import {speechCases} from './speech-cases.js';
import {modelPrompt,pawnInstructions} from '../src/model-perspective.js';
import {claudeArgs} from '../src/claude-decision.js';
import type {AttentionView} from '../src/attention.js';
import type {Perspective} from '../src/protocol.js';
export const interpretationVersion='concord-interpretation-v1';
export function requestContract(mode:'reflection'|'decision',view:AttentionView|Perspective){
 const args=claudeArgs(mode,mode==='reflection'?view as AttentionView:undefined);
 return {instructions:pawnInstructions,prompt:JSON.stringify(modelPrompt(mode,view)),schema:JSON.parse(args[args.indexOf('--json-schema')+1]!)};
}
export function interpretationCases(){
 const base=structuredClone(speechCases()[0]!.view);
 const later:Perspective={pawn:structuredClone(base.pawn),character:structuredClone(base.character),proposal:structuredClone(base.proposals[0]!)};
 delete later.character.messages;
 const initial=structuredClone(base);initial.proposals=[];delete initial.character.messages;
 return [1,2,3].flatMap(repetition=>(repetition===2?['message','control']:['control','message']).map(condition=>{
  const reflection=structuredClone(initial);
  if(condition==='message')reflection.character.messages=[{id:'received-request',exchangeId:'authored-encounter',tick:35,from:'B',to:reflection.character.id,text:'Could you leave this load of wood for me? I want to finish what I started. It matters to me.'}];
  return {id:condition+'-r'+repetition,condition,repetition,reflection,later:structuredClone(later),reflectionRequest:requestContract('reflection',reflection)};
 }));
}
export function interpretationSuite(){return {version:interpretationVersion,authored:true,maxAttempts:12,caseTimeoutMs:60000,cases:interpretationCases(),laterRule:'Copy only the validated private outlook into the frozen later decision template. Recent message window is absent in both conditions; cited speech remains inside retained outlook evidence. No game action is applied.'};}
