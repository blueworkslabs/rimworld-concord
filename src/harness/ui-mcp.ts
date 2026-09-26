import {ToolServer,result,type ToolResult,type ObserverHooks} from './tool-server.js';
const obj=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
export const UI_TOOLS=[
 {name:'screenshot',description:'See the game screen, 1280 by 800 pixels.',inputSchema:obj({})},
 {name:'click',description:'One mouse click at a screen coordinate. Button 1 left, 3 right, 4/5 wheel. Delivery does not prove the game accepted it; inspect a screenshot.',inputSchema:obj({x:{type:'integer',minimum:0,maximum:1279},y:{type:'integer',minimum:0,maximum:799},button:{type:'integer',minimum:1,maximum:5}},['x','y'])},
 {name:'key',description:'One game key: Escape, space (pause toggle), 1/2/3 (speed), Return, Tab, arrows, editing keys, or a lowercase letter. No draft or direct pawn job orders, per task rules.',inputSchema:obj({key:{type:'string'}},['key'])},
 {name:'type',description:'Type printable text, at most 120 characters, into the focused game field.',inputSchema:obj({text:{type:'string',maxLength:120}},['text'])},
 {name:'report_done',description:'End the run when you believe the task is complete.',inputSchema:obj({summary:{type:'string'}},['summary'])},
] as const;
export class UiMcp extends ToolServer{
 constructor(backend:(arg:unknown)=>Promise<any>,logPath?:string,hooks?:ObserverHooks){
  super('concord-ui',UI_TOOLS,{screenshot:'observation',click:'input',key:(a:any)=>['space','1','2','3'].includes(a.key)?'control':'input',type:'input',report_done:'done'},async(name,a):Promise<ToolResult>=>{
   if(name==='report_done'){if(typeof a.summary!=='string')return result('summary required',true);return result({ok:true,message:'Run ended.'});}
   const r=await backend({...a,op:name});
   if(r.error)return result(r.error,true);
   if(name==='screenshot'){
    if(r.mimeType!=='image/png'||typeof r.image!=='string')throw Error('Invalid screenshot transport');
    return {content:[{type:'image',data:r.image,mimeType:'image/png'}]};
   }
   return result(r);
  },logPath,hooks);
 }
}
