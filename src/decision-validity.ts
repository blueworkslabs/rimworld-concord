import type {GameState,Proposal} from './protocol.js';
/** Missing bounded observations are unknown, not contradictory evidence. */
export function rescueQuestionInvalid(game:GameState,p:Proposal):string|undefined {
 if(p.status!=='pending')return 'Offered rescue is no longer pending';
 if(p.action.kind!=='rescue')return;
 const own=game.pawns.find(x=>x.id===p.pawn),a=p.action;
 if(!own||own.downed||own.rescueReady===false)return 'Rescuer is no longer available';
 const views=[own.rescue,own.casualties];
 if(views.some(v=>v&&v.epoch===game.epoch&&v.tick===game.ticks&&v.mapId!==p.rescueMap))return 'Rescuer changed map';
 const v=own.casualties;
 if(!v||v.epoch!==game.epoch||v.tick!==game.ticks||v.mapId!==p.rescueMap)return;
 const target=v.visibleSubjects?.find(t=>t.target===a.target);
 if(target&&(!target.downed||target.inBed))return 'Observed patient no longer needs this rescue';
 const bed=v.visibleBeds?.find(b=>b.bed===a.bed);
 if(bed&&(bed.x!==a.x||bed.z!==a.z||!bed.medical||bed.occupied||bed.prisoner||bed.slave||!bed.colonyOwned||bed.forbidden))
  return 'Observed bed no longer supports this rescue';
}
