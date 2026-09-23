import type {GameState,Pawn} from './protocol.js';
/** Names are native display labels, not unique IDs or access to another pawn's state. */
export function observedPeople(game:GameState,own:Pawn):{id:string;name:string}[]{
 const seen=own.casualties;
 if(!seen||seen.epoch!==game.epoch||seen.tick!==game.ticks)return [];
 const ids=new Set([...(seen.visibleSubjects??[]).map(x=>x.target),...seen.observations.map(x=>x.target)]);
 return game.pawns.filter(p=>p.id!==own.id&&ids.has(p.id)).map(p=>({id:p.id,name:p.name.slice(0,120)}));
}
