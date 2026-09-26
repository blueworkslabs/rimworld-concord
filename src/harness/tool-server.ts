import {appendFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
export type CallKind='observation'|'input'|'control'|'done'|'error';
export type CallLog={event:'issued'|'completed';id:string;at:number;tool:string;kind:CallKind;ok?:boolean;bytes?:number;args?:unknown;response?:unknown;durationMs?:number};
export type ToolResult={content:Array<{type:'text';text:string}|{type:'image';data:string;mimeType:string}>;isError?:boolean};
export const result=(value:unknown,error=false):ToolResult=>({content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}],...(error?{isError:true}:{})});
export interface ObserverHooks {before():Promise<void>;after(done:boolean):Promise<void>}
/** Trusted common framing/journal. Failed inputs still count as inputs; issued records survive timeout. */
export class ToolServer {
 done=false;
 constructor(private name:string,private tools:readonly unknown[],private kinds:Record<string,CallKind>,private execute:(name:string,args:any)=>Promise<ToolResult>,private logPath?:string,private hooks?:ObserverHooks){}
 private log(e:CallLog){if(this.logPath)appendFileSync(this.logPath,JSON.stringify(e)+'\n');}
 async handle(msg:any):Promise<unknown|undefined>{
  const ok=(r:unknown)=>({jsonrpc:'2.0',id:msg.id,result:r});
  if(msg.id===undefined)return undefined;
  if(msg.method==='initialize')return ok({protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:this.name,version:'2'}});
  if(msg.method==='ping')return ok({});
  if(msg.method==='tools/list')return ok({tools:this.tools});
  if(msg.method==='resources/list')return ok({resources:[]});
  if(msg.method==='resources/templates/list')return ok({resourceTemplates:[]});
  if(msg.method!=='tools/call')return {jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}};
  const name=String(msg.params?.name),args=msg.params?.arguments??{},id=randomUUID(),at=Date.now(),kind=this.kinds[name]??'error';
  this.log({event:'issued',id,at,tool:name,kind,args});
  let r:ToolResult;
  try{
   if(this.done)throw Error('Run ended; no further commands allowed');
   if(!this.kinds[name])throw Error('Unknown tool');
   await this.hooks?.before();
   r=await this.execute(name,args);
   if(name==='report_done'&&!r.isError)this.done=true;
   await this.hooks?.after(this.done);
  }catch(e){r=result(String(e instanceof Error?e.message:e),true);}
  this.log({event:'completed',id,at:Date.now(),tool:name,kind,ok:!r.isError,bytes:Buffer.byteLength(JSON.stringify(r)),durationMs:Date.now()-at,response:r});
  return ok(r);
 }
 async serve(input:NodeJS.ReadableStream=process.stdin,output:NodeJS.WritableStream=process.stdout){
  for await(const line of createInterface({input})){
   if(!line.trim())continue;let msg:unknown;
   try{msg=JSON.parse(line);}catch{output.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');continue;}
   const out=await this.handle(msg);if(out)output.write(JSON.stringify(out)+'\n');
  }
 }
}
