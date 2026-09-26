import {randomUUID} from 'node:crypto';
import {Action,type Receipt} from './actions.js';
import {digest,look,since,type Snapshot} from './perception.js';
import {PlacementQuery,type PlacementResult} from './placement.js';
import {ToolServer,result,type ObserverHooks} from './tool-server.js';
export type {CallLog,CallKind} from './tool-server.js';
export interface HarnessBridge{perceive():Promise<Snapshot>;placement(q:PlacementQuery):Promise<PlacementResult>;act(action:unknown,requestId?:string):Promise<Receipt>;time(control:'pause'|'play'|1|2|3):Promise<void>}
const obj=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
export const TOOLS=[
  {name:'observe',description:'See the colony as a player would: time, weather, alerts, letters, resources, visible buildings, blueprints, frames, items and plants (grouped by type), zones, bills, pending orders, research, every colonist (needs, mood and its reasons, health, skills, work priorities, schedule) and threats. Also returns what changed since your previous observe, and the receipts of your recent actions.',inputSchema:obj({})},
  {name:'look',description:'Look closer without scrolling: {"by":"area","x":..,"z":..,"radius":..} or {"by":"area","thing":id,"radius":..}; {"by":"category","category":"food|wood|beds|workbenches|blueprints|items|buildings|plants|corpses"}; {"by":"def","def":"WoodLog"}; {"by":"capability","work":"Cooking"}; {"by":"pawn","pawn":id|name}; {"by":"section","section":"zones|letters|bills|designations|research|weather|time|alerts|resources|threats|omitted|receipts"}; {"by":"placement","def":"Campfire","x":..,"z":..,"rot"?:0-3,"stuff"?:"WoodLog","radius"?:1-30,"count"?:1-20} asks the game whether that building can be placed there (the same check as the build cursor; nothing is placed) and lists the nearest cells where it can.',
    inputSchema:obj({query:{type:'object',description:'One query object as described.'}},['query'])},
  {name:'act',description:'Use one player control. Actions: place_blueprint {def,x,z,rot?,stuff?}; designate {kind: deconstruct|cancel|mine|harvest|cut|hunt|haul, thing? or x,z}; zone {kind: stockpile|growing, cells:[{x,z}], label?, priority?, allow?, plant?} or {zone:id, cells, ...}; bill {bench:id, recipe, repeat: count|forever|until, count?, radius?}; bill_edit {bill, repeat?, count?, radius?, suspended?}; bill_delete {bill}; work_priority {pawn:id, work, priority 0-4}; schedule {pawn:id, hour, assignment: Anything|Work|Joy|Sleep|Meditate}; forbid {thing:id, forbidden}; allow_area {pawn:id, area|null}. No drafting, no direct job orders. Returns an acceptance or refusal, labelled as game or harness validation. Accepted is not done: check later observations.',
    inputSchema:obj({action:{type:'object',description:'One action object, e.g. {"action":"place_blueprint","def":"Campfire","x":10,"z":12}.'}},['action'])},
  {name:'time',description:'Pause, play, or set game speed 1-3 (the same controls the player has).',inputSchema:obj({control:{type:'string',enum:['pause','play','1','2','3']}},['control'])},
  {name:'report_done',description:'Say the task is finished. Call this once, when you believe the task is complete; the run ends.',inputSchema:obj({summary:{type:'string'}},['summary'])},
] as const;

export class HarnessMcp extends ToolServer {
 constructor(bridge:HarnessBridge,logPath?:string,onDone?:(summary:string)=>void,hooks?:ObserverHooks){
  let previous:Snapshot|undefined;
  super('concord-harness',TOOLS,{observe:'observation',look:'observation',act:'input',time:'control',report_done:'done'},async(name,args)=>{
   if(name==='observe'){
    const s=await bridge.perceive(),change=previous?since(previous,s):null;previous=s;
    // Never append the potentially full, unbounded diff to a fitted digest.
    const changed=change?{reset:change.reset,fromTick:'fromTick' in change?change.fromTick:null,toTick:s.meta.tick,detail:'Current digest below; use look for individual detail.'}:null;
    return result({colony:digest(s),changedSinceLastObserve:changed});
   }
   if(name==='look'){
    if((args.query as {by?:unknown}|undefined)?.by==='placement'){
     const q=PlacementQuery.safeParse(args.query);
     if(!q.success)return result({ok:false,source:'harness',reason:q.error.issues.map(i=>i.message).join('; ')},true);
     return result(await bridge.placement(q.data));
    }
    return result(look(await bridge.perceive(),args.query));
   }
   if(name==='act'){
    const parsed=Action.safeParse(args.action);
    if(!parsed.success)return result({ok:false,source:'harness',reason:parsed.error.issues.map(i=>i.message).join('; ')},true);
    const r=await bridge.act(parsed.data,randomUUID());return result(r,!r.ok);
   }
   if(name==='time'){
    const c=String(args.control);if(!['pause','play','1','2','3'].includes(c))return result('Invalid time control',true);
    await bridge.time(c==='pause'||c==='play'?c:Number(c) as 1|2|3);return result({ok:true,control:c});
   }
   if(typeof args.summary!=='string')return result('summary must be text',true);
   onDone?.(args.summary);return result({ok:true,message:'Run ended.'});
  },logPath,hooks);
 }
}
