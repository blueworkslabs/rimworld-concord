import {z} from 'zod';
import {SocialChoice,socialChoiceSchema} from './social.js';
import type {Domain,GameState,Pawn,EatOption} from './protocol.js';
import type {CoreQuestionView} from './core-planner.js';
export const CoreAnswerChoice=z.union([SocialChoice,z.object({choice:z.literal('eat'),thing:z.string().min(1).max(120),text:z.string().trim().min(1).max(240)}).strict()]);
/** First failed coordinator check, not a guess about native food state. */
export function eatingBlock(d:Domain,g:GameState,p:Pawn){
 const ch=d.characters[p.id],v=p.eating;
 if(!ch)return 'unbound-pawn';
 if(ch.commitment)return 'existing-commitment';
 if(ch.intention)return 'existing-intention';
 if(p.downed)return 'pawn-downed';
 if(!v)return 'missing-eating-view';
 if(v.epoch!==g.epoch)return 'observation-epoch';
 if(v.tick!==g.ticks)return 'observation-tick';
 if(!Number.isInteger(v.mapId)||v.mapId<0)return 'observation-map';
 if(Object.values(d.proposals).some(q=>q.pawn===p.id&&(q.status==='pending'||(q.status==='countered'&&!q.replyId))))return 'unanswered-work-offer';
 return null;
}
export function eatingOptions(d:Domain,g:GameState,p:Pawn):EatOption[]{
 if(eatingBlock(d,g,p))return [];
 return p.eating!.options.filter(a=>typeof a.thing==='string'&&a.thing.length>0&&a.thing.length<=120&&Number.isInteger(a.count)&&a.count>=1&&a.count<=25&&a.maxTicks===1800&&Number.isInteger(a.x)&&a.x>=0&&Number.isInteger(a.z)&&a.z>=0).slice(0,6);
}
export function revalidateEating(d:Domain,g:GameState,p:Pawn,offered:Pawn,thing:string,bridgeAvailable:boolean){
 const original=offered.eating?.options.find(o=>o.thing===thing),current=eatingOptions(d,g,p).find(o=>o.thing===thing);
 const code=!bridgeAvailable?'bridge-unavailable':!original?'not-offered':eatingBlock(d,g,p)??(p.eating!.mapId!==offered.eating!.mapId?'map-changed':!current?'option-not-current':current.count>original.count?'portion-increased':null);
 return {layer:'coordinator' as const,code,thing,offeredTick:offered.eating?.tick??null,checkedTick:g.ticks,observationTick:p.eating?.tick??null,offeredMap:offered.eating?.mapId??null,currentMap:p.eating?.mapId??null,offeredCount:original?.count??null,currentCount:current?.count??null};
}
export class EatingRevalidationError extends Error {
 constructor(readonly validation:ReturnType<typeof revalidateEating>){super('Eating revalidation: '+validation.code);}
}
export function coreAnswerSchema(v?:CoreQuestionView){
 const ids=v?.pawn.eating?.options.map(o=>o.thing)??[];
 return {oneOf:[...socialChoiceSchema.oneOf,...(ids.length?[{type:'object',additionalProperties:false,required:['choice','thing','text'],properties:{choice:{const:'eat'},thing:{type:'string',enum:ids},text:{type:'string',minLength:1,maxLength:240}}}]:[])]};
}
