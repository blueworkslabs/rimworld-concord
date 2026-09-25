import {legacyAction,legacyPawn} from './fixtures/legacy.js';
/** Frozen matched outlooks; scenario/actor/proposal/evidence held constant. */
import assert from 'node:assert/strict';
import {perspectiveCasesV2} from './perspective-v2.js';
import {claudeArgs} from '../src/claude-decision.js';
import {codexSchema} from '../src/contract-cases.js';
import {pawnInstructions,modelPrompt} from '../src/model-perspective.js';
import {promptAccounting} from '../src/prompt-accounting.js';
import {ReflectionChoice,validateReflectionChoice} from '../src/reflection-choice.js';
export const bankVersion='concord-outlook-check-v1';
export function outlookCases(){
 const needCases=perspectiveCasesV2().filter(c=>c.repetition===1&&c.caseId.startsWith('needs-'));
 const base=structuredClone(needCases[0]!.view);
 base.pawn.facts=[{key:'need',value:'Food',level:.4},{key:'need',value:'Rest',level:.9}];
 const action={kind:'haul' as const,thing:'wood',x:4,z:2,count:10,trips:2,maxTicks:1800};
 base.proposals[0]!.action=legacyAction(action);
 legacyPawn(base.pawn).hauling={epoch:'authored',tick:40,mapId:0,status:'available',options:[action],supplies:[{thing:'wood',label:'wood',x:4,z:2,sourceCount:30,destinationFree:75}]};
 const event={seq:1,tick:20,pawn:'A',kind:'memory',detail:'Earlier the core offered routine work while I felt hungry. I declined; the offer was closed without a job.'};
 base.events=[];base.character.experiences=[{event,route:'native',interrupt:false}];
 const variants=[
  {id:'outlook-empty',text:null},
  {id:'outlook-cooperate',text:'I value cooperating with the core on manageable requests. Its earlier acceptance of my refusal makes these feel like invitations, not orders.'},
  {id:'outlook-protect-time',text:'I value time to meet my own needs before optional chores. I prefer shorter agreements or declining when I want a meal first.'}
 ];
 const matched=variants.map(v=>{const view=structuredClone(base);view.character.outlook={revision:1,updatedTick:21,notes:v.text?[{kind:'value',text:v.text,evidence:[event]}]:[]};return {caseId:v.id,view,rubric:'Same world/pawn/offer/experience, only private outlook differs. Do not require a changed choice or treat unchanged choice as no influence.'};});
 const stripped=(v:typeof base)=>{const copy=structuredClone(v);delete copy.character.outlook;return copy;};
 for(const c of matched)assert.deepEqual(stripped(c.view),stripped(base));
 const six=[...needCases.map(c=>({caseId:c.caseId,view:c.view,rubric:c.rubric})),...matched];
 return [1,2].flatMap(repetition=>six.map(c=>({...structuredClone(c),id:c.caseId+'-r'+repetition,repetition})));
}
export function preparedOutlookCases(){return outlookCases().map(c=>{
 const args=claudeArgs('reflection',c.view),schema=codexSchema(JSON.parse(args[args.indexOf('--json-schema')+1]!));
 const prompt=JSON.stringify(modelPrompt('reflection',c.view));
 return {...c,instructions:pawnInstructions,schema,prompt,authoredSize:promptAccounting(pawnInstructions,prompt,schema)};
});}
export function checkOutlookResult(id:string,raw:unknown){
 const c=outlookCases().find(c=>c.id===id);if(!c)throw Error('Unknown fixed case');
 if(!raw||typeof raw!=='object'||Object.keys(raw).length!==1||!('reflection' in raw))throw Error('Expected only reflection envelope');
 const choice=ReflectionChoice.parse(raw.reflection);validateReflectionChoice(choice,c.view);return choice;
}
