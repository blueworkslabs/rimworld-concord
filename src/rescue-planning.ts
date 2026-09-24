import type {Domain,GameState,Pawn,Proposal,Rescue,RescueView} from './protocol.js';

function held(domain:Domain,p:Proposal):boolean {
  return p.status==='pending'||p.standing?.status==='running'||
    (!!p.actionId&&domain.characters[p.pawn]?.commitment===p.actionId);
}
function conflict(p:Proposal,a:Rescue):boolean {
  return p.action.kind==='rescue'&&(p.action.target===a.target||p.action.bed===a.bed);
}
/** Only deliberately public physical observations, never target psychology. */
export function rescueView(domain:Domain,game:GameState,own:Pawn):RescueView|null {
  const v=own.rescue;if(!v)return null;
  const options=v.epoch===game.epoch&&v.tick===game.ticks&&Number.isInteger(v.mapId)&&v.mapId>=0&&v.status==='available'
    ?v.options.filter(a=>!Object.values(domain.proposals).some(p=>p.pawn!==own.id&&held(domain,p)&&conflict(p,a))):[];
  return {epoch:v.epoch,tick:v.tick,mapId:v.mapId,status:v.status,options:options.map(a=>({kind:a.kind,target:a.target,bed:a.bed,x:a.x,z:a.z,maxTicks:a.maxTicks})),
    observations:v.observations.filter(o=>options.some(a=>a.target===o.target&&a.bed===o.bed))
      .map(o=>({target:o.target,targetName:o.targetName,bed:o.bed,bedLabel:o.bedLabel}))};
}
export function planRescue(domain:Domain,game:GameState,pawn:string,action:Rescue,replaces?:string):number {
  const own=game.pawns.find(p=>p.id===pawn),oldP=replaces?domain.proposals[replaces]:undefined;
  // B7: replacing a native haul whose trip is still carrying uses the read-only handover
  // projection at the offer stage only; execution still requires empty hands.
  const v=oldP?.action.kind==='haul-zone'&&own?.carrying&&own.rescueHandover?own.rescueHandover:own?.rescue;
  if(!v||v.status!=='available'||v.epoch!==game.epoch||v.tick!==game.ticks||!Number.isInteger(v.mapId)||v.mapId<0)
    throw Error('Fresh mapped rescue observation required');
  const old=replaces?domain.proposals[replaces]:undefined,ch=domain.characters[pawn];
  const replacing=!!(old&&old.pawn===pawn&&(old.action.kind==='haul'||old.action.kind==='haul-zone')&&old.status==='accepted'&&old.standing?.status==='running'&&ch?.intention===old.id&&(!ch.commitment||ch.commitment===old.actionId));
  if(replaces&&!replacing)throw Error('Replacement agreement no longer active');
  if(Object.values(domain.proposals).some(p=>p.id!==replaces&&held(domain,p)&&
    (conflict(p,action)||(p.pawn===pawn&&p.action.kind!=='move')))||(!replacing&&(ch?.commitment||ch?.intention)))
    throw Error('Rescue patient, bed or pawn already held');
  if(!v.options.some(a=>a.target===action.target&&a.bed===action.bed&&a.x===action.x&&a.z===action.z))
    throw Error('Rescue scope is not an observed patient and bed');
  return v.mapId;
}
