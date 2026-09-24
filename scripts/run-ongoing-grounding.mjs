// Offline paired snapshots only. No bridge, game handles, API keys or action execution.
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {caseBank} from './export-ongoing-grounding.mjs';
import {parseCodexChoice} from '../dist/src/codex-decision.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const helper=fileURLToPath(new URL('./run-codex-decision.py',import.meta.url));
export function validateBank(bank){
 if(JSON.stringify(bank)!==JSON.stringify(caseBank()))throw Error('Case bank differs from canonical export');
}
export function verifyResult(result,model,requestHash,catalogHash,view){
 if(result?.status!=='completed'||result.error||result.model!==model||result.requestHash!==requestHash||result.catalogHash!==catalogHash||result.preflight?.requests!==1||result.preflight?.toolsExposed!==0)throw Error('Transport or isolation check failed');
 return parseCodexChoice('core',result.rawText,view);
}
async function invoke(args,signal){
 return new Promise(resolve=>{
  const env=Object.fromEntries(['PATH','HOME','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const p=spawn('python3',[helper,...args],{env,detached:true,stdio:['ignore','pipe','pipe']});
  let stopped=false,bytes=0,force;
  const stop=()=>{stopped=true;try{process.kill(-p.pid,'SIGTERM');}catch{}force??=setTimeout(()=>{try{process.kill(-p.pid,'SIGKILL');}catch{}},2500);};
  const timer=setTimeout(stop,110000);signal.addEventListener('abort',stop,{once:true});
  const count=b=>{bytes+=b.length;if(bytes>262144)stop();};p.stdout.on('data',count);p.stderr.on('data',count);
  const done=code=>{clearTimeout(timer);clearTimeout(force);signal.removeEventListener('abort',stop);try{process.kill(-p.pid,'SIGKILL');}catch{}resolve(code===0&&!stopped&&!signal.aborted);};
  p.on('error',()=>done(-1));p.on('close',done);if(signal.aborted)stop();
 });
}
export async function run(bank,catalogPaths,root,{invokeHelper=invoke,signal=new AbortController().signal}={}){
 validateBank(bank);
 if(!isAbsolute(root)||bank.models.some(m=>!isAbsolute(catalogPaths[m]??'')))throw Error('Absolute operator paths required');
 const catalogs={};
 for(const model of bank.models){
  const bytes=await readFile(catalogPaths[model]),c=JSON.parse(bytes),m=c.models?.[0];
  if(c.models?.length!==1||m.slug!==model||m.tool_mode!=='direct'||m.multi_agent_version!=='disabled'||m.supports_search_tool!==false)throw Error('Invalid isolated model catalog');
  catalogs[model]=bytes;
 }
 await mkdir(root,{mode:0o700}); // exclusive run; existing or uncertain runs cannot be replayed
 const report={version:bank.version,bankHash:hash(JSON.stringify(bank)),status:'reserved',attempts:[]};
 const save=async()=>{await writeFile(join(root,'report.tmp'),JSON.stringify(report,null,2),{mode:0o600});await rename(join(root,'report.tmp'),join(root,'report.json'));};
 await writeFile(join(root,'bank.json'),JSON.stringify(bank),{mode:0o600});await save();
 try{
  for(const c of bank.cases)for(const model of bank.models){
   signal.throwIfAborted();const slot=join(root,`${c.id}-${model}`);await mkdir(slot);
   const request=JSON.stringify(c.request),catalog=catalogs[model];
   const requestPath=join(slot,'request.json'),catalogPath=join(slot,'catalog.json');
   await writeFile(requestPath,request,{mode:0o600});await writeFile(catalogPath,catalog,{mode:0o600});
   const a={case:c.id,model,status:'reserved',requestHash:hash(request),catalogHash:hash(catalog)};
   report.attempts.push(a);await save(); // durable reservation before any provider request
   const ok=await invokeHelper([requestPath,catalogPath,join(slot,'attempt'),'--model',model],signal);
   const path=join(slot,'attempt','result.json');if((await stat(path)).size>1048576)throw Error('Receipt too large');
   const result=JSON.parse(await readFile(path,'utf8'));a.result=result;
   if(!ok)throw Error('Helper failed or cancelled');
   // Any transport, isolation or contract failure stops this suite; never a replacement call.
   a.choice=verifyResult(result,model,a.requestHash,a.catalogHash,c.view);a.status='returned';await save();
  }
  report.status='completed';await save();return report;
 }catch{
  const a=report.attempts.at(-1);if(a?.status==='reserved')a.status='failed-or-uncertain';
  report.status='stopped';await save();throw Error('Suite stopped; retain receipts and diagnose, no replay');
 }
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [bankPath,catalogsPath,root]=process.argv.slice(2);
 const ctl=new AbortController();process.on('SIGINT',()=>ctl.abort());process.on('SIGTERM',()=>ctl.abort());
 await run(JSON.parse(await readFile(bankPath,'utf8')),JSON.parse(await readFile(catalogsPath,'utf8')),root,{signal:ctl.signal});
}
