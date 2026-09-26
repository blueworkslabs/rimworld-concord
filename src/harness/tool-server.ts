import {appendFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
export type CallKind='observation'|'input'|'control'|'done'|'error';
export type CallLog={event:'issued'|'completed';id:string;at:number;tool:string;kind:CallKind;ok?:boolean;bytes?:number;args?:unknown;response?:unknown;durationMs?:number;observerFailure?:string;actionResponse?:ToolResult};
export type ToolResult={content:Array<{type:'text';text:string}|{type:'image';data:string;mimeType:string}>;isError?:boolean};
export const result=(value:unknown,error=false):ToolResult=>({content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}],...(error?{isError:true}:{})});
export interface ObserverHooks {before():Promise<void>;after(done:boolean):Promise<void>}
/** Trusted common framing/journal. Failed inputs still count as inputs; issued records survive timeout. */
export class ToolServer {
 done=false;
 constructor(private name:string,private tools:readonly unknown[],private kinds:Record<string,CallKind|((args:any)=>CallKind)>,private execute:(name:string,args:any)=>Promise<ToolResult>,private logPath?:string,private hooks?:ObserverHooks){}
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
  const name=String(msg.params?.name),args=msg.params?.arguments??{},id=randomUUID(),at=Date.now(),kindSpec=this.kinds[name],kind=typeof kindSpec==='function'?kindSpec(args):kindSpec??'error';
  this.log({event:'issued',id,at,tool:name,kind,args});
  let r:ToolResult,observerFailure:string|undefined,actionResponse:ToolResult|undefined;
  if(this.done)r=result('Run ended; no further commands allowed',true);
  else if(!this.kinds[name])r=result('Unknown tool',true);
  else {
   let beforeOk=false;
   try{await this.hooks?.before();beforeOk=true;}catch(e){observerFailure=String(e);}
   if(beforeOk){
    try{r=await this.execute(name,args);}catch(e){r=result(String(e instanceof Error?e.message:e),true);}
    actionResponse=r;
    if(name==='report_done'&&!r.isError)this.done=true;
    // Observe after an execution error too: an input may have partially reached the game.
    try{await this.hooks?.after(this.done);}catch(e){observerFailure=String(e);}
   }else r=result('Hidden observer failed before dispatch; input was not executed',true);
   if(observerFailure){
    this.done=true;
    r={...r!,isError:true,content:[...r!.content,{type:'text',text:'Benchmark observer failed; run closed. Any original action reply above remains authoritative. '+observerFailure}]};
   }
  }
  this.log({event:'completed',id,at:Date.now(),tool:name,kind,ok:!r!.isError,bytes:Buffer.byteLength(JSON.stringify(r!)),durationMs:Date.now()-at,response:r!,...(observerFailure?{observerFailure}:{}),...(observerFailure&&actionResponse?{actionResponse}:{})});
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
