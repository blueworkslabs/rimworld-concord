import type {Domain,Proposal,Receipt} from './protocol.js';
export type AgreementProgress={id:string;kind:string;status:string;tick:number;agreed:number;completed:number;active:number;unconfirmed:number;unsuccessful:number;notStarted:number;unfulfilled:number;delivered:number;quantityUnknown:number};
export type CrewEntry={seq:number;tick:number;kind:'message'|'record';actor:string;recipient:string;subject:string;text:string;key:string};
export type CrewArchive={revision:number;nextSeq:number;entries:CrewEntry[]};
export type CrewReport={observerText?:string;topicText?:string;foodLines?:string[];sharedStatus?:import('./shared-status.js').SharedStatus[];waiting?:string;world:string;epoch:string;branch:string;revision:number;tick:number;entries:CrewEntry[];agreements:{pawn:string;name:string;progress:AgreementProgress}[]};
export function agreementProgress(d:Domain,p:Proposal,tick:number,fresh?:Receipt[]):AgreementProgress {
 if(p.action.kind==='haul-zone'){
  // Shared intent: the quota is the colony's; delivered is this pawn's own credit.
  const v=d.intentViews?.[p.action.intentId],mine=v?.byPawn.find(x=>x.pawn===p.pawn)?.count??0,met=v?.status==='met'?1:0;
  return {id:p.id,kind:p.action.kind,status:p.standing?.status??p.status,tick,agreed:1,completed:met,active:p.standing?.status==='running'?1:0,
   unconfirmed:v?0:1,unsuccessful:v&&(v.status==='expired'||v.status==='stopped')?1:0,notStarted:0,unfulfilled:1-met,delivered:mine,quantityUnknown:0};
 }
 const agreed=p.action.kind==='haul'?p.action.trips:p.action.kind==='cook'?p.action.meals:1;
 const ids=[...new Set(p.standing?.steps??(p.actionId?[p.actionId]:[]))];
 const receipts=ids.map(id=>fresh?.find(r=>r.id===id&&r.actor===p.pawn)??d.outcomes[id]).map(r=>r?.actor===p.pawn?r:undefined);
 const completed=receipts.filter(r=>r?.status==='completed').length,active=receipts.filter(r=>r?.status==='started').length;
 return {id:p.id,kind:p.action.kind,status:p.standing?.status??p.status,tick,agreed,completed,active,
  unconfirmed:receipts.filter(r=>!r).length,unsuccessful:receipts.filter(r=>r?.status==='failed'||r?.status==='interrupted').length,
  notStarted:Math.max(0,agreed-ids.length),unfulfilled:Math.max(0,agreed-completed),
  quantityUnknown:p.action.kind==='haul'?receipts.filter(r=>r?.status==='completed'&&r.delivered===undefined).length:0,
  delivered:p.action.kind==='haul'||p.action.kind==='cook'?receipts.reduce((n,r)=>n+(r?.status==='completed'?r.delivered??0:0),0):0};
}
const safe=(s:unknown,max=1000)=>String(s??'').slice(0,max);
/** Explicit allowlist: never copy general audit payloads or private reflections. */
export function recordCrew(d:Domain,kind:string,actor:string,data:any,tick:number) {
 const c=d.crew??={revision:0,nextSeq:0,entries:[]};c.revision++;
 const name=(id:string)=>id==='core'?'Core':safe(d.characters[id]?.name??id,80);
 const add=(type:CrewEntry['kind'],from:string,to:string,subject:string,text:string,key:string)=>{
  if(c.entries.some(e=>e.key===key))return;
  c.entries.push({seq:++c.nextSeq,tick,kind:type,actor:name(from),recipient:name(to),subject:safe(subject,120),text:safe(text),key});
  c.entries=c.entries.slice(-128);
 };
 if(kind==='native-event'){
  const e=data.event;
  // Only typed physical observations. Never project free-form native detail,
  // health/need values, private memories, or general audit payloads.
  if(e?.pawn===actor&&typeof e.subject==='string'&&e.subject&&Number.isInteger(e.seq)&&Number.isInteger(e.tick)){
   const subject=name(e.subject);
   if(e.kind==='casualty'||e.kind==='casualty-recovered'){
    const text=e.kind==='casualty'?`Locally observed ${subject} downed and outside a bed. Cause and urgency unknown.`:
      `Locally observed ${subject} no longer downed after an earlier downed sighting. Cause unknown; this is not a rescue or treatment record.`;
    // Keep the native observation tick, not the later coordinator ingestion tick.
    add('record',actor,'observer',e.subject,text,`native-observation:${e.seq}`);
    const entry=c.entries.find(x=>x.key===`native-observation:${e.seq}`);if(entry)entry.tick=e.tick;
   }
  }
 }
 if(kind==='intent-not-offered')add('record','core','observer',data.pawn,`${name(data.pawn)}: not offered: ${safe(data.reason,120)}.`,`not-offered:${data.intentId}:${data.pawn}`);
 if(kind==='intent-progress'){
  const credit=Object.entries(data.byPawn??{}).map(([p,n])=>`${name(p)} ${Number(n)}`).join(', ');
  if(data.previousDelivered===0&&data.delivered>0)add('record','Game','observer',data.intentId,`Stockpile haul: first delivery, ${data.delivered}/${data.quota} wood (${credit}).`,`intent-first:${data.intentId}`);
  for(let n=data.previousFinishedAfterExclusion+1;n<=data.finishedAfterExclusion;n++)
   add('record','Game','observer',data.intentId,'Finished a trip started before withdrawing; credited to the carrier, not a new agreement.',`intent-finished-before:${data.intentId}:${n}`);
  if(data.status!==data.previousStatus&&['met','expired','stopped'].includes(data.status)){
   const what=data.status==='met'?'quota met':data.status==='expired'?'expired; the topic stays open':'stopped by the operator';
   add('record','Game','observer',data.intentId,`Stockpile haul ${what}: ${data.delivered}/${data.quota} wood (${credit||'no deliveries'})${data.overshoot?`; ${data.overshoot} beyond reservations reported`:''}.`,`intent-${data.status}:${data.intentId}`);
  }
 }
 if(kind==='proposed'||kind==='proposal-revised')add('message','core',data.pawn,data.id,data.reason,`offer:${data.id}`);
 if(kind==='decided'||kind==='replacement-consented'){
  const p=data as Proposal;
  if(p.decision)add('message',p.pawn,'core',p.id,`${p.decision.kind}: ${p.decision.reason}`,`reply:${p.id}`);
 }
 if(kind==='reoffer-requested')add('message',actor,'core',data.deferredId,`Request one fresh offer: ${data.reason}`,`reoffer:${data.id}`);
 if(kind==='alternative-requested')add('message',actor,'core',data.id,data.reason,`request:${data.id}`);
 if(kind==='core-question'||kind==='core-answer')add('message',data.from,data.to,data.exchangeId,data.text,`core-talk:${data.id}`);
 if(kind==='core-planned')add('message','core','crew',data.id,data.reason,`core-plan:${data.id}`);
 if(kind==='social-delivered')add('message',data.from,data.to,data.exchangeId,data.text,`social:${data.id}`);
 if(kind==='alternative-declined')add('message','core',data.pawn,data.id,data.replyReason,`decline:${data.id}`);
 if(kind==='offer-withdrawn')add('record','core','observer',data.id,'Pending offer withdrawn; no work authorized.',`retired:${data.id}`);
 if(kind==='intention-stopped')add('record',actor,'observer',data.proposal,'Agreement stopped. Any completed work remains recorded; unfinished work is not completion.',`stopped:${data.proposal}`);
 if(kind==='self-care-stopped')add('record',actor,'observer',data.id,`Eating stop requested: ${safe(data.reason,240)}`,`self-care-stop:${data.id}`);
 if(kind==='self-care-chosen')add('record',actor,'observer',data.id,`Chose to eat up to ${data.action.count} ${safe(data.action.label,80)}; consumption not yet confirmed.`,`self-care:${data.id}`);
 if(kind==='self-care-outcome')add('record',actor,'observer',data.id,`eat: ${data.status}. Consumed ${Number(data.delivered??0)} food items.`,`self-care-outcome:${data.id}:${data.status}`);
 if(kind==='action-outcome'){
  const r=data as Receipt,p=Object.values(d.proposals).find(p=>p.pawn===r.actor&&(p.actionId===r.id||p.standing?.steps.includes(r.id)));
  if(!p)return;
  const delivered=r.status==='completed'&&p.action.kind==='haul'?(r.delivered===undefined?' Delivered quantity not reported.':` Delivered ${r.delivered} units.`):'';
  const rescue=r.status==='completed'&&p.action.kind==='rescue'?' Casualty placed in the agreed bed; treatment not implied.':'';
  add('record',r.actor,'observer',p.id,`${p.action.kind}: ${r.status}.${delivered}${rescue}${p.action.kind==='cook'&&r.status==='completed'?` Produced ${r.delivered??0} simple meals; eating is separate.`:''}`,`outcome:${r.id}:${r.status}`);
 }
}
export function crewReport(d:Domain,tick:number,status:import('./shared-status.js').SharedStatus[]=[],thinking:string[]=[]):CrewReport {
 // Explicit projection remains safe if future domain records gain private fields.
 const entries=(d.crew?.entries??[]).map(e=>({seq:e.seq,tick:e.tick,kind:e.kind,actor:e.actor,recipient:e.recipient,subject:e.subject,text:e.text,key:e.key}));
 const proposals=Object.values(d.proposals).filter(p=>p.status==='accepted');
 const ordered=[...proposals.filter(p=>p.standing?.status==='running'),...proposals.filter(p=>p.standing?.status!=='running').reverse()].slice(0,12);
 const selfCare=Object.values(d.selfCare??{}).filter(a=>d.characters[a.pawn]?.commitment===a.id).map(a=>`${nameForCare(d,a.pawn)}: eating`);
 const waiting=Object.values(d.proposals).filter(p=>p.status==='pending'||p.standing?.status==='running').map(p=>`${safe(d.characters[p.pawn]?.name??p.pawn,80)}: ${p.status==='pending'?'reply to': 'working on'} ${p.action.kind}`).concat(selfCare).join(' · ').slice(0,400);
 const core=d.coreState,schedule=core?.schedule;
 const coreState=thinking.includes('core')?'Core: thinking':!core?'Core: not initialized':schedule?.config.maxAttempts!==null&&core.turns.length>=16?'Core: legacy lifetime limit reached':schedule?.blocked?'Core: '+schedule.blocked:schedule&&schedule.config.maxAttempts!==null&&schedule.attempts>=schedule.config.maxAttempts?'Core: configured allowance exhausted':schedule&&schedule.endTick!==null&&tick>=schedule.endTick?'Core: observation window ended':schedule&&schedule.lastAttemptTick!==undefined&&tick-schedule.lastAttemptTick<schedule.config.cooldownTicks?'Core: cooling down':'Core: no turn running; next call depends on operator/scheduler';
 const pendingQuestions=(core?.questions??[]).filter(q=>q.status==='pending'||q.status==='running').map(q=>`${nameForCare(d,q.pawn)}: ${q.status==='running'?'answering':'question awaiting reply'}`);
 const observerText=[coreState,...thinking.filter(id=>id!=='core'&&!!d.characters[id]).map(id=>`${nameForCare(d,id)}: thinking`),...pendingQuestions].join(' · ').slice(0,1600);
 // The board is explicitly the core's interpretation; no private character state or raw audit data.
 const topicText=(core?.topics??[]).slice(-8).map(t=>`[${t.status}] ${safe(t.text,240)}`).join('\n').slice(0,2400);
 return {world:d.world,epoch:d.epoch,branch:d.branch,revision:d.crew?.revision??0,tick,entries,observerText,topicText,sharedStatus:status,waiting:waiting||'No outstanding offer or running agreement.',
  agreements:ordered.map(p=>({pawn:p.pawn,name:safe(d.characters[p.pawn]?.name??p.pawn,80),progress:agreementProgress(d,p,tick)}))};
}

function nameForCare(d:Domain,pawn:string){return safe(d.characters[pawn]?.name??pawn,80);}
