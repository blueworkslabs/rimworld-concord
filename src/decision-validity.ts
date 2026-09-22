import type {GameState,Proposal} from './protocol.js';
/** Loss of local support is NOT proof of physical impossibility. It invalidates
 * this pending rescue question; any renewed offer requires fresh consent. */
export function rescueQuestionInvalid(game:GameState,p:Proposal):string|undefined {
 if(p.status!=='pending')return 'Offered rescue is no longer pending';
 if(p.action.kind!=='rescue')return;
 const own=game.pawns.find(x=>x.id===p.pawn),v=own?.rescue,a=p.action;
 if(!own||own.downed||own.rescueReady===false)return 'Rescuer is no longer available';
 if(!v||v.epoch!==game.epoch||v.tick!==game.ticks||v.mapId!==p.rescueMap||v.status!=='available')
  return 'Rescue question lost fresh local grounding';
 if(!v.options.some(o=>o.target===a.target&&o.bed===a.bed&&o.x===a.x&&o.z===a.z))
  return 'Offered patient and bed are no longer supported by current local options';
}
