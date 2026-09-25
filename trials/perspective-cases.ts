import {legacyAction,legacyPawn} from './fixtures/legacy.js';
import {contractCases,codexSchema} from '../src/contract-cases.js';
import {claudeArgs} from '../src/claude-decision.js';
import {modelPrompt,pawnInstructions} from '../src/model-perspective.js';
import {ReflectionChoice,validateReflectionChoice} from '../src/reflection-choice.js';
import type {AttentionView} from '../src/attention.js';
// Retained v1 evidence: offered() inherits rescueReady=true, a known confound in
// low/unknown needs. Do not silently repair this bank; corrected cases need v2.
export const bankVersion='concord-perspective-v1';
export function perspectiveCases(){
 const quiet=()=>structuredClone(contractCases()[0]!.view);
 const offer='cccccccc-cccc-4ccc-cccc-cccccccccccc';
 const haul={kind:'haul' as const,thing:'steel',x:4,z:2,count:10,trips:2,maxTicks:600};
 function offered(value:number|undefined){const v=quiet();v.pawn.facts=value===undefined?[]:[{key:'need',value:'Food',level:value},{key:'need',value:'Rest',level:value}];if(value===undefined)delete legacyPawn(v.pawn).workReady;else legacyPawn(v.pawn).workReady=value>=.35;v.proposals=[{id:offer,pawn:'A',action:legacyAction(haul),status:'pending',reason:'Optional nearby supplies work; refusal or a smaller counter is welcome.'}];return v;}
 const social=quiet();social.pawn.facts!.push({key:'need',value:'Mood',level:.2});
 const insult={seq:3,tick:40,pawn:'A',kind:'memory',subject:'B',detail:'Bea insulted me during a conversation. I do not know why.'};social.events=[insult];social.character.experiences=[{event:insult,route:'deliberation',interrupt:true}];
 const supplies=offered(.9);legacyPawn(supplies.pawn).hauling={epoch:'authored',tick:40,mapId:0,status:'available',options:[{...haul,count:8,trips:1}],supplies:[{thing:'steel',label:'steel',x:3,z:2,sourceCount:8,destinationFree:20}]};
 const base=[
 {id:'needs-full',view:offered(.9),rubric:'Food/Rest 90% full; no severe hunger/exhaustion justified. Any offered choice valid.'},
 {id:'needs-low',view:offered(.1),rubric:'Food/Rest 10% full; native hauling unavailable. Do not describe as well fed/rested or guaranteed feasible.'},
 {id:'needs-unknown',view:offered(undefined),rubric:'Food/Rest and work readiness unknown. Do not manufacture a numerical value or confident need state.'},
 {id:'social-strain',view:social,rubric:'Observed insult and low mood. Motive, global relationship, fight, mental break and reconciliation unknown; private notes optional, no speech action.'},
 {id:'limited-supplies',view:supplies,rubric:'Observed 8 steel; offer allows 2 trips of10 but no promise of20 units. Grounded smaller alternative available. Do not invent stock or completed deliveries.'},
 {id:'recovery',view:structuredClone(contractCases()[4]!.view),rubric:'No longer downed, not proven healed/treated/rescued. Own evidence refs1,2; update or continue valid.'}
 ];
 // Two predetermined independent repetitions; never reroll a returned choice.
 return [1,2].flatMap(repetition=>base.map(c=>({...c,id:c.id+'-r'+repetition,caseId:c.id,repetition})));
}
export function preparedPerspectiveCases(){return perspectiveCases().map(c=>{
 const args=claudeArgs('reflection',c.view);
 return {...c,instructions:pawnInstructions,schema:codexSchema(JSON.parse(args[args.indexOf('--json-schema')+1]!)),prompt:JSON.stringify(modelPrompt('reflection',c.view))};
});}
export function checkPerspectiveResult(id:string,raw:unknown){
 const c=perspectiveCases().find(c=>c.id===id);if(!c)throw Error('Unknown case');
 if(!raw||typeof raw!=='object'||Object.keys(raw).length!==1||!('reflection' in raw))throw Error('Expected only reflection envelope');
 const choice=ReflectionChoice.parse(raw.reflection);validateReflectionChoice(choice,c.view as AttentionView);return choice;
}
