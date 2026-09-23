import {OutlookUpdate,outlookEvidence,outlookMessages,reviseOutlook} from './outlook.js';
import {z} from 'zod';
import {Decision} from './protocol.js';
import type {AttentionView,Reflection} from './attention.js';

/** Provider vocabulary; canonical coordinator actions and persisted history stay unchanged. */
export const ReflectionChoice=z.discriminatedUnion('choice',[
 z.object({choice:z.literal('revise_private_outlook'),update:OutlookUpdate,reason:z.string().min(1).max(1000)}).strict(),
 z.object({choice:z.literal('request_rescue_alternative'),agreementId:z.string().uuid(),target:z.string().min(1).max(120),reason:z.string().min(1).max(1000)}).strict(),
 z.object({choice:z.literal('keep_current_activity'),reason:z.string().min(1).max(1000)}).strict(),
 z.object({choice:z.literal('withdraw_current_agreement'),agreementId:z.string().uuid(),reason:z.string().min(1).max(1000)}).strict(),
 z.object({choice:z.literal('answer_pending_proposal'),proposalId:z.string().uuid(),decision:Decision}).strict()
]);
export type ReflectionChoice=z.infer<typeof ReflectionChoice>;

export function reflectionChoices(view:AttentionView){
 const choices:Array<Record<string,unknown>>=[{choice:'keep_current_activity',effect:'Leave current agreement/native activity unchanged. No new consent or job.'}];
 const received=outlookMessages(view.character);
 if(outlookEvidence(view.character).length||received.length||view.character.outlook)choices.push({choice:'revise_private_outlook',expectedRevision:view.character.outlook?.revision??0,...(received.length?{receivedMessages:received.map(m=>({id:m.id,from:m.from,to:m.to,tick:m.tick})),messageEvidenceRule:'Alternatively cite messageIds from receivedMessages on a note, instead of evidenceSeqs. These preserve exactly what the sender said, not proof it is true. A message-based stance names a cited sender, not someone mentioned in their text. Retain attribution and uncertainty; a note may be revised or removed. No automatic belief change or authority.'}:{}),evidence:outlookEvidence(view.character).map(e=>({seq:e.seq,...(e.subject?{subject:e.subject}:{})})),effect:'Replace only your private outlook; no speech, trait edit, withdrawal, consent or job. Cite own supplied experiences or retained evidence. The whole notes array replaces the previous outlook: retain still-relevant notes or revise/remove them. At most four notes. A stance must name a subject in its cited evidence. expectedRevision must match the supplied revision. Updates and their reasons stay private and are optional; do not manufacture a change.'});
 if(view.intention&&view.intention.id===view.character.intention&&view.intention.pawn===view.pawn.id&&view.intention.standing?.status==='running')
  choices.push({choice:'withdraw_current_agreement',agreementId:view.intention.id,effect:'Stop this agreement only. No replacement work is authorized.'});
 if(view.intention&&view.intention.id===view.character.intention&&view.intention.pawn===view.pawn.id&&view.intention.action.kind==='haul'&&view.intention.standing?.status==='running'&&!(view.requests??[]).some(r=>r.agreementId===view.intention!.id)){
  const targetIds=view.pawn.casualties?.observations.map(t=>t.target)??[];
  if(targetIds.length)choices.push({choice:'request_rescue_alternative',agreementId:view.intention.id,targetIds,effect:'Ask for a rescue alternative; keep the hauling agreement unchanged unless a replacement is accepted; if hauling completes first, rescue still needs a separate offer and fresh consent.'});
 }
 if(!view.character.intention&&!view.character.commitment){
  const proposalIds=view.proposals.filter(p=>p.pawn===view.pawn.id&&p.status==='pending').map(p=>p.id);
  if(proposalIds.length)choices.push({choice:'answer_pending_proposal',proposalIds,effect:'Accept, refuse, defer or counter one listed offer. A counter executes nothing.'});
 }
 return choices;
}
export function validateReflectionChoice(choice:ReflectionChoice,view:AttentionView){
 if(choice.choice==='revise_private_outlook')reviseOutlook(view.character,choice.update,view.pawn.casualties?.tick??0);
 const allowed=reflectionChoices(view).find(x=>x.choice===choice.choice);
 if(!allowed||choice.choice==='withdraw_current_agreement'&&allowed.agreementId!==choice.agreementId||
  choice.choice==='request_rescue_alternative'&&(allowed.agreementId!==choice.agreementId||!(allowed.targetIds as string[]).includes(choice.target))||
  choice.choice==='answer_pending_proposal'&&!(allowed.proposalIds as string[]).includes(choice.proposalId))throw Error('Reflection choice outside supplied scope');
}
export function reflectionFromChoice(choice:ReflectionChoice):Reflection {
 switch(choice.choice){
  case 'revise_private_outlook':return {kind:'revise_outlook',update:choice.update,reason:choice.reason};
  case 'request_rescue_alternative':return {kind:'request_rescue',agreementId:choice.agreementId,target:choice.target,reason:choice.reason};
  case 'keep_current_activity':return {kind:'continue',reason:choice.reason};
  case 'withdraw_current_agreement':return {kind:'withdraw',reason:choice.reason};
  case 'answer_pending_proposal':return {kind:'proposal',proposalId:choice.proposalId,decision:choice.decision};
 }
}

/** Snapshot-specific provider contract. Runtime validation remains authoritative,
 * especially for subject/evidence correlation and changes while inference runs. */
export function reflectionChoiceSchema(view:AttentionView,decisionSchema:Record<string,unknown>){
 const reason={type:'string',minLength:1,maxLength:1000};
 const oneOf=reflectionChoices(view).map(c=>{
  const properties:Record<string,unknown>={choice:{const:c.choice}};
  const required=['choice'];
  switch(c.choice){
   case 'revise_private_outlook':{
    const evidence=outlookEvidence(view.character),seqs=evidence.map(e=>e.seq);
    const subjects=[...new Set(evidence.flatMap(e=>e.subject?[e.subject]:[]))];
    const fields={text:{type:'string',minLength:1,maxLength:240},evidenceSeqs:{type:'array',minItems:1,maxItems:3,uniqueItems:true,items:{type:'integer',enum:seqs}}};
    const notes:Array<Record<string,unknown>>=[{type:'object',additionalProperties:false,required:['kind','text','evidenceSeqs'],properties:{kind:{enum:['value','concern']},...fields}}];
    if(!seqs.length)notes.length=0;
    if(subjects.length)notes.push({type:'object',additionalProperties:false,required:['kind','text','subject','evidenceSeqs'],properties:{kind:{const:'stance'},subject:{type:'string',enum:subjects},...fields}});
    const messages=outlookMessages(view.character);
    if(messages.length){
     const fields={text:{type:'string',minLength:1,maxLength:240},messageIds:{type:'array',minItems:1,maxItems:3,uniqueItems:true,items:{type:'string',enum:messages.map(m=>m.id)}}};
     notes.push({type:'object',additionalProperties:false,required:['kind','text','messageIds'],properties:{kind:{enum:['value','concern']},...fields}},
      {type:'object',additionalProperties:false,required:['kind','text','subject','messageIds'],properties:{kind:{const:'stance'},subject:{type:'string',enum:[...new Set(messages.map(m=>m.from))]},...fields}});
    }
    // Empty outlooks can still be cleared/revised without fabricating evidence.
    properties.update={type:'object',additionalProperties:false,required:['expectedRevision','notes'],properties:{expectedRevision:{const:c.expectedRevision},notes:seqs.length||messages.length?{type:'array',maxItems:4,items:{oneOf:notes}}:{type:'array',maxItems:0,items:{type:'object',additionalProperties:false,properties:{}}}}};
    required.push('update');break;
   }
   case 'request_rescue_alternative':
    properties.target={type:'string',enum:c.targetIds};required.push('target');
    properties.agreementId={type:'string',const:c.agreementId};required.push('agreementId');break;
   case 'withdraw_current_agreement':
    properties.agreementId={type:'string',const:c.agreementId};required.push('agreementId');break;
   case 'answer_pending_proposal':
    properties.proposalId={type:'string',enum:c.proposalIds};properties.decision=decisionSchema;
    required.push('proposalId','decision');break;
  }
  if(c.choice!=='answer_pending_proposal'){properties.reason=reason;required.push('reason');}
  return {type:'object',additionalProperties:false,description:c.effect,required,properties};
 });
 return {oneOf};
}
