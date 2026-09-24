/** Operator-side assertions for the frozen native scene; never changes pawn choices. */
import assert from 'node:assert/strict';
import type {Domain,GameState} from '../src/protocol.js';
import {IntentView,invariantFindings} from '../src/native-intents.js';
export function nativeSceneCrew(game:GameState){
 const find=(name:string)=>{const ps=game.pawns.filter(p=>p.name===name);assert.equal(ps.length,1,'Frozen crew missing or ambiguous: '+name);return ps[0]!;};
 const alvin=find('Alvin'),pedro=find('Pedro'),beatrice=find('Beatrice');
 assert.equal(alvin.haulingCapable,false,'Alvin must remain natively ineligible');
 for(const p of [pedro,beatrice])assert.equal(p.haulingCapable,true,p.name+' must be natively hauling-capable');
 assert.equal(game.pawns.length,3,'Frozen scene has exactly three colonists, two capable');
 return {eligible:[pedro.id,beatrice.id],ineligible:alvin.id};
}
export function nativeOfferCoverage(domain:Domain,eligible:string[]){
 const proposals=Object.values(domain.proposals),id=domain.nativeHaul?.intentId;
 assert(id,'Native setup missing');
 assert(proposals.every(p=>p.action.kind==='haul-zone'&&p.action.intentId===id&&eligible.includes(p.pawn)),'Only the frozen intent may be offered to eligible crew');
 const missing=eligible.filter(pawn=>!proposals.some(p=>p.pawn===pawn));
 assert.deepEqual(missing,[],'Frozen offer coverage missing; preserve this negative observation, do not force offers or reroll');
}
export function assertNativeLedger(game:GameState,intentId:string){
 const v=game.intents?.find(i=>i.intentId===intentId);
 if(v)assert.deepEqual(invariantFindings(IntentView.parse(v)),[],'Native ledger violation: stop and diagnose');
}
export function assertNativeRestore(game:GameState,expected:Domain){
 const actual=Object.fromEntries((game.intents??[]).map(raw=>{const v=IntentView.parse(raw);return [v.intentId,v];}));
 const saved=Object.fromEntries(Object.entries(expected.intentViews??{}).map(([id,v])=>[id,IntentView.parse(v)]));
 assert.deepEqual(actual,saved,'Restored GAME intents differ from paired checkpoint ledger');
 for(const id of Object.keys(actual))assertNativeLedger(game,id);
 return actual;
}
