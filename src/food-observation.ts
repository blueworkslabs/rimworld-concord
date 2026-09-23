import {z} from 'zod';
import type {Domain,GameState,Pawn} from './protocol.js';
const id=z.string().min(1).max(120),n=z.number().int().nonnegative();
const point={thing:id,x:n,z:n,forbidden:z.boolean()};
export const FoodObservation=z.object({source:z.literal('shared-local-sighting'),epoch:id,tick:n,mapId:n,radius:z.literal(12),truncated:z.boolean(),
 items:z.array(z.object({...point,label:z.string().max(160),count:n.positive(),nutritionGiving:z.boolean(),simpleMealIngredientCount:n})).max(8),
 campfires:z.array(z.object({...point,usableForBills:z.boolean()})).max(4)});
export type FoodObservation=z.infer<typeof FoodObservation>;
/** Allowlist strips any future private fields; no fallback to omniscient inventory. */
export function foodObservation(g:GameState,p:Pawn):FoodObservation|undefined{
 const s=FoodObservation.safeParse(p.foodObservation);if(!s.success)return;
 const v=s.data;if(v.epoch!==g.epoch||v.tick>g.ticks||g.ticks-v.tick>120||v.mapId!==(p.production?.mapId??p.hauling?.mapId))return;
 if(new Set(v.items.map(x=>x.thing)).size!==v.items.length||new Set(v.campfires.map(x=>x.thing)).size!==v.campfires.length)return;
 return v;
}
export function sharedFood(d:Domain,g:GameState){return Object.values(d.characters).slice(0,16).map(c=>{
 const p=g.pawns.find(p=>p.id===c.id),s=p&&foodObservation(g,p);
 return {observer:c.id,name:c.name,...(s?{status:'observed' as const,...s}:{status:'unknown' as const})};
});}
export type SharedFood=ReturnType<typeof sharedFood>;
export const foodKnowledge='Shared local sightings within 12 cells, line of sight and no fog; not colony inventory. Read observer, epoch, map, tick and truncation. Repeated thing IDs on the same map are overlapping sightings, not extra stock. Missing/out-of-sight food is unknown, not absent globally. Nutrition-giving is a native item property, not a guarantee that this pawn can or should eat it. Counts, forbidden flags and usable campfires are observations, not reservations, consent or guaranteed jobs. A simple meal needs the listed ingredient count plus a usable campfire, eligible willing pawn and fresh native execution checks. Building one campfire needs 20 wood and a legal site; building and cooking require separate consent. There is no agent-directed eat action: saying a pawn will eat does not start a job. Native self-care selects food using its own hunger and preference rules and may postpone raw food. Shared-link low/urgent bands are not native hunger categories.';
export function foodLines(sightings:SharedFood):string[]{return sightings.flatMap(s=>{
 if(s.status==='unknown')return [`${s.name}: local food sightings unknown.`];
 const prefix=`${s.name} @${s.tick}, map ${s.mapId}, radius ${s.radius}`;
 return [`${prefix}: ${s.truncated?'bounded/truncated sightings':'local sightings only'}; not colony inventory.`,
 ...s.items.map(x=>`${x.label} [${x.thing}] at ${x.x},${x.z}: ${x.count} units; nutrition-giving ${x.nutritionGiving}; simple-meal ingredient count ${x.simpleMealIngredientCount||'not compatible'}; forbidden ${x.forbidden}.`),
 ...s.campfires.map(x=>`Campfire [${x.thing}] at ${x.x},${x.z}: usable for bills ${x.usableForBills}; forbidden ${x.forbidden}.`),
 ...(!s.items.length?['No nutrition items in this local sighting; elsewhere unknown.']:[]),...(!s.campfires.length?['No campfire in this local sighting; elsewhere unknown.']:[])];
}).concat([foodKnowledge]);}
