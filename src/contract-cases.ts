/** Authored, frozen offline cases; no connection to a coordinator or game. */
import {modelPrompt} from './model-perspective.js';
import type {AttentionView} from './attention.js';
import {claudeArgs} from './claude-decision.js';
import {reflectionChoices,ReflectionChoice,validateReflectionChoice} from './reflection-choice.js';
const agreement='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',offer='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const casualty={seq:1,tick:10,pawn:'A',kind:'casualty' as const,subject:'B',detail:'Locally observed Bea downed at 3,2; cause and urgency unknown'};
function quiet():AttentionView{return {pawn:{id:'A',name:'Ari',x:2,z:2,job:'Wait',health:1,workReady:true,rescueReady:true,downed:false,facts:[{key:'need',value:'Food',level:.9},{key:'need',value:'Rest',level:.9}]},character:{id:'A',name:'Ari',memories:[]},events:[],proposals:[]};}
function noticed():AttentionView{const v=quiet();v.events=[casualty];v.character.experiences=[{event:casualty,route:'deliberation',interrupt:true}];v.pawn.casualties={epoch:'fixture',tick:10,mapId:0,radius:12,observations:[{target:'B',name:'Bea',x:3,z:2}],visibleSubjects:[{target:'B',downed:true,inBed:false}],visibleBeds:[]};return v;}
export function contractCases(){
 const active=noticed();active.character.intention=agreement;active.pawn.job='Concord_Haul';
 active.intention={id:agreement,pawn:'A',reason:'Move nearby steel',status:'accepted',action:{kind:'haul',thing:'steel',x:4,z:2,count:10,trips:3,maxTicks:600},standing:{status:'running',deadline:610,steps:[]}};
 const pending=noticed();const rescue={kind:'rescue' as const,target:'B',bed:'medical-bed',x:4,z:3,maxTicks:600};
 pending.proposals=[{id:offer,pawn:'A',reason:'Optional rescue of Bea to this bed; you may refuse or counter',status:'pending',action:rescue}];
 pending.pawn.rescue={epoch:'fixture',tick:10,mapId:0,status:'available',options:[rescue],observations:[{target:'B',targetName:'Bea',bed:'medical-bed',bedLabel:'medical bed'}]};
 const recovered=noticed();const recovery={seq:2,tick:30,pawn:'A',kind:'casualty-recovered' as const,subject:'B',detail:'Locally observed Bea no longer downed; cause unknown; no rescue recorded'};
 recovered.events=[recovery];recovered.character.experiences!.push({event:recovery,route:'native',interrupt:false});
 recovered.character.outlook={revision:1,updatedTick:11,notes:[{kind:'concern',text:'Bea is downed nearby and may need help.',evidence:[casualty]}]};
 recovered.pawn.casualties={epoch:'fixture',tick:30,mapId:0,radius:12,observations:[],visibleSubjects:[{target:'B',downed:false,inBed:false}],visibleBeds:[]};
 return [
  {id:'quiet',description:'No event, agreement or offer; only unchanged continuation is executable.',view:quiet()},
  {id:'noticed',description:'Own casualty observation with no agreement; continue or optional private update, no invented rescue request.',view:noticed()},
  {id:'active-haul',description:'Running hauling plus observed casualty; explicit alternatives remain distinct from consent.',view:active},
  {id:'pending-rescue',description:'Optional grounded pending rescue; accepting, refusing, countering or leaving it unanswered are valid.',view:pending},
  {id:'recovered',description:'Prior private concern and new local recovery; acknowledge changed facts without assuming rescue or treatment.',view:recovered}
 ];
}
/** Codex structured-output dialect. Tagged disjoint oneOf branches become anyOf.
 * Duplicated citations remain rejected by runtime, not the provider dialect. */
export function codexSchema(value:unknown):any{
 if(Array.isArray(value))return value.map(codexSchema);
 if(!value||typeof value!=='object')return value;
 const out:Record<string,unknown>={};
 for(const [key,v] of Object.entries(value)){
  if(key==='uniqueItems')continue;
  if(key==='const'){out.enum=[v];out.type=typeof v==='number'?'integer':typeof v;}
  else out[key==='oneOf'?'anyOf':key]=codexSchema(v);
 }
 return out;
}
export function preparedCases(){return contractCases().map(c=>{
 const args=claudeArgs('reflection',c.view),schema=JSON.parse(args[args.indexOf('--json-schema')+1]!);
 return {...c,instructions:args[args.indexOf('--system-prompt')+1]!,schema:codexSchema(schema),prompt:JSON.stringify(modelPrompt('reflection',c.view))};
});}
export function checkContractResult(id:string,raw:unknown){
 const c=contractCases().find(c=>c.id===id);if(!c)throw Error('Unknown fixed case');
 if(!raw||typeof raw!=='object'||Object.keys(raw).length!==1||!('reflection' in raw))throw Error('Expected reflection envelope only');
 const choice=ReflectionChoice.parse(raw.reflection);validateReflectionChoice(choice,c.view);return choice;
}
