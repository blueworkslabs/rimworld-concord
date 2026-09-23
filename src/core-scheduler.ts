import {z} from 'zod';
import type {CoreView} from './core-planner.js';

export const CoreScheduleConfig=z.object({
 maxAttempts:z.number().int().min(1).max(16),
 cooldownTicks:z.number().int().min(60).max(3600),
 windowTicks:z.number().int().min(60).max(36000)
}).strict();
export type CoreScheduleConfig=z.infer<typeof CoreScheduleConfig>;
export type CoreSchedule={config:CoreScheduleConfig;startTick:number;endTick:number;attempts:number;lastAttemptTick?:number;consumed:Record<string,string>};
export type CoreWake={sourceId:string;kind:'start'|'agreement'|'request'|'message'|'answer'|'telemetry';value:string};

/** Only public/communicated changes qualify. Tick passage, private needs,
 * opportunity churn, telemetry timestamp refreshes and the core's own prose do not wake it. */
export function coreWakeSnapshot(v:CoreView):CoreWake[]{
 const wakes:CoreWake[]=[{sourceId:v.brief.id,kind:'start',value:'initial'}];
 for(const s of v.sharedStatus)wakes.push({sourceId:s.pawn,kind:'telemetry',value:JSON.stringify({food:s.food,rest:s.rest})});
 for(const p of v.agreements){
  const status=p.action.kind==='move'&&p.status==='accepted'
   ?p.progress.completed?'completed':p.progress.unsuccessful?'stopped':p.progress.status
   :p.progress.status;
  if(['completed','stopped','refused','deferred','countered','withdrawn'].includes(status))
   wakes.push({sourceId:p.id,kind:'agreement',value:JSON.stringify({status,completed:p.progress.completed,unsuccessful:p.progress.unsuccessful,delivered:p.progress.delivered})});
 }
 for(const r of v.requests)wakes.push({sourceId:r.id,kind:'request',value:r.status});
 for(const m of v.messages)if(m.to==='core'&&m.from!=='core')wakes.push({sourceId:m.id,kind:'message',value:m.text});
 for(const r of v.reoffers)wakes.push({sourceId:r.id,kind:'request',value:'reoffer-requested'});
 for(const q of v.questions)if(['answered','silent','failed'].includes(q.status))wakes.push({sourceId:q.id,kind:'answer',value:q.status});
 return wakes;
}
const key=(w:CoreWake)=>w.kind+':'+w.sourceId;
export function coreAdmission(s:CoreSchedule,v:CoreView):{ready:true;causes:CoreWake[];snapshot:Record<string,string>}|{ready:false;reason:string}{
 if(v.tick<s.startTick||v.tick>=s.endTick)return {ready:false,reason:'outside-window'};
 if(s.attempts>=s.config.maxAttempts)return {ready:false,reason:'budget-exhausted'};
 if(s.lastAttemptTick!==undefined&&v.tick-s.lastAttemptTick<s.config.cooldownTicks)return {ready:false,reason:'cooldown'};
 const wakes=coreWakeSnapshot(v),causes=wakes.filter(w=>s.consumed[key(w)]!==w.value);
 if(!causes.length)return {ready:false,reason:'no-new-event'};
 // Keep prior keys: a temporarily absent observation must not re-wake later.
 // Domain lifetime is separately bounded to sixteen core turns.
 return {ready:true,causes,snapshot:{...s.consumed,...Object.fromEntries(wakes.map(w=>[key(w),w.value]))}};
}
