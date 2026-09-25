import type {Domain,Proposal,Receipt} from './protocol.js';
import {staleNote} from './observation-age.js';
export type AgreementProgress={completedTick?:number|null;id:string;kind:string;status:string;tick:number;agreed:number;completed:number;active:number;unconfirmed:number;unsuccessful:number;notStarted:number;unfulfilled:number;delivered:number;quantityUnknown:number};
export type CrewEntry={mapId?:number;hasMap?:boolean;seq:number;tick:number;kind:'message'|'record';actor:string;recipient:string;subject:string;text:string;key:string};
export type CrewArchive={revision:number;nextSeq:number;entries:CrewEntry[]};
export type CrewReport={observerText?:string;topicText?:string;foodLines?:string[];sharedStatus?:import('./shared-status.js').SharedStatus[];waiting?:string;world:string;epoch:string;branch:string;revision:number;tick:number;entries:CrewEntry[];agreements:{pawn:string;name:string;progress:AgreementProgress}[]};
export function agreementProgress(d:Domain,p:Proposal,tick:number,fresh?:Receipt[]):AgreementProgress {
 if(p.action.kind==='haul-zone'){
  // Shared intent: the quota is the colony's; delivered is this pawn's own credit.
  // Only an accepted offer is an agreement: a lapsed, withdrawn or unanswered offer is never
  // "agreed" or "unfulfilled", and a helper's credit is not agreement work.
  const v=d.intentViews?.[p.action.intentId],agreed=p.status==='accepted'?1:0,mine=agreed?v?.byPawn.find(x=>x.pawn===p.pawn)?.count??0:0,met=agreed&&p.standing?.status==='completed'&&v?.status==='met'?1:0;
  return {id:p.id,kind:p.action.kind,status:p.standing?.status??p.status,tick,agreed,completed:met,active:p.standing?.status==='running'?1:0,
   unconfirmed:agreed&&(!v||d.pendingIntentAcceptances?.includes(p.id))?1:0,unsuccessful:agreed&&(p.standing?.status==='stopped'||v&&(v.status==='expired'||v.status==='stopped'))?1:0,notStarted:0,unfulfilled:agreed-met,delivered:mine,quantityUnknown:0,
   // Completion time comes from the receipt (last credited placement), never the observation tick.
   completedTick:met?v!.lastDeliveryTick:null};
 }
 const agreed=p.action.kind==='cook'?p.action.meals:1;
 const ids=[...new Set(p.standing?.steps??(p.actionId?[p.actionId]:[]))];
 const receipts=ids.map(id=>fresh?.find(r=>r.id===id&&r.actor===p.pawn)??d.outcomes[id]).map(r=>r?.actor===p.pawn?r:undefined);
 const completed=receipts.filter(r=>r?.status==='completed').length,active=receipts.filter(r=>r?.status==='started').length;
 return {id:p.id,kind:p.action.kind,status:p.standing?.status??p.status,tick,agreed,completed,active,
  unconfirmed:receipts.filter(r=>!r).length,unsuccessful:receipts.filter(r=>r?.status==='failed'||r?.status==='interrupted').length,
  notStarted:Math.max(0,agreed-ids.length),unfulfilled:Math.max(0,agreed-completed),
  quantityUnknown:0,
  delivered:p.action.kind==='cook'?receipts.reduce((n,r)=>n+(r?.status==='completed'?r.delivered??0:0),0):0};
}
const safe=(s:unknown,max=1000)=>String(s??'').slice(0,max);
/** Explicit allowlist: never copy general audit payloads or private reflections. */
export function recordCrew(d:Domain,kind:string,actor:string,data:any,tick:number) {
 const c=d.crew??={revision:0,nextSeq:0,entries:[]};c.revision++;
 const name=(id:string)=>id==='core'?'Core':safe(d.characters[id]?.name??id,80);
 // Updated in place (B6 archive line): same entry, newest text.
 const upsert=(type:CrewEntry['kind'],from:string,to:string,subject:string,text:string,key:string)=>{
  const e=c.entries.find(e=>e.key===key);if(e){e.text=safe(text);return;}
  add(type,from,to,subject,text,key);
 };
 const add=(type:CrewEntry['kind'],from:string,to:string,subject:string,text:string,key:string)=>{
  if(c.entries.some(e=>e.key===key))return;
  const proposal=d.proposals[subject],care=d.selfCare?.[subject];
  const map=d.intentViews?.[subject]?.mapId??(proposal?.action.kind==='haul-zone'?d.intentViews?.[proposal.action.intentId]?.mapId:undefined)
    ??proposal?.rescueMap??proposal?.productionMap??care?.mapId
    ??(kind==='native-event'?data.event?.mapId:undefined);
  const iv=kind==='intent-progress'?d.intentViews?.[subject]:undefined;
  const physicalTick=iv&&(key.startsWith('intent-met:')||key.startsWith('intent-first:'))?iv.lastDeliveryTick:
    iv&&key.startsWith('intent-pretag:')?iv.createdTick:undefined;
  const entryTick=physicalTick!==undefined&&physicalTick>=0&&physicalTick<=tick?physicalTick:tick;
  c.entries.push({...(Number.isInteger(map)&&map>=0?{mapId:map,hasMap:true}:{}),seq:++c.nextSeq,tick:entryTick,kind:type,actor:name(from),recipient:name(to),subject:safe(subject,120),text:safe(text),key});
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
 if(kind==='intent-not-offered')add('record','core','observer',data.pawn,`${name(data.pawn)}: not offered: ${safe(data.reason,120)}.`,`not-offered:${data.pawn}`);
 if(kind==='intent-progress'){
  const credit=Object.entries(data.byPawn??{}).map(([p,n])=>`${name(p)} ${Number(n)}`).join(', ');
  const item=safe(data.thingLabel??'wood',40),pile=safe(data.label??'stockpile',60);
  if(data.previousDelivered===0&&data.delivered>0)add('record','Game','observer',data.intentId,`Stockpile haul: first delivery, ${data.delivered}/${data.quota} ${item} (${credit}).`,`intent-first:${data.intentId}`);
  // B6: a helper's first credited placement, once per pawn and intent.
  for(const [p,n] of Object.entries(data.byPawn??{}))if(Number(n)>0&&!(data.asked??[]).includes(p))
   add('record','Game','observer',data.intentId,`${name(p)} is helping with the ${pile} (not asked).`,`helper:${data.intentId}:${p}`);
  // Fable: one line at acceptance, only when a haul was already on its way to the pile.
  const before:{pawn:string,planned:number}[]=Array.isArray(data.preTagAtStart)?data.preTagAtStart:[];
  if(before.length){
   const who=[...new Set(before.map(j=>name(j.pawn)))].join(', '),total=before.reduce((a,j)=>a+Math.max(0,Number(j.planned)||0),0);
   add('record','Game','observer',data.intentId,`Already on its way when the agreement started: ${total} ${item} (${who}).`,`intent-pretag:${data.intentId}`);
  }
  const ordinary=Object.entries(data.ordinaryByPawn??{}),since=ordinary.reduce((a,[,n])=>a+Number(n),0)+Number(data.ordinaryUnattributed??0);
  if(since>0)upsert('record','Game','observer',data.intentId,`Since then: ${since} ${item} as ordinary work (${[...ordinary.map(([p,n])=>`${name(p)} ${Number(n)}`),...(data.ordinaryUnattributed?[`unattributed ${Number(data.ordinaryUnattributed)}`]:[])].join(', ')}).`,`intent-since:${data.intentId}`);
  for(let n=data.previousFinishedAfterExclusion+1;n<=data.finishedAfterExclusion;n++)
   add('record','Game','observer',data.intentId,'Finished a trip started before withdrawing; credited to the carrier, not a new agreement.',`intent-finished-before:${data.intentId}:${n}`);
  if(data.status!==data.previousStatus&&['met','expired','stopped'].includes(data.status)){
   // B6 frozen wording.
   const who=credit||'no deliveries',over=data.overshoot?`; ${data.overshoot} beyond reservations reported`:'';
   const text=data.status==='met'?`Agreement complete: ${data.delivered} of ${data.quota} ${item} (${who})${over}. Further hauling here is ordinary work.`:
    data.status==='expired'?`Agreement expired at ${data.delivered} of ${data.quota} ${item} (${who})${over}; the topic stays open.`:
    `Agreement stopped (${safe(data.stopReason??'by the operator',80)}) at ${data.delivered} of ${data.quota} ${item} (${who})${over}.`;
   add('record','Game','observer',data.intentId,text,`intent-${data.status}:${data.intentId}`);
  }
 }
 if(kind==='proposed'||kind==='proposal-revised'){
  add('message','core',data.pawn,data.id,data.reason,`offer:${data.id}`);
  // B6: the structured record next to the core's own sentence says what is offered.
  const a=(data as Proposal).action;
  if(a?.kind==='haul-zone'){
   const e=(d.nativeHauls??[]).find(e=>e.intentId===a.intentId);
   add('record','Game','observer',data.id,`Offer to ${name(data.pawn)}: haul up to ${a.quota} ${safe(e?.thingLabel??'wood',40)} to the ${safe(a.label??e?.label??'shared wood pile',60)}; others may help.`,`offer-record:${data.id}`);
  }
 }
 if(kind==='decided'||kind==='replacement-consented'){
  const p=data as Proposal;
  if(p.decision)add('message',p.pawn,'core',p.id,`${p.decision.kind}: ${p.decision.reason}`,`reply:${p.id}`);
 }
 if(kind==='reoffer-requested')add('message',actor,'core',data.deferredId,`Request one fresh offer: ${data.reason}`,`reoffer:${data.id}`);
 if(kind==='alternative-requested')add('message',actor,'core',data.id,data.reason,`request:${data.id}`);
 if(kind==='core-question'||kind==='core-answer')add('message',data.from,data.to,data.exchangeId,staleNote(data)+data.text,`core-talk:${data.id}`);
 // The wait action is silent (Gate C): the status line says what the core is waiting on.
 if(kind==='core-planned'&&data.kind!=='wait')add('message','core','crew',data.id,staleNote(data)+data.reason,`core-plan:${data.id}`);
 // A returned offer or question the pipeline rejected is visible, with its cause (never its text).
 if(kind==='core-failed'&&typeof data.cause==='string'&&data.cause.startsWith('rejected: ')&&['propose','adopt_counter','ask'].includes(data.action?.kind)){
  const what=data.action.kind==='ask'?'question':'offer',to=data.action.pawn?` to ${name(data.action.pawn)}`:'';
  add('record','core','observer',data.id,`Core's ${what}${to} was rejected before publication (${safe(data.cause.slice(10),60)}).`,`core-rejected:${data.id}`);
 }
 if(kind==='handover-dispatching')add('record','Game','observer',data.proposalId,`${name(data.pawn)}'s carried trip finished; rescue dispatch requested, not yet confirmed.`,`handover-go:${data.proposalId}`);
 if(kind==='handover-stopped')add('record','Game','observer',data.proposalId,`Rescue handover for ${name(data.pawn)} stopped: ${safe(data.reason,120)}. No automatic retry.`,`handover-stop:${data.proposalId}`);
 if(kind==='intent-offer-lapsed')add('record','Game','observer',data.proposal,data.answer?`${name(data.pawn)} answered ${safe(data.answer,20)} after the stockpile haul was already ${data.intentStatus==='met'?'complete':safe(data.intentStatus,20)}; no agreement started.`:`Offer to ${name(data.pawn)} lapsed unanswered: the stockpile haul was already ${data.intentStatus==='met'?'complete':safe(data.intentStatus,20)}.`,`lapsed:${data.proposal}`);
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
  if(r.status==='started'&&d.handovers?.[p.id])add('record','Game','observer',p.id,`${name(p.pawn)}'s carried trip finished; the rescue now starts.`,`handover-started:${p.id}`);
  const rescue=r.status==='completed'&&p.action.kind==='rescue'?' Casualty placed in the agreed bed; treatment not implied.':'';
  add('record',r.actor,'observer',p.id,`${p.action.kind}: ${r.status}.${rescue}${p.action.kind==='cook'&&r.status==='completed'?` Produced ${r.delivered??0} simple meals; eating is separate.`:''}`,`outcome:${r.id}:${r.status}`);
 }
}
export function crewReport(d:Domain,tick:number,status:import('./shared-status.js').SharedStatus[]=[],thinking:string[]=[]):CrewReport {
 // Explicit projection remains safe if future domain records gain private fields.
 const entries=(d.crew?.entries??[]).map(e=>({...((e.hasMap&&Number.isInteger(e.mapId))?{hasMap:true,mapId:e.mapId}:{}),seq:e.seq,tick:e.tick,kind:e.kind,actor:e.actor,recipient:e.recipient,subject:e.subject,text:e.text,key:e.key}));
 const proposals=Object.values(d.proposals).filter(p=>p.status==='accepted');
 const ordered=[...proposals.filter(p=>p.standing?.status==='running'),...proposals.filter(p=>p.standing?.status!=='running').reverse()].slice(0,12);
 const selfCare=Object.values(d.selfCare??{}).filter(a=>d.characters[a.pawn]?.commitment===a.id).map(a=>`${nameForCare(d,a.pawn)}: eating`);
 const waiting=Object.values(d.proposals).filter(p=>p.status==='pending'||p.standing?.status==='running').map(p=>`${safe(d.characters[p.pawn]?.name??p.pawn,80)}: ${p.status==='pending'?'reply to': 'working on'} ${p.action.kind}`).concat(selfCare).join(' · ').slice(0,400);
 const core=d.coreState,schedule=core?.schedule;
 // A wait is silent in the log; the status line names what the core is waiting on.
 const lastTurn=[...(core?.turns??[])].reverse().find(t=>t.status==='applied'),firstOpen=(core?.topics??[]).find(t=>t.status==='open');
 // A wait after a pawn spoke to the core says it heard them (Fable: a silent wait after a plea
 // reads as being ignored). The topic is cut at a word, not mid-word.
 const heard=lastTurn?.choice?.action.kind==='wait'&&!core?.silentWake?(lastTurn.heard??[]).map(p=>safe(d.characters[p]?.name??p,40)):[];
 const clip=(t:string,max:number)=>{const s=t.replace(/\s+/g,' ').trim();if(s.length<=max)return s;const cut=s.slice(0,max);const at=cut.lastIndexOf(' ');return (at>max/2?cut.slice(0,at):cut).replace(/[,;:.\-]+$/,'')+'…';};
 const coreWaiting=lastTurn?.choice?.action.kind==='wait'||core?.silentWake?`Core: ${heard.length?`heard ${heard.join(', ')}; `:''}waiting on ${firstOpen?clip(firstOpen.text,120):'new events'}`:undefined;
 const coreState=thinking.includes('core')?'Core: thinking':coreWaiting!==undefined?coreWaiting:!core?'Core: not initialized':schedule?.config.maxAttempts!==null&&core.turns.length>=16?'Core: legacy lifetime limit reached':schedule?.blocked?'Core: '+schedule.blocked:schedule&&schedule.config.maxAttempts!==null&&schedule.attempts>=schedule.config.maxAttempts?'Core: configured allowance exhausted':schedule&&schedule.endTick!==null&&tick>=schedule.endTick?'Core: observation window ended':schedule&&schedule.lastAttemptTick!==undefined&&tick-schedule.lastAttemptTick<schedule.config.cooldownTicks?'Core: cooling down':'Core: no turn running; next call depends on operator/scheduler';
 const pendingQuestions=(core?.questions??[]).filter(q=>q.status==='pending'||q.status==='running').map(q=>`${nameForCare(d,q.pawn)}: ${q.status==='running'?'answering':'question awaiting reply'}`);
 const failures=core?.failures,failed=failures&&failures.total>0?`Core outputs failed or rejected: ${failures.total} (${Object.entries(failures.causes).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k.replace(/^rejected: /,'')} ${n}`).join(', ')})`:undefined;
 const laneFailures=Object.entries(d.diagnostics?.laneFailures??{}).map(([lane,f])=>`${lane} failures: ${f.total} (${Object.entries(f.causes).map(([cause,n])=>`${cause} ${n}`).join(', ')})`);
 const observerText=[coreState,...(failed?[failed]:[]),...laneFailures,...thinking.filter(id=>id!=='core'&&!!d.characters[id]).map(id=>`${nameForCare(d,id)}: thinking`),...pendingQuestions].join(' · ').slice(0,1600);
 // The board is explicitly the core's interpretation; no private character state or raw audit data.
 const topicText=(core?.topics??[]).slice(-8).map(t=>`[${t.status}] ${safe(t.text,240)}`).join('\n').slice(0,2400);
 return {world:d.world,epoch:d.epoch,branch:d.branch,revision:d.crew?.revision??0,tick,entries,observerText,topicText,sharedStatus:status,waiting:waiting||'No outstanding offer or running agreement.',
  agreements:ordered.map(p=>({pawn:p.pawn,name:safe(d.characters[p.pawn]?.name??p.pawn,80),progress:agreementProgress(d,p,tick)}))};
}

function nameForCare(d:Domain,pawn:string){return safe(d.characters[pawn]?.name??pawn,80);}
