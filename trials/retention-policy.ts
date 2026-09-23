import assert from 'node:assert/strict';
import type {AttentionView} from '../src/attention.js';
import {reflectionChoiceSchema} from '../src/reflection-choice.js';
import type {Domain,GameState} from '../src/protocol.js';
export const retentionRequest='Could you leave this load of wood for me? I want to finish what I started. It matters to me.';
/** Equal action menus, not identical evidence: the treatment adds received speech. */
export function retentionMenu(view:AttentionView):string[]{
 const schema=reflectionChoiceSchema(view,{});
 const choices=schema.oneOf.map((x:any)=>x.properties.choice.const).sort();
 assert.deepEqual(choices,['keep_current_activity','revise_private_outlook']);
 assert(view.character.experiences?.some(e=>e.event.pawn===view.character.id));
 assert.equal(view.proposals.length,0);assert.equal(view.intention,undefined);
 return choices;
}
export function retainedDomain(actual:Domain,expected:Domain){
 for(const key of ['characters','proposals','outcomes','exchanges'] as const)assert.deepEqual(actual[key],expected[key]);
 assert.deepEqual(actual.crew?.entries,expected.crew?.entries);
}
export function noReflectionEffects(before:Domain,after:Domain,worldBefore:GameState,worldAfter:GameState,owner:string){
 assert.deepEqual(after.proposals,before.proposals);assert.deepEqual(after.outcomes,before.outcomes);
 assert.deepEqual(after.crew?.entries,before.crew?.entries);
 assert.deepEqual(worldAfter.actions,worldBefore.actions);assert.deepEqual(worldAfter.pawns,worldBefore.pawns);
 for(const id of Object.keys(before.characters))if(id!==owner)assert.deepEqual(after.characters[id],before.characters[id]);
}
/** Local to the inference host: does not depend on SSH delivering cancellation. */
export function retentionDeadline(ms=45000){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),ms);
 return {controller,dispose:()=>clearTimeout(timer)};
}
