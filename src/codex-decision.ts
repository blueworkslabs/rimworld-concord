import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {z} from 'zod';
import {claudeArgs} from './claude-decision.js';
import {Decision,type Perspective} from './protocol.js';
import {Reflection,type AttentionView} from './attention.js';
import {ReflectionChoice,reflectionFromChoice,validateReflectionChoice} from './reflection-choice.js';
import {CoreChoice,corePrompt,coreAnswerPrompt,validateCoreChoice,type CoreView,type CoreQuestionView} from './core-planner.js';
import {CoreAnswerChoice} from './pawn-eating.js';
import {SocialChoice,socialPrompt,type SocialView} from './social.js';
import {modelPrompt} from './model-perspective.js';
import {promptAccounting} from './prompt-accounting.js';
import {OngoingUsage} from './ongoing-usage.js';
export const LUNA_MODEL='gpt-5.6-luna';
type Mode='decision'|'reflection'|'social'|'core'|'core-answer';
/** Same game contract as Claude, independent native transport. */
export function codexRequest(mode:Mode,view:any){
 const args=claudeArgs(mode,view),instructions=args[args.indexOf('--system-prompt')+1]!,schema=JSON.parse(args[args.indexOf('--json-schema')+1]!);
 const prompt=JSON.stringify(mode==='core'?corePrompt(view):mode==='core-answer'?coreAnswerPrompt(view):mode==='social'?socialPrompt(view):modelPrompt(mode,view));
 if(Buffer.byteLength(prompt)>24000)throw Error('Context too large');
 // JSON Schema references preserve the same topic constraints without repeating
 // every source/status branch in each possible action's schema.
 if(mode==='core'){
  const branches=schema.properties.core.anyOf;
  schema.$defs={coreTopicUpdate:branches[0].properties.topics.items};
  for(const branch of branches)branch.properties.topics.items={$ref:'#/$defs/coreTopicUpdate'};
 }
 const request={id:mode,instructions,prompt,schema};
 if(Buffer.byteLength(JSON.stringify(request))>64000)throw Error('Complete request too large');
 return request;
}
export function parseCodexChoice(mode:Mode,text:string,view:any){
 const raw=JSON.parse(text);
 if(mode==='reflection'){const c=z.object({reflection:ReflectionChoice}).strict().parse(raw).reflection;validateReflectionChoice(c,view);return reflectionFromChoice(c);}
 if(mode==='core')return validateCoreChoice(z.object({core:CoreChoice}).strict().parse(raw).core,view);
 if(mode==='decision')return z.object({decision:Decision}).strict().parse(raw).decision;
 return z.object({social:mode==='social'?SocialChoice:CoreAnswerChoice}).strict().parse(raw).social;
}
const Usage=z.object({inputTokens:z.number().int().nonnegative(),cachedInputTokens:z.number().int().nonnegative(),outputTokens:z.number().int().nonnegative(),reasoningOutputTokens:z.number().int().nonnegative(),totalTokens:z.number().int().nonnegative()});
export class CodexDecisionBackend {
 readonly name=LUNA_MODEL;
 readonly receipts:any[]=[];
 private pending=false;
 private ledger:OngoingUsage;
 constructor(private options:{ledgerPath:string;scratchRoot:string;catalogPath:string;helperPath?:string}){
  if(![options.ledgerPath,options.scratchRoot,options.catalogPath].every(isAbsolute))throw Error('Absolute operator paths required');
  this.ledger=new OngoingUsage(options.ledgerPath);
 }
 summary(){const rows=this.ledger.summary();return {attempts:rows.length,rows,accounting:'Native ChatGPT subscription token usage, not cash charges; missing usage is unknown'};}
 close(){if(this.pending)throw Error('Inference pending');this.ledger.close();}
 async decide(v:Perspective,s:AbortSignal){if(v.pawn.id!==v.character.id||v.proposal.pawn!==v.pawn.id||v.history?.some(p=>p.pawn!==v.pawn.id))throw Error('Ownership mismatch');return Decision.parse(await this.run('decision',v,s));}
 async reflect(v:AttentionView,s:AbortSignal){if(v.pawn.id!==v.character.id||v.intention&&v.intention.pawn!==v.pawn.id||v.events.some(e=>e.pawn!==v.pawn.id)||v.proposals.some(p=>p.pawn!==v.pawn.id)||Object.values(v.histories??{}).flat().some(p=>p.pawn!==v.pawn.id))throw Error('Ownership mismatch');return Reflection.parse(await this.run('reflection',v,s));}
 async speak(v:SocialView,s:AbortSignal){if(v.pawn.id!==v.character.id||v.contact.id===v.pawn.id||v.exchange.messages.some(m=>![m.from,m.to].includes(v.pawn.id)))throw Error('Ownership mismatch');return SocialChoice.parse(await this.run('social',v,s));}
 async plan(v:CoreView,s:AbortSignal){return CoreChoice.parse(await this.run('core',v,s));}
 async answerCore(v:CoreQuestionView,s:AbortSignal){if(v.pawn.id!==v.character.id||v.question.from!=='core')throw Error('Ownership mismatch');return CoreAnswerChoice.parse(await this.run('core-answer',v,s));}
 private async run(mode:Mode,view:unknown,signal:AbortSignal){
  signal.throwIfAborted();if(this.pending)throw Error('Backend busy');this.pending=true;
  let id:string|undefined,raw:any,usage:unknown=null;const start=Date.now();
  try{
   view=structuredClone(view);const request=codexRequest(mode,view);
   await mkdir(this.options.scratchRoot,{recursive:true});const root=await mkdtemp(join(this.options.scratchRoot,'call-'));
   await writeFile(join(root,'request.json'),JSON.stringify(request),{mode:0o600});
   // Freeze catalog bytes for this one process; no changing routing after its preflight.
   await writeFile(join(root,'catalog.json'),await readFile(this.options.catalogPath),{mode:0o600});
   signal.throwIfAborted();id=this.ledger.reserve(mode,LUNA_MODEL);
   const outcome=await this.invoke(root,signal);
   try{const file=join(root,'attempt/result.json');if((await stat(file)).size<=1048576)raw=JSON.parse(await readFile(file,'utf8'));}catch{}
   const parsedUsage=Usage.safeParse(raw?.usage);if(parsedUsage.success)usage=parsedUsage.data;
   this.receipts.push({id,mode,model:LUNA_MODEL,elapsedMs:Date.now()-start,stage:raw?.stage??'transport',status:raw?.status??'unknown',usage,rawText:typeof raw?.rawText==='string'?raw.rawText:null,preflight:raw?.preflight??null,authoredSize:promptAccounting(request.instructions,request.prompt,request.schema)});
   if(!outcome||signal.aborted||raw?.status!=='completed'||raw.model!==LUNA_MODEL||raw.preflight?.toolsExposed!==0||raw.preflight?.requests!==1||typeof raw.rawText!=='string')throw Error('Native decision unavailable');
   const choice=parseCodexChoice(mode,raw.rawText,view);signal.throwIfAborted();this.ledger.settle(id,'ok',Date.now()-start,usage);id=undefined;return choice;
  }catch{
   if(id)this.ledger.settle(id,signal.aborted?'cancelled':'failed',Date.now()-start,usage);
   throw Error('Native decision failed; attempt retained; no automatic retry');
  }finally{this.pending=false;}
 }
 private invoke(root:string,signal:AbortSignal):Promise<boolean>{
  return new Promise(resolveResult=>{
   const env=Object.fromEntries(['PATH','HOME','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]!])) as NodeJS.ProcessEnv;
   const helper=this.options.helperPath??resolve(new URL('../../scripts/run-codex-decision.py',import.meta.url).pathname);
   const child=spawn('python3',[helper,join(root,'request.json'),join(root,'catalog.json'),join(root,'attempt')],{env,cwd:root,stdio:['ignore','pipe','pipe'],detached:true});
   let bytes=0,stopped=false,force:ReturnType<typeof setTimeout>|undefined;
   const stop=()=>{stopped=true;try{process.kill(-child.pid!,'SIGTERM');}catch{}force??=setTimeout(()=>{try{process.kill(-child.pid!,'SIGKILL');}catch{}},2500);};
   const timer=setTimeout(stop,110000);signal.addEventListener('abort',stop,{once:true});
   const count=(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>262144)stop();};child.stdout.on('data',count);child.stderr.on('data',count);
   const cleanup=()=>{clearTimeout(timer);clearTimeout(force);signal.removeEventListener('abort',stop);try{process.kill(-child.pid!,'SIGKILL');}catch{}};
   child.on('error',()=>{cleanup();resolveResult(false);});child.on('close',code=>{cleanup();resolveResult(code===0&&!stopped&&!signal.aborted);});if(signal.aborted)stop();
  });
 }
}
