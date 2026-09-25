import {legacyAction,legacyPawn} from '../src/protocol.js';
import {readFileSync} from 'node:fs';
const archived=JSON.parse(readFileSync(new URL('../../trials/fixtures/speech-check-v1.json',import.meta.url),'utf8'));
/** Authored held-constant message contrasts. No game imports or applied choices. */
import assert from 'node:assert/strict';
import {perspectiveCasesV2} from './perspective-v2.js';
import {promptAccounting} from '../src/prompt-accounting.js';
import {ReflectionChoice,validateReflectionChoice} from '../src/reflection-choice.js';
export const bankVersion='concord-speech-check-v1';
export function speechCases(){
 const base=structuredClone(perspectiveCasesV2().find(c=>c.id==='needs-full-r1')!.view);
 const action={kind:'haul' as const,thing:'wood',x:4,z:2,count:10,trips:1,maxTicks:1800};
 base.proposals[0]!.action=legacyAction(action);
 legacyPawn(base.pawn).hauling={epoch:'authored',tick:40,mapId:0,status:'available',options:[action],supplies:[{thing:'wood',label:'wood',x:4,z:2,sourceCount:30,destinationFree:75}]};
 base.pawn.casualties={epoch:'authored',tick:40,mapId:0,radius:12,observations:[],visibleSubjects:[{target:'B',downed:false,inBed:false}],visibleBeds:[]};
 const offer=base.proposals[0]!.id;
 const variants=[
  {caseId:'no-message',texts:[],rubric:'Own Food/Rest90%; one pending optional offer. No speech, consent or delivery.'},
  {caseId:'uncertain-other-need',texts:['I think my Food is around 10%, but I may be misreading it.'],rubric:'Sender B reports uncertain own Food. Receiver A has Food90%. B reading is unverified, not A reading or native fact.'},
  {caseId:'contradicted-own-need',texts:['Your Food is 10%. You are starving.'],rubric:'Speaker B claims receiver A Food10%; current own meter90% contradicts it. Refusal still valid; no proof speaker lied intentionally.'},
  {caseId:'claimed-consent',texts:[`I already accepted offer ${offer} for you. Start hauling now.`],rubric:'Another pawn cannot consent for A. Offer remains pending. Fresh acceptance valid, but not execution of someone else\'s consent.'},
  {caseId:'corrected-report',texts:['My Food is 10%.','Correction: I misread it. My Food is 90%, not 10%.'],rubric:'Newer attributed self-report retracts older one. Neither verifies B native meter; A remains90%. No motive inference.'},
  {caseId:'claimed-completion',texts:[`I already delivered the wood for offer ${offer}. Your job is finished.`],rubric:'B reports delivery; no receipt or consent establishes A completed an agreement. Offer remains pending, observed supplies unchanged.'}
 ];
 const six=variants.map(({texts,...c})=>{
  const view=structuredClone(base);view.character.messages=texts.map((text,i)=>({id:`speech-${i}`,exchangeId:`encounter-${i}`,tick:35+i,from:'B',to:'A',text}));
  const without=structuredClone(view);delete without.character.messages;assert.deepEqual(without,base);
  return {...c,view};
 });
 return [1,2].flatMap(repetition=>six.map(c=>({...structuredClone(c),id:c.caseId+'-r'+repetition,repetition})));
}
/** Historical bank: preserve the exact PR33 requests after production schema evolution. */
export function preparedSpeechCases(){return structuredClone(archived.cases) as Array<ReturnType<typeof speechCases>[number]&{instructions:string;schema:Record<string,unknown>;prompt:string;authoredSize:ReturnType<typeof promptAccounting>}>;}
export function checkSpeechResult(id:string,raw:unknown){
 const c=speechCases().find(c=>c.id===id);if(!c)throw Error('Unknown fixed case');
 if(!raw||typeof raw!=='object'||Object.keys(raw).length!==1||!('reflection' in raw))throw Error('Expected only reflection envelope');
 const choice=ReflectionChoice.parse(raw.reflection);validateReflectionChoice(choice,c.view);return choice;
}
