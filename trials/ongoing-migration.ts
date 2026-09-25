/** Frozen ordinary-play trial configuration. Never enable the parked growing experiment here. */
import {z} from 'zod';
import assert from 'node:assert/strict';
import {NativeHaulEntry,type NativeHaulEntry as Entry} from '../src/native-intents.js';
import type {CoreView} from '../src/core-planner.js';
import type {Domain} from '../src/protocol.js';
export const MigrationLiveSetup=z.object({
 save:z.string().regex(/^lab-[a-zA-Z0-9_-]+$/),
 entries:z.array(NativeHaulEntry.refine(e=>e.hold==='strict'&&e.variant==='attribution','Strict attribution only')).min(1)
}).strict();
export const migrationBrief='Consider the crew’s shared bodily needs and local supplies. You can ask, propose useful work or wait. The shared wood stockpile haul, rescue, campfire construction and cooking are optional capabilities; eating raw food is a legitimate alternative. Alvin, Beatrice and Pedro have equal standing, with no assigned roles or required responses. Respect refusal and deferral. Follow up on actual outcomes; no requirement to keep people busy or finish a particular plan.';
export function assertMigrationMenu(v:CoreView,entries:Entry[],eligible:string[]){
 assert(!v.opportunities.some(o=>o.action.kind==='haul'),'Ordered hauling must be absent');
 assert(v.opportunities.some(o=>o.action.kind!=='haul-zone'),'Ordinary-play menu must retain other work');
 for(const entry of entries)assert.deepEqual(v.opportunities.filter(o=>o.action.kind==='haul-zone'&&o.action.intentId===entry.intentId).map(o=>o.pawn).sort(),[...eligible].sort(),'Both capable pawns must initially be offerable');
}
export function migrationCoverage(d:Domain,entries:Entry[],eligible:string[]){
 assert.equal(d.nativeIntentOnly,false,'Ordinary-play mode required');
 assert(!Object.values(d.proposals).some(p=>p.action.kind==='haul'),'Ordered hauling was proposed');
 const hauls=Object.values(d.proposals).filter(p=>p.action.kind==='haul-zone');
 assert(hauls.every(p=>p.action.kind==='haul-zone'&&entries.map(e=>e.intentId).includes(p.action.intentId)&&eligible.includes(p.pawn)),'Only frozen native hauls and capable crew');
 const missing=entries.flatMap(e=>eligible.filter(pawn=>!hauls.some(p=>p.pawn===pawn&&p.action.kind==='haul-zone'&&p.action.intentId===e.intentId)).map(pawn=>({intentId:e.intentId,pawn})));
 return {missing,offered:hauls.map(p=>({id:p.id,pawn:p.pawn,status:p.status})),complete:missing.length===0};
}
