import type { DecisionBackend, Decision } from './protocol.js';
/** Scripted test double, not an intelligent personality model. */
export function scripted(decision:Decision):DecisionBackend {
  return {name:'scripted',async decide(_view,signal) {
    if(signal.aborted) throw Error('Cancelled');
    return structuredClone(decision);
  }};
}
