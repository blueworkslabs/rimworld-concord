import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildLaunch,type LaunchOptions} from './controller-launch.js';

/** Controller isolation evidence (docs/HARNESS.md, benchmark): the exact scored command line
 * (buildLaunch) is pointed, by one appended provider override with the same auth mode and wire API,
 * at a local recorder that captures the first model request and answers with a short final message.
 * No game and no model. Headers (auth) are never recorded. */
export const DECLARED:Record<'harness'|'ui',string[]>={harness:['observe','look','act','time','report_done'],ui:['screenshot','click','key','type','report_done']};
/** Codex's built-in MCP resource readers: offered with any MCP server, identical in both arms; our
 * servers expose no resources. Nothing else may be offered besides the arm namespace. */
export const SHARED_TOOLS=['list_mcp_resources','list_mcp_resource_templates','read_mcp_resource'];
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export type ArmEvidence={arm:'harness'|'ui';controllerVersion:string;exit:number|null;responsesRequests:number;toolsCarrier:string;
  tools:{type:string;name:string|null;sha256:string;tools?:(string|null)[]}[];instructionsSha256:string|null;instructionsBytes:number;
  input:{type:string;role:string|null;sha256:string;bytes:number}[];model:unknown;reasoning:unknown;toolChoice:unknown;parallelToolCalls:unknown;stderrTail:string};

export async function recordFirstRequest(o:LaunchOptions,prompt:string,extra:Record<string,unknown>={},privateCopy?:string):Promise<ArmEvidence>{
  const bodies:{path:string;body:any}[]=[];
  const server=createServer((req,res)=>{let data='';req.on('data',d=>data+=d);req.on('end',()=>{
    let body:any=null;try{body=JSON.parse(data);}catch{}bodies.push({path:req.url??'',body});
    if(!/\/responses$/.test(req.url??'')){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':'text/event-stream'});
    const ev=(type:string,x:object)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...x})}\n\n`);
    ev('response.created',{response:{id:'resp_probe'}});
    ev('response.output_item.done',{item:{type:'message',role:'assistant',id:'msg_probe',content:[{type:'output_text',text:'probe complete'}]}});
    ev('response.completed',{response:{id:'resp_probe',usage:{input_tokens:0,input_tokens_details:{cached_tokens:0},output_tokens:0,output_tokens_details:{reasoning_tokens:0},total_tokens:0}}});
    res.end();
  });});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',()=>r()));
  try{
    const port=(server.address() as {port:number}).port;
    const probe={model_provider:'probe','model_providers.probe':{name:'Concord controller proof',base_url:`http://127.0.0.1:${port}/backend-api/codex`,wire_api:'responses',requires_openai_auth:true,request_max_retries:0,stream_max_retries:0,supports_websockets:false}};
    const {args,version}=buildLaunch(o,{...probe,...extra});
    const out=await new Promise<{code:number|null;stderr:string}>(resolve=>{
      const c=spawn(o.codex,args,{cwd:o.dir+'/cwd',stdio:['pipe','ignore','pipe']});let stderr='';
      c.stderr.on('data',d=>stderr+=d);c.stdin.end(prompt);
      const t=setTimeout(()=>c.kill('SIGKILL'),90000);c.on('close',code=>{clearTimeout(t);resolve({code,stderr});});
    });
    const mine=bodies.filter(r=>/\/responses$/.test(r.path));const first=mine[0]?.body;
    if(privateCopy)writeFileSync(privateCopy,JSON.stringify(first??null));
    // Tools arrive as the request's `tools` field or, for some catalog models (gpt-6-astra on
    // 0.153.4), as an `additional_tools` input item; both are collected and compared as tools.
    const offered=[...(first?.tools??[]),...(first?.input??[]).filter((i:any)=>i.type==='additional_tools').flatMap((i:any)=>i.tools??[])];
    return {arm:o.arm,controllerVersion:version,exit:out.code,responsesRequests:mine.length,
      toolsCarrier:first?.tools?'tools field':(first?.input??[]).some((i:any)=>i.type==='additional_tools')?'additional_tools input item':'none',
      tools:offered.map((t:any)=>({type:t.type,name:t.name??null,sha256:sha(JSON.stringify(t)),...(t.type==='namespace'?{tools:(t.tools??[]).map((x:any)=>x.name??x.function?.name??null)}:{})})),
      instructionsSha256:first?.instructions?sha(first.instructions):null,instructionsBytes:first?.instructions?.length??0,
      input:(first?.input??[]).filter((i:any)=>i.type!=='additional_tools').map((i:any)=>({type:i.type,role:i.role??null,sha256:sha(JSON.stringify(i.content??i)),bytes:JSON.stringify(i.content??i).length})),
      model:first?.model??null,reasoning:first?.reasoning??null,toolChoice:first?.tool_choice??null,parallelToolCalls:first?.parallel_tool_calls??null,stderrTail:out.stderr.slice(-400)};
  }finally{server.close();}
}
const isArm=(t:{type:string;name:string|null})=>t.type==='namespace'&&t.name==='mcp__arm';
/** One arm: the arm namespace is exactly the declared set; everything else is a shared built-in. */
export function armFindings(e:ArmEvidence):string[]{
  const f:string[]=[];
  if(e.responsesRequests<1)f.push(`${e.arm}: the controller sent no model request (${e.stderrTail})`);
  const ns=e.tools.filter(isArm);
  if(ns.length!==1)f.push(`${e.arm}: expected one mcp__arm namespace, got ${ns.length} (did the arm server start?)`);
  else if(JSON.stringify([...ns[0]!.tools!].sort())!==JSON.stringify([...DECLARED[e.arm]].sort()))f.push(`${e.arm}: arm tools ${JSON.stringify(ns[0]!.tools)} are not the declared set`);
  for(const t of e.tools.filter(t=>!isArm(t)))for(const name of t.type==='namespace'?t.tools??[]:[t.name])if(!SHARED_TOOLS.includes(String(name)))f.push(`${e.arm}: unexpected controller tool ${name}`);
  return f;
}
/** Both arms: identical context, settings and non-arm tools. */
export function compareArms(h:ArmEvidence,u:ArmEvidence):string[]{
  const f=[...armFindings(h),...armFindings(u)];
  const shared=(e:ArmEvidence)=>JSON.stringify(e.tools.filter(t=>!isArm(t)).map(t=>t.sha256));
  if(shared(h)!==shared(u))f.push('non-arm tools differ between arms');
  if(h.instructionsSha256!==u.instructionsSha256)f.push('instructions differ between arms');
  if(JSON.stringify(h.input.map(i=>i.sha256))!==JSON.stringify(u.input.map(i=>i.sha256)))f.push('context (input items) differs between arms');
  for(const k of ['model','reasoning','toolChoice','parallelToolCalls','toolsCarrier','controllerVersion'] as const)if(JSON.stringify(h[k])!==JSON.stringify(u[k]))f.push(k+' differs between arms');
  return f;
}
