import type {Domain,Proposal,Receipt} from './protocol.js';
export type AgreementProgress={id:string;kind:string;status:string;tick:number;agreed:number;completed:number;active:number;unconfirmed:number;unsuccessful:number;notStarted:number;unfulfilled:number;delivered:number;quantityUnknown:number};
export type CrewEntry={seq:number;tick:number;kind:'message'|'record';actor:string;recipient:string;subject:string;text:string;key:string};
export type CrewArchive={revision:number;nextSeq:number;entries:CrewEntry[]};
export type CrewReport={world:string;epoch:string;branch:string;revision:number;tick:number;entries:CrewEntry[];agreements:{pawn:string;name:string;progress:AgreementProgress}[]};
export function agreementProgress(d:Domain,p:Proposal,tick:number,fresh?:Receipt[]):AgreementProgress {
 const agreed=p.action.kind==='haul'?p.action.trips:1;
 const ids=[...new Set(p.standing?.steps??(p.actionId?[p.actionId]:[]))];
 const receipts=ids.map(id=>fresh?.find(r=>r.id===id&&r.actor===p.pawn)??d.outcomes[id]).map(r=>r?.actor===p.pawn?r:undefined);
 const completed=receipts.filter(r=>r?.status==='completed').length,active=receipts.filter(r=>r?.status==='started').length;
 return {id:p.id,kind:p.action.kind,status:p.standing?.status??p.status,tick,agreed,completed,active,
  unconfirmed:receipts.filter(r=>!r).length,unsuccessful:receipts.filter(r=>r?.status==='failed'||r?.status==='interrupted').length,
  notStarted:Math.max(0,agreed-ids.length),unfulfilled:Math.max(0,agreed-completed),
  quantityUnknown:p.action.kind==='haul'?receipts.filter(r=>r?.status==='completed'&&r.delivered===undefined).length:0,
  delivered:p.action.kind==='haul'?receipts.reduce((n,r)=>n+(r?.status==='completed'?r.delivered??0:0),0):0};
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
 if(kind==='proposed'||kind==='proposal-revised')add('message','core',data.pawn,data.id,data.reason,`offer:${data.id}`);
 if(kind==='decided'||kind==='replacement-consented'){
  const p=data as Proposal;
  if(p.decision)add('message',p.pawn,'core',p.id,`${p.decision.kind}: ${p.decision.reason}`,`reply:${p.id}`);
 }
 if(kind==='alternative-requested')add('message',actor,'core',data.id,data.reason,`request:${data.id}`);
 if(kind==='alternative-declined')add('message','core',data.pawn,data.id,data.replyReason,`decline:${data.id}`);
 if(kind==='offer-withdrawn')add('record','core','observer',data.id,'Pending offer withdrawn; no work authorized.',`retired:${data.id}`);
 if(kind==='intention-stopped')add('record',actor,'observer',data.proposal,'Agreement stopped. Any completed work remains recorded; unfinished work is not completion.',`stopped:${data.proposal}`);
 if(kind==='action-outcome'){
  const r=data as Receipt,p=Object.values(d.proposals).find(p=>p.pawn===r.actor&&(p.actionId===r.id||p.standing?.steps.includes(r.id)));
  if(!p)return;
  const delivered=r.status==='completed'&&p.action.kind==='haul'?(r.delivered===undefined?' Delivered quantity not reported.':` Delivered ${r.delivered} units.`):'';
  const rescue=r.status==='completed'&&p.action.kind==='rescue'?' Casualty placed in the agreed bed; treatment not implied.':'';
  add('record',r.actor,'observer',p.id,`${p.action.kind}: ${r.status}.${delivered}${rescue}`,`outcome:${r.id}:${r.status}`);
 }
}
export function crewReport(d:Domain,tick:number):CrewReport {
 // Explicit projection remains safe if future domain records gain private fields.
 const entries=(d.crew?.entries??[]).map(e=>({seq:e.seq,tick:e.tick,kind:e.kind,actor:e.actor,recipient:e.recipient,subject:e.subject,text:e.text,key:e.key}));
 const proposals=Object.values(d.proposals).filter(p=>p.status==='accepted');
 const ordered=[...proposals.filter(p=>p.standing?.status==='running'),...proposals.filter(p=>p.standing?.status!=='running').reverse()].slice(0,12);
 return {world:d.world,epoch:d.epoch,branch:d.branch,revision:d.crew?.revision??0,tick,entries,
  agreements:ordered.map(p=>({pawn:p.pawn,name:safe(d.characters[p.pawn]?.name??p.pawn,80),progress:agreementProgress(d,p,tick)}))};
}
