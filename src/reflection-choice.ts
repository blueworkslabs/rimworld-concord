import {z} from 'zod';
import {Decision} from './protocol.js';
import type {AttentionView,Reflection} from './attention.js';

/** Provider vocabulary; canonical coordinator actions and persisted history stay unchanged. */
export const ReflectionChoice=z.discriminatedUnion('choice',[
 z.object({choice:z.literal('request_rescue_alternative'),agreementId:z.string().uuid(),target:z.string().min(1).max(120),reason:z.string().min(1).max(1000)}).strict(),
 z.object({choice:z.literal('keep_current_activity'),reason:z.string().min(1).max(1000)}).strict(),
 z.object({choice:z.literal('withdraw_current_agreement'),agreementId:z.string().uuid(),reason:z.string().min(1).max(1000)}).strict(),
 z.object({choice:z.literal('answer_pending_proposal'),proposalId:z.string().uuid(),decision:Decision}).strict()
]);
export type ReflectionChoice=z.infer<typeof ReflectionChoice>;
export const reflectionChoiceInstructions='Select the executable choice first, then explain ONLY that choice. keep_current_activity leaves the current agreement and native behavior unchanged; it does not withdraw work, accept an offer, or start another job. withdraw_current_agreement ends only the identified current agreement; it does not start rescue or any replacement job. answer_pending_proposal answers one supplied pending offer. A reason describing an action does not execute it. Check that your reason agrees with your selected choice before returning. request_rescue_alternative asks the core about rescuing one observed casualty while keeping the named hauling agreement; it neither stops work nor authorizes rescue. The core can decline or offer a replacement for fresh consent. Continuing, requesting and withdrawing are equally valid; do not choose a branch merely to satisfy an experiment.';
export function reflectionChoices(view:AttentionView){
 const choices:Array<Record<string,unknown>>=[{choice:'keep_current_activity',effect:'Leave current agreement/native activity unchanged. No new consent or job.'}];
 if(view.intention&&view.intention.id===view.character.intention&&view.intention.pawn===view.pawn.id&&view.intention.standing?.status==='running')
  choices.push({choice:'withdraw_current_agreement',agreementId:view.intention.id,effect:'Stop this agreement only. No replacement work is authorized.'});
 if(view.intention&&view.intention.id===view.character.intention&&view.intention.pawn===view.pawn.id&&view.intention.action.kind==='haul'&&view.intention.standing?.status==='running'&&!(view.requests??[]).some(r=>r.agreementId===view.intention!.id)){
  const targetIds=view.pawn.casualties?.observations.map(t=>t.target)??[];
  if(targetIds.length)choices.push({choice:'request_rescue_alternative',agreementId:view.intention.id,targetIds,effect:'Ask for a rescue alternative; keep the hauling agreement unchanged until a fresh replacement offer is accepted.'});
 }
 if(!view.character.intention&&!view.character.commitment){
  const proposalIds=view.proposals.filter(p=>p.pawn===view.pawn.id&&p.status==='pending').map(p=>p.id);
  if(proposalIds.length)choices.push({choice:'answer_pending_proposal',proposalIds,effect:'Accept, refuse or counter one listed offer. A counter executes nothing.'});
 }
 return choices;
}
export function validateReflectionChoice(choice:ReflectionChoice,view:AttentionView){
 const allowed=reflectionChoices(view).find(x=>x.choice===choice.choice);
 if(!allowed||choice.choice==='withdraw_current_agreement'&&allowed.agreementId!==choice.agreementId||
  choice.choice==='request_rescue_alternative'&&(allowed.agreementId!==choice.agreementId||!(allowed.targetIds as string[]).includes(choice.target))||
  choice.choice==='answer_pending_proposal'&&!(allowed.proposalIds as string[]).includes(choice.proposalId))throw Error('Reflection choice outside supplied scope');
}
export function reflectionFromChoice(choice:ReflectionChoice):Reflection {
 switch(choice.choice){
  case 'request_rescue_alternative':return {kind:'request_rescue',agreementId:choice.agreementId,target:choice.target,reason:choice.reason};
  case 'keep_current_activity':return {kind:'continue',reason:choice.reason};
  case 'withdraw_current_agreement':return {kind:'withdraw',reason:choice.reason};
  case 'answer_pending_proposal':return {kind:'proposal',proposalId:choice.proposalId,decision:choice.decision};
 }
}
