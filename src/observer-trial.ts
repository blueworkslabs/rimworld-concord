import type {Domain} from './protocol.js';
export const OBSERVER_TRIAL={decisions:12,appraisals:12,reflections:6,observationMs:300000,secondRoundMs:120000,maxNativeTurns:100,maxModelTurns:12} as const;
/** Core sees only deliberately addressed requests. Finished or rejected work is not silently revived. */
export function pendingObserverRequest(d:Domain,seen:Set<string>){return Object.values(d.requests??{}).find(r=>r.status==='pending'&&!seen.has(r.id));}
