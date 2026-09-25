import {productionView} from './production-planning.js';
import {foodObservation} from './food-observation.js';
import {sharedStatus} from './shared-status.js';
import {observedPeople} from './observed-names.js';
import {rescueView} from './rescue-planning.js';
import type {Domain,GameState,Pawn} from './protocol.js';

/** A pawn's own grounded view: only current, deliberately public observations and its own offers. */
export function groundedPawn(domain:Domain,game:GameState,own:Pawn):Pawn {
  const copy=structuredClone(own);
  const people=observedPeople(game,own);if(people.length)copy.observedPeople=people;else delete copy.observedPeople;
  const rescue=rescueView(domain,game,own);if(rescue)copy.rescue=rescue;
  const production=productionView(domain,game,own);if(production)copy.production=production;
  copy.foodObservation=foodObservation(game,own);
  copy.sharedStatus=sharedStatus(domain,game);
  return copy;
}
