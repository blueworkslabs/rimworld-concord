import type {Domain} from './protocol.js';
/** Public receipt projection only. Never infer completion from speech or need changes. */
export function selfCareFollowup(d:Domain){
 return Object.values(d.selfCare??{}).map(a=>{
  const r=d.outcomes[a.id],q=d.coreState?.questions.find(q=>q.id===a.questionId&&q.pawn===a.pawn);
  const sourceIds=[a.id,...(q?.messages??[]).map(m=>m.id)];
  const completed=r?.id===a.id&&r.actor===a.pawn&&r.kind==='eat'&&r.thing===a.action.thing&&r.count===a.action.count&&r.status==='completed'&&Number.isInteger(r.delivered)&&r.delivered!>0&&r.delivered!<=a.action.count;
  return {id:a.id,pawn:a.pawn,kind:'eat' as const,questionId:a.questionId,sourceIds,
   food:{thing:a.action.thing,label:a.action.label},portionCount:a.action.count,
   status:r?.status??'unconfirmed',consumed:r?.delivered??0,consumedUnit:'food-items' as const,completed};
 });
}
