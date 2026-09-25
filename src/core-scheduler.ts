import {z} from 'zod';
import type {CoreView} from './core-planner.js';

export const CoreScheduleConfig=z.object({
 maxAttempts:z.number().int().min(1).max(16).nullable(),
 cooldownTicks:z.number().int().min(60).max(3600),
 windowTicks:z.number().int().min(60).max(36000).nullable()
}).strict().refine(c=>(c.maxAttempts===null)===(c.windowTicks===null),"Ongoing schedules require both limits null");
export type CoreScheduleConfig=z.infer<typeof CoreScheduleConfig>;
export type CoreSchedule={config:CoreScheduleConfig;startTick:number;endTick:number|null;blocked?:string;attempts:number;lastAttemptTick?:number;consumed:Record<string,string>;review?:CoreReview};
/** A pending review after a deliberate wait: the wait turn it follows, when it is due, and which
 * review in the chain it would be (1 or 2). */
export type CoreReview={turnId:string;waitTick:number;dueTick:number;step:number};
export type CoreWake={sourceId:string;kind:'start'|'agreement'|'request'|'message'|'answer'|'telemetry'|'self-care'|'native-intent'|'review';value:string};

/** Quiet-period threshold for the native spike; one wake per delivery-separated stall. */
export const NATIVE_INTENT_STALL_TICKS=2500;
/** Reviews after one deliberate wait: 2,500 then 5,000 ticks, then silence until a real cause. */
export const CORE_REVIEW_CHAIN=2;

/** Only public/communicated changes qualify. Tick passage, private needs,
 * opportunity churn, telemetry timestamp refreshes and the core's own prose do not wake it. */
export function coreWakeSnapshot(v:CoreView):CoreWake[]{
 const wakes:CoreWake[]=[{sourceId:v.brief.id,kind:'start',value:'initial'}];
 for(const s of v.sharedStatus)wakes.push({sourceId:s.pawn,kind:'telemetry',value:JSON.stringify({food:s.food,rest:s.rest})});
 for(const a of v.selfCare??[])if(['completed','failed','interrupted'].includes(a.status))wakes.push({sourceId:a.id,kind:'self-care',value:a.status});
 for(const p of v.agreements){
  const status=p.action.kind==='move'&&p.status==='accepted'
   ?p.progress.completed?'completed':p.progress.unsuccessful?'stopped':p.progress.status
   :p.progress.status;
  if(['completed','stopped','refused','deferred','countered','withdrawn'].includes(status))
   wakes.push({sourceId:p.id,kind:'agreement',value:JSON.stringify({status,completed:p.progress.completed,unsuccessful:p.progress.unsuccessful,delivered:p.progress.delivered})});
 }
 for(const i of v.nativeIntents??[]){
  if(i.delivered>0)wakes.push({sourceId:i.intentId+':first-delivery',kind:'native-intent',value:'delivered'});
  if(['met','expired','stopped'].includes(i.status))wakes.push({sourceId:i.intentId+':lifecycle',kind:'native-intent',value:i.status});
  const since=Math.max(i.createdTick,i.lastDeliveryTick);
  if(i.status==='open'&&v.tick-since>=NATIVE_INTENT_STALL_TICKS)wakes.push({sourceId:i.intentId+':stall',kind:'native-intent',value:String(since)});
 }
 for(const r of v.requests)wakes.push({sourceId:r.id,kind:'request',value:r.status});
 for(const m of v.messages)if(m.to==='core'&&m.from!=='core')wakes.push({sourceId:m.id,kind:'message',value:m.text});
 for(const r of v.reoffers)wakes.push({sourceId:r.id,kind:'request',value:'reoffer-requested'});
 for(const q of v.questions)if(['answered','silent','failed'].includes(q.status))wakes.push({sourceId:q.id,kind:'answer',value:q.status});
 return wakes;
}
const key=(w:CoreWake)=>w.kind+':'+w.sourceId;
/** A pawn's Food or Rest band got worse and reached `urgent` since the consumed snapshot
 * (a first or previously unknown reading that is urgent counts as reaching it). */
export function turnedUrgent(previous:string|undefined,current:string){
 const band=(v:string|undefined,need:'food'|'rest')=>{try{return v===undefined?undefined:(JSON.parse(v) as Record<string,string>)[need];}catch{return undefined;}};
 return (['food','rest'] as const).some(n=>band(current,n)==='urgent'&&band(previous,n)!=='urgent');
}
/** Fable's rule (E2, final): a wake made only of telemetry band changes spends no core turn
 * unless something is offerable (an opportunity or a counter: an eligible offer recipient) or
 * some crew member's Food or Rest band got worse and reached `urgent`. Improving and lateral
 * band changes never wake the core on their own; current bands are in every view anyway.
 * Question recipients do not count: in the E2 sample they appear on every turn. */
export function telemetryOnlyIdle(causes:CoreWake[],v:Pick<CoreView,'opportunities'|'counters'>,consumed:Record<string,string>={}){
 return causes.length>0&&causes.every(w=>w.kind==='telemetry')&&v.opportunities.length===0&&v.counters.length===0&&
  !causes.some(w=>turnedUrgent(consumed[key(w)],w.value));
}
export function coreAdmission(s:CoreSchedule,v:CoreView):{ready:true;causes:CoreWake[];snapshot:Record<string,string>}|{ready:false;reason:string;silent?:{causes:CoreWake[];snapshot:Record<string,string>}}{
 if(s.blocked)return {ready:false,reason:s.blocked};
 if(v.tick<s.startTick||s.endTick!==null&&v.tick>=s.endTick)return {ready:false,reason:'outside-window'};
 if(s.config.maxAttempts!==null&&s.attempts>=s.config.maxAttempts)return {ready:false,reason:'budget-exhausted'};
 if(s.lastAttemptTick!==undefined&&v.tick-s.lastAttemptTick<s.config.cooldownTicks)return {ready:false,reason:'cooldown'};
 const wakes=coreWakeSnapshot(v),causes=wakes.filter(w=>s.consumed[key(w)]!==w.value);
 if(!causes.length){
  const review=dueReview(s,v);
  if(review)return {ready:true,causes:[review],snapshot:{...s.consumed,[key(review)]:review.value}};
  return {ready:false,reason:'no-new-event'};
 }
 // Keep prior keys: a temporarily absent observation must not re-wake later.
 // Persistent deduplication is separate from bounded prompt history.
 const snapshot={...s.consumed,...Object.fromEntries(wakes.map(w=>[key(w),w.value]))};
 // Consumed without a turn, attempt or cooldown: the same bands never re-wake the core.
 if(telemetryOnlyIdle(causes,v,s.consumed))return {ready:false,reason:'telemetry-only',silent:{causes,snapshot}};
 return {ready:true,causes,snapshot};
}

/** Driver work includes consuming a silent wake. `ready` alone means model admission,
 * not whether the coordinator has scheduler bookkeeping to perform. */
export function coreSchedulerDue(s:CoreSchedule,v:CoreView){
 const admission=coreAdmission(s,v);
 return admission.ready||!!admission.silent;
}

const offerable=(v:Pick<CoreView,'opportunities'|'counters'>)=>v.opportunities.length+v.counters.length>0;
/** Fable (post-Gate-C item 6): a bounded review after a deliberate wait. Due once the interval
 * has passed, only while some proposable choice (any, not the same one) is still present, and only
 * when nothing else would wake the core. It is a nudge, not news; waiting remains valid. */
export function dueReview(s:CoreSchedule,v:Pick<CoreView,'tick'|'opportunities'|'counters'>):CoreWake|undefined{
 const r=s.review;
 if(!r||v.tick<r.dueTick||!offerable(v))return undefined;
 const w:CoreWake={sourceId:r.turnId,kind:'review',value:`Review ${r.step} of ${CORE_REVIEW_CHAIN}, a nudge and not news: you waited at t${r.waitTick} while work was offerable and nothing public has changed since. Waiting remains a valid answer.`};
 return s.consumed[key(w)]===undefined?w:undefined;
}
/** After an applied turn: a wait with proposable work schedules the next review. A turn woken by a
 * real cause starts the chain at 2,500 ticks; a review that ends in wait again doubles it; after
 * the second, silence until a real cause. Anything but a wait ends the chain. */
export function scheduleReview(s:CoreSchedule,turn:{id:string;tick:number;waited:boolean;offerable:boolean;review?:number}){
 if(!turn.waited||!turn.offerable||(turn.review??0)>=CORE_REVIEW_CHAIN){delete s.review;return;}
 const done=turn.review??0;
 s.review={turnId:turn.id,waitTick:turn.tick,dueTick:turn.tick+NATIVE_INTENT_STALL_TICKS*2**done,step:done+1};
}
