import assert from 'node:assert/strict';
import type { Domain, Pawn, Proposal } from './protocol.js';

/** Operator-authored evaluation preferences, NOT native memories or emergent personality.
 * They constrain a hypothetical optional exercise, never prescribe an output enum.
 */
export function negotiationPreferences(pawns:Pawn[]) {
 if(pawns.length!==3)throw Error('Three-pawn fixture required');
 return pawns.map((p,i)=>({pawn:p.id,anchor:{x:p.x,z:p.z},tag:['short-walk','stay-local','native-routine'][i]!,maxDistance:[20,2,0][i]!,
   memory:'[Operator-authored test preference; not a native game memory] '+[
     `For this optional movement-link exercise I am willing to take short walks up to 20 tiles (Manhattan distance) from my starting point (${p.x}, ${p.z}), unless my actual needs make that a bad idea.`,
     `For this optional movement-link exercise I want to stay within two tiles (Manhattan distance) of my starting point (${p.x}, ${p.z}). I am willing to help with a small local walk, but a longer detour is more than I want.`,
     'I do not want optional movement-test jobs right now. I prefer to continue my native routine. This is a personal preference, not a medical diagnosis or a claim that I am injured.'
   ][i]!
 }));
}
export function withinPreference(p:Proposal,fixture:ReturnType<typeof negotiationPreferences>[number]) {
 if(!p.decision)return false;
 if((p.decision.kind==='refuse'||p.decision.kind==='defer'))return true;
 if(fixture.tag==='native-routine')return false;
 const action=p.decision.kind==='accept'?p.action:p.decision.action;
 return Math.abs(action.x-fixture.anchor.x)+Math.abs(action.z-fixture.anchor.z)<=fixture.maxDistance;
}

/** Continuing known completed choices is not retrying uncertain inference. Fail closed on gaps. */
export function verifyNegotiationContinuation(state:Domain,partial:{decisions:Proposal[];views:{proposal:string}[]},attempts:number) {
 assert(Number.isInteger(attempts)&&attempts>=1&&attempts<=5);
 assert.equal(partial.decisions.length,attempts);assert.equal(partial.views.length,attempts);
 assert.equal(Object.keys(state.proposals).length,attempts);
 assert.equal(new Set(partial.views.map(v=>v.proposal)).size,attempts);
 assert(Object.values(state.proposals).every(p=>p.status!=='pending'));
 assert(Object.values(state.characters).every(c=>!c.commitment));
 assert(Object.values(state.outcomes).every(o=>o.status!=='started'));
 for(const [i,p] of partial.decisions.entries()) {
   assert.equal(partial.views[i]!.proposal,p.id);
   const actual=state.proposals[p.id];assert(actual);
   // A later agreed revision may add replyId to an earlier counter, never change its answer.
   assert.deepEqual({...actual,replyId:undefined},{...p,replyId:undefined});
   if(p.actionId)assert(state.outcomes[p.actionId]);
 }
}
