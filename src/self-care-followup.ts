import type {Domain} from './protocol.js';
/** Public receipt projection only. Never infer completion from speech or need changes. */
export function selfCareFollowup(d:Domain){
 const questions=d.coreState?.questions??[],cares=Object.values(d.selfCare??{});
 return cares.map(a=>{
  const r=d.outcomes[a.id],q=questions.find(q=>q.id===a.questionId&&q.pawn===a.pawn);
  // A typed receipt reference, never sequence or prose, identifies a consumption report.
  const report=questions.find(x=>x.reportSelfCareId===a.id&&x.pawn===a.pawn);
  const linked=report&&!cares.some(b=>b.questionId===report.id)?report:undefined;
  const sourceIds=[a.id,...(q?.messages??[]).map(m=>m.id),...(linked?.messages??[]).map(m=>m.id)];
  const completed=r?.id===a.id&&r.actor===a.pawn&&r.kind==='eat'&&r.thing===a.action.thing&&r.count===a.action.count&&r.status==='completed'&&Number.isInteger(r.delivered)&&r.delivered!>0&&r.delivered!<=a.action.count;
  return {id:a.id,pawn:a.pawn,kind:'eat' as const,questionId:a.questionId,sourceIds,...(report?{reportQuestionId:report.id}:{}),
   food:{thing:a.action.thing,label:a.action.label},portionCount:a.action.count,
   status:r?.status??'unconfirmed',consumed:r?.delivered??0,consumedUnit:'food-items' as const,completed};
 });
}
