import {appendFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {Action,type Receipt} from './actions.js';
import {digest,look,since,type Snapshot} from './perception.js';

/** The harness arm's tool server (docs/HARNESS.md, benchmark): a minimal MCP server over stdio
 * (newline-delimited JSON-RPC 2.0) that a fresh controller context talks to. It exposes only the
 * harness: `observe`, `look`, `act`, `time` (the shared pause/speed controls) and `report_done`.
 * Every call is written to the benchmark call log in the shared format both arms use:
 *   {at, tool, kind: observation|input|control|done|error, ok, bytes, detail?}
 * The runner counts inputs, observations and errors from that log for either arm. */
export type CallKind='observation'|'input'|'control'|'done'|'error';
export type CallLog={at:number;tool:string;kind:CallKind;ok:boolean;bytes:number;detail?:string};
export interface HarnessBridge{perceive():Promise<Snapshot>;act(action:unknown,requestId?:string):Promise<Receipt>;time(control:'pause'|'play'|1|2|3):Promise<void>}

const obj=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
export const TOOLS=[
  {name:'observe',description:'See the colony as a player would: time, weather, alerts, letters, resources, visible buildings, blueprints, frames, items and plants (grouped by type), zones, bills, pending orders, research, every colonist (needs, mood and its reasons, health, skills, work priorities, schedule) and threats. Also returns what changed since your previous observe, and the receipts of your recent actions.',inputSchema:obj({})},
  {name:'look',description:'Look closer without scrolling: {"by":"area","x":..,"z":..,"radius":..} or {"by":"area","thing":id,"radius":..}; {"by":"category","category":"food|wood|beds|workbenches|blueprints|items|buildings|plants|corpses"}; {"by":"def","def":"WoodLog"}; {"by":"capability","work":"Cooking"}; {"by":"pawn","pawn":id|name}; {"by":"section","section":"zones|letters|bills|designations|research|weather|time|alerts|resources|threats|omitted|receipts"}.',
    inputSchema:obj({query:{type:'object',description:'One query object as described.'}},['query'])},
  {name:'act',description:'Use one player control. Actions: place_blueprint {def,x,z,rot?,stuff?}; designate {kind: deconstruct|cancel|mine|harvest|cut|hunt|haul, thing? or x,z}; zone {kind: stockpile|growing, cells:[{x,z}], label?, priority?, allow?, plant?} or {zone:id, cells, ...}; bill {bench:id, recipe, repeat: count|forever|until, count?, radius?}; bill_edit {bill, repeat?, count?, radius?, suspended?}; bill_delete {bill}; work_priority {pawn:id, work, priority 0-4}; schedule {pawn:id, hour, assignment: Anything|Work|Joy|Sleep|Meditate}; forbid {thing:id, forbidden}; allow_area {pawn:id, area|null}. No drafting, no direct job orders. Returns the game\'s receipt: accepted with an id, or refused with the game\'s reason. Accepted is not done: check later observations.',
    inputSchema:obj({action:{type:'object',description:'One action object, e.g. {"action":"place_blueprint","def":"Campfire","x":10,"z":12}.'}},['action'])},
  {name:'time',description:'Pause, play, or set game speed 1-3 (the same controls the player has).',inputSchema:obj({control:{type:'string',enum:['pause','play','1','2','3']}},['control'])},
  {name:'report_done',description:'Say the task is finished. Call this once, when you believe the task is complete; the run ends.',inputSchema:obj({summary:{type:'string'}},['summary'])},
] as const;

export class HarnessMcp {
  private previous?:Snapshot;done=false;
  constructor(private bridge:HarnessBridge,private logPath?:string,private onDone?:(summary:string)=>void){}
  private log(e:Omit<CallLog,'at'>){if(this.logPath)appendFileSync(this.logPath,JSON.stringify({at:Date.now(),...e})+'\n');}
  private async call(name:string,args:any):Promise<{text:string;isError?:boolean}>{
    const reply=(tool:string,kind:CallKind,ok:boolean,value:unknown,detail?:string)=>{const text=typeof value==='string'?value:JSON.stringify(value);
      this.log({tool,kind:ok?kind:'error',ok,bytes:Buffer.byteLength(text),...(detail?{detail}:{})});return {text,...(ok?{}:{isError:true})};};
    try{
      if(name==='observe'){const s=await this.bridge.perceive();const changed=this.previous?since(this.previous,s):null;this.previous=s;
        return reply(name,'observation',true,{colony:digest(s),changedSinceLastObserve:changed});}
      if(name==='look'){const s=await this.bridge.perceive();return reply(name,'observation',true,look(s,args?.query));}
      if(name==='act'){const parsed=Action.safeParse(args?.action);
        if(!parsed.success)return reply(name,'input',false,{ok:false,source:'harness',reason:parsed.error.issues.map(i=>i.message).join('; ')},'invalid action');
        const r=await this.bridge.act(parsed.data,randomUUID());return reply(name,'input',r.ok,r,r.ok?undefined:`${r.source}: ${r.reason}`);}
      if(name==='time'){const c=String(args?.control);if(!['pause','play','1','2','3'].includes(c))return reply(name,'control',false,'control must be pause, play, 1, 2 or 3');
        await this.bridge.time(c==='pause'||c==='play'?c:Number(c) as 1|2|3);return reply(name,'control',true,{ok:true,control:c});}
      if(name==='report_done'){this.done=true;const summary=String(args?.summary??'');const out=reply(name,'done',true,{ok:true,message:'Run ended.'},summary.slice(0,500));this.onDone?.(summary);return out;}
      return reply(name,'error',false,'unknown tool');
    }catch(e){return reply(name,'error',false,String(e instanceof Error?e.message:e));}
  }
  /** One JSON-RPC message in, zero or one out. */
  async handle(msg:any):Promise<unknown|undefined>{
    const ok=(result:unknown)=>({jsonrpc:'2.0',id:msg.id,result});
    if(msg.method==='initialize')return ok({protocolVersion:msg.params?.protocolVersion??'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'concord-harness',version:'1'}});
    if(msg.method==='notifications/initialized'||msg.id===undefined)return undefined;
    if(msg.method==='ping')return ok({});
    if(msg.method==='tools/list')return ok({tools:TOOLS});
    if(msg.method==='tools/call'){const r=await this.call(msg.params?.name,msg.params?.arguments??{});return ok({content:[{type:'text',text:r.text}],...(r.isError?{isError:true}:{})});}
    return {jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}};
  }
  /** Serve stdio until the input closes. Calls are handled one at a time, in order. */
  async serve(input:NodeJS.ReadableStream=process.stdin,output:NodeJS.WritableStream=process.stdout){
    for await(const line of createInterface({input})){
      if(!line.trim())continue;let msg:any;
      try{msg=JSON.parse(line);}catch{output.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');continue;}
      const out=await this.handle(msg);if(out)output.write(JSON.stringify(out)+'\n');
    }
  }
}
