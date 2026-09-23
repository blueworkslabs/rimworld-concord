import {z} from 'zod';
import {SocialChoice,socialChoiceSchema} from './social.js';
import type {Domain,GameState,Pawn,EatOption} from './protocol.js';
import type {CoreQuestionView} from './core-planner.js';
export const CoreAnswerChoice=z.union([SocialChoice,z.object({choice:z.literal('eat'),thing:z.string().min(1).max(120),text:z.string().trim().min(1).max(240)}).strict()]);
export function eatingOptions(d:Domain,g:GameState,p:Pawn):EatOption[]{
 const ch=d.characters[p.id],v=p.eating;
 if(!ch||ch.commitment||ch.intention||p.downed||!v||v.epoch!==g.epoch||v.tick!==g.ticks||!Number.isInteger(v.mapId)||v.mapId<0||
 Object.values(d.proposals).some(q=>q.pawn===p.id&&(q.status==='pending'||(q.status==='countered'&&!q.replyId))))return [];
 return v.options.filter(a=>typeof a.thing==='string'&&a.thing.length>0&&a.thing.length<=120&&Number.isInteger(a.count)&&a.count>=1&&a.count<=25&&a.maxTicks===1800&&Number.isInteger(a.x)&&a.x>=0&&Number.isInteger(a.z)&&a.z>=0).slice(0,6);
}
export function coreAnswerSchema(v?:CoreQuestionView){
 const ids=v?.pawn.eating?.options.map(o=>o.thing)??[];
 return {oneOf:[...socialChoiceSchema.oneOf,...(ids.length?[{type:'object',additionalProperties:false,required:['choice','thing','text'],properties:{choice:{const:'eat'},thing:{type:'string',enum:ids},text:{type:'string',minLength:1,maxLength:240}}}]:[])]};
}
