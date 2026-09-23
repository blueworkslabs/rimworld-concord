import {held,productionView} from './production-planning.js';
import {foodObservation} from './food-observation.js';
import {sharedStatus} from './shared-status.js';
import {observedPeople} from './observed-names.js';
import {rescueView} from './rescue-planning.js';
import type {Domain,GameState,Haul,HaulingView,Pawn,Proposal} from './protocol.js';

/** Conservative whole-stack/cell planning holds, not native reservations.
 * Keep uncertain cancellation held until the matching commitment reconciles. */
function holds(domain:Domain):Proposal[] {
  return Object.values(domain.proposals).filter(p=>p.action.kind==='haul'&&
    (p.status==='pending'||p.standing?.status==='running'||
      (!!p.actionId&&domain.characters[p.pawn]?.commitment===p.actionId)));
}
function conflicts(p:Proposal,action:Haul,mapId:number):boolean {
  return (p.action.kind==='haul'||p.action.kind==='build'||p.action.kind==='cook')&&(p.action.thing===action.thing||
    ((p.haulMap===undefined||p.haulMap===mapId)&&p.action.x===action.x&&p.action.z===action.z));
}
export function haulingView(domain:Domain,game:GameState,own:Pawn):HaulingView|null {
  const view=structuredClone(own.hauling??null);
  if(!view)return null;
  // Legacy or stale observations are unknown, not permission to invent quantities.
  if(view.epoch!==game.epoch||view.tick!==game.ticks||!Number.isInteger(view.mapId)||!view.supplies) {
    view.options=[];view.supplies=[];return view;
  }
  const other=held(domain).filter(p=>p.pawn!==own.id);
  view.options=view.options.filter(a=>!other.some(p=>conflicts(p,a,view.mapId!)));
  view.supplies=view.supplies.filter(s=>view.options.some(a=>a.thing===s.thing&&a.x===s.x&&a.z===s.z));
  return view;
}
export function groundedPawn(domain:Domain,game:GameState,own:Pawn):Pawn {
  const copy=structuredClone(own),view=haulingView(domain,game,own);
  if(view)copy.hauling=view;
  const people=observedPeople(game,own);if(people.length)copy.observedPeople=people;else delete copy.observedPeople;
  const rescue=rescueView(domain,game,own);if(rescue)copy.rescue=rescue;
  const production=productionView(domain,game,own);if(production)copy.production=production;
  copy.foodObservation=foodObservation(game,own);
  copy.sharedStatus=sharedStatus(domain,game);
  return copy;
}
export function planHaul(domain:Domain,game:GameState,pawn:string,action:Haul):number {
  const own=game.pawns.find(p=>p.id===pawn),view=own?.hauling;
  if(!own||!view||view.status!=='available'||view.epoch!==game.epoch||view.tick!==game.ticks||
    !Number.isInteger(view.mapId)||view.mapId!<0)throw Error('Fresh mapped hauling observation required');
  if(Object.values(domain.proposals).some(p=>p.pawn===pawn&&p.action.kind==='rescue'&&
    (p.status==='pending'||p.standing?.status==='running'||domain.characters[pawn]?.commitment===p.actionId&&!!p.actionId)))throw Error('Pawn already held by rescue work');
  if(held(domain).some(p=>p.pawn===pawn||conflicts(p,action,view.mapId!)))
    throw Error('Hauling source, destination or pawn already held by an offer or commitment');
  const option=view.options.find(a=>a.thing===action.thing&&a.x===action.x&&a.z===action.z);
  const supply=view.supplies?.find(s=>s.thing===action.thing&&s.x===action.x&&s.z===action.z);
  if(!option||!supply||action.count>option.count||
    !Number.isInteger(supply.sourceCount)||!Number.isInteger(supply.destinationFree)||
    action.count*action.trips>Math.min(supply.sourceCount,supply.destinationFree))
    throw Error('Hauling scope exceeds observed supply, destination capacity or per-trip option');
  return view.mapId!;
}
