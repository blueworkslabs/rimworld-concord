import {CoreChoice,coreInstructions,coreChoiceSchema,corePrompt,coreAnswerPrompt,validateCoreChoice,type CoreView,type CoreQuestionView} from './core-planner.js';
import {ProviderStreamCounts,providerResultMetadata,validationIssues} from './provider-diagnostics.js';
import { spawn,execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,mkdir } from 'node:fs/promises';
import { join,isAbsolute } from 'node:path';
import { z } from 'zod';
import { Decision,type Perspective } from './protocol.js';
import { type AttentionView,Reflection } from './attention.js';
import {ReflectionChoice,reflectionChoiceSchema,reflectionFromChoice,validateReflectionChoice} from './reflection-choice.js';
import {decisionTrials,type DecisionTrial} from './decision-trials.js';
import {pawnInstructions,modelPrompt} from './model-perspective.js';
import {promptAccounting} from './prompt-accounting.js';
import { TrialBudget } from './appraisal.js';
import {SocialChoice,socialChoiceSchema,socialPrompt,type SocialView} from './social.js';

export const CLAUDE_MODEL='claude-sonnet-4-6';
const moveAction={type:'object',additionalProperties:false,required:['kind','x','z'],properties:{kind:{const:'move'},x:{type:'integer',minimum:0},z:{type:'integer',minimum:0}}};
const rescueAction={type:'object',additionalProperties:false,required:['kind','target','bed','x','z','maxTicks'],properties:{kind:{const:'rescue'},target:{type:'string',minLength:1,maxLength:120},bed:{type:'string',minLength:1,maxLength:120},x:{type:'integer',minimum:0},z:{type:'integer',minimum:0},maxTicks:{type:'integer',minimum:60,maximum:3600}}};
const productionActions=['build','cook'].map(kind=>({type:'object',additionalProperties:false,required:['kind','thing','x','z','maxTicks',...(kind==='cook'?['target','count','meals']:[])],properties:{kind:{const:kind},thing:{type:'string',minLength:1,maxLength:120},x:{type:'integer',minimum:0},z:{type:'integer',minimum:0},maxTicks:{type:'integer',minimum:60,maximum:kind==='cook'?7200:3600},...(kind==='cook'?{target:{type:'string',minLength:1,maxLength:120},count:{type:'integer',minimum:1,maximum:75},meals:{type:'integer',minimum:1,maximum:3}}:{})}}));
const action={oneOf:[moveAction,rescueAction,...productionActions,{type:'object',additionalProperties:false,required:['kind','thing','x','z','count','trips','maxTicks'],properties:{kind:{const:'haul'},thing:{type:'string',minLength:1,maxLength:120},x:{type:'integer',minimum:0},z:{type:'integer',minimum:0},count:{type:'integer',minimum:1,maximum:25},trips:{type:'integer',minimum:1,maximum:3},maxTicks:{type:'integer',minimum:60,maximum:3600}}}]};
const decision={oneOf:[...['accept','refuse','defer'].map(kind=>({type:'object',additionalProperties:false,required:['kind','reason'],properties:{kind:{const:kind},reason:{type:'string',minLength:1,maxLength:1000}}})),
 {type:'object',additionalProperties:false,required:['kind','reason','action'],properties:{kind:{const:'counter'},reason:{type:'string',minLength:1,maxLength:1000},action}}]};


export function claudeArgs(mode:'decision'|'reflection'|'social'|'core'|'core-answer',view?:AttentionView|CoreView) {
 if(mode==='reflection'&&!view)throw Error('Reflection schema requires a supplied perspective');
 if(mode==='core'&&!view)throw Error('Core schema requires a perspective');
 const schema=mode==='core'?{type:'object',additionalProperties:false,required:['core'],properties:{core:coreChoiceSchema(view as CoreView)}}:mode==='core-answer'?{type:'object',additionalProperties:false,required:['social'],properties:{social:socialChoiceSchema}}:mode==='social'?{type:'object',additionalProperties:false,required:['social'],properties:{social:socialChoiceSchema}}:mode==='decision'?{type:'object',additionalProperties:false,required:['decision'],properties:{decision}}:
 {type:'object',additionalProperties:false,required:['reflection'],properties:{reflection:reflectionChoiceSchema(view as AttentionView,decision)}};
 return ['--print','--safe-mode','--tools','','--disallowedTools','mcp__*','--strict-mcp-config','--mcp-config','{"mcpServers":{}}',
 '--disable-slash-commands','--no-session-persistence','--no-chrome','--permission-mode','dontAsk','--permission-prompts','none',
 '--setting-sources','','--model',CLAUDE_MODEL,'--effort','low','--max-turns','2','--max-budget-usd','0.10',
 '--settings','{"alwaysThinkingEnabled":false}','--output-format','stream-json','--verbose',
 '--system-prompt',mode==='core'?coreInstructions:pawnInstructions,
 '--json-schema',JSON.stringify(schema)];
}

/** Verify the CLI actually advertised no action-capable tools/customizations.
 * StructuredOutput is a return-format mechanism, not a game or host tool.
 */
export function verifyClaudeInit(event:any) {
 if(event?.type!=='system'||event.subtype!=='init'||event.model!==CLAUDE_MODEL||
   !Array.isArray(event.tools)||event.tools.some((t:unknown)=>t!=='StructuredOutput')||
   !Array.isArray(event.mcp_servers)||event.mcp_servers.length||
   (event.plugins?.length??0)||(event.skills?.length??0)||(event.slash_commands?.length??0))
   throw Error('Claude isolation preflight failed');
}
type ParsedClaude<T>={output:T;providerChoice:ReflectionChoice|undefined;estimatedUsageUSD:number;turns:number};
export function parseClaudeResult(event:unknown,mode:'decision'|'reflection'):ParsedClaude<Decision|Reflection>;
export function parseClaudeResult(event:unknown,mode:'social'):ParsedClaude<z.infer<typeof SocialChoice>>;
export function parseClaudeResult(event:unknown,mode:'decision'|'reflection'|'social'|'core'|'core-answer'):ParsedClaude<Decision|Reflection|z.infer<typeof SocialChoice>|CoreChoice>;
export function parseClaudeResult(event:unknown,mode:'decision'|'reflection'|'social'|'core'|'core-answer') {
 const result=z.object({type:z.literal('result'),subtype:z.literal('success'),is_error:z.literal(false),
   total_cost_usd:z.number().finite().nonnegative(),structured_output:z.unknown(),
   modelUsage:z.record(z.unknown()),num_turns:z.number().int().min(1).max(2)}).parse(event);
 if(Object.keys(result.modelUsage).some(m=>m!==CLAUDE_MODEL)||!Object.keys(result.modelUsage).length)
   throw Error('Unexpected model route');
 const providerChoice=mode==='reflection'?z.object({reflection:ReflectionChoice}).strict().parse(result.structured_output).reflection:undefined;
 const output=mode==='core'?z.object({core:CoreChoice}).strict().parse(result.structured_output).core:mode==='social'||mode==='core-answer'?z.object({social:SocialChoice}).strict().parse(result.structured_output).social:providerChoice?reflectionFromChoice(providerChoice):z.object({decision:Decision}).strict().parse(result.structured_output).decision;
 return {output,providerChoice,estimatedUsageUSD:result.total_cost_usd,turns:result.num_turns};
}

const exec=promisify(execFile);
export class ClaudeDecisionBackend {
 readonly name=CLAUDE_MODEL;
 readonly receipts:Array<{mode:string;model:string;elapsedMs:number;estimatedUsageUSD:number;turns:number;tools:string[];status:string;authoredSize?:ReturnType<typeof promptAccounting>;providerChoice?:ReflectionChoice}>=[];
 readonly requestSizes:Array<{mode:string;authoredSize:ReturnType<typeof promptAccounting>}>=[];
 readonly rawResponses:Array<{mode:string;structuredOutput:unknown;stream:ProviderStreamCounts['counts'];result:ReturnType<typeof providerResultMetadata>}>=[];
 readonly streamDiagnostics:Array<{mode:string;counts:ProviderStreamCounts['counts']}>=[];
 readonly failures:Array<{stage:string;attemptReserved:boolean;cancelled:boolean;issues?:ReturnType<typeof validationIssues>}>=[];
 private budget:TrialBudget;
 private pending=false;
 // Subscription usage only. This separate trial does not reset the Jev ledger.
 constructor(private options:{ledgerPath:string;scratchRoot:string;binary?:string;trial?:DecisionTrial}) {
   if(!isAbsolute(options.ledgerPath)||!isAbsolute(options.scratchRoot))throw Error('Absolute operator paths required');
   const key=options.trial??'legacy';
   if(!Object.hasOwn(decisionTrials,key))throw Error('Unknown trial');
   const policy=decisionTrials[key];
   this.budget=new TrialBudget(options.ledgerPath,policy.reservedEquivalentUSD,policy.calls,policy.policy);
 }
 summary(){const s=this.budget.summary()!;return {attempts:s.calls,reservedEquivalentUSD:s.reservedUSD,estimatedUsageUSD:s.reportedUSD};}
 close(){if(this.pending)throw Error('Decision still pending');this.budget.close();}
 async decide(view:Perspective,signal:AbortSignal){
   if(view.pawn.id!==view.character.id||view.proposal.pawn!==view.pawn.id||(view.history??[]).some(p=>p.pawn!==view.pawn.id))throw Error('Perspective ownership mismatch');
   return Decision.parse(await this.run('decision',view,signal));
 }
 async reflect(view:AttentionView,signal:AbortSignal){
   if(view.pawn.id!==view.character.id||(view.intention&&view.intention.pawn!==view.pawn.id)||view.events.some(e=>e.pawn!==view.pawn.id)||view.proposals.some(p=>p.pawn!==view.pawn.id)||Object.values(view.histories??{}).flat().some(p=>p.pawn!==view.pawn.id))
     throw Error('Perspective ownership mismatch');
   return Reflection.parse(await this.run('reflection',view,signal));
 }
 async speak(view:SocialView,signal:AbortSignal){
   if(view.pawn.id!==view.character.id||view.contact.id===view.pawn.id||view.exchange.messages.some(m=>![m.from,m.to].includes(view.pawn.id)))throw Error('Perspective ownership mismatch');
   return SocialChoice.parse(await this.run('social',view,signal));
 }
 async plan(view:CoreView,signal:AbortSignal){return CoreChoice.parse(await this.run('core',view,signal));}
 async answerCore(view:CoreQuestionView,signal:AbortSignal){if(view.pawn.id!==view.character.id||view.question.from!=='core')throw Error('Question ownership mismatch');return SocialChoice.parse(await this.run('core-answer',view,signal));}
 private async run(mode:'decision'|'reflection'|'social'|'core'|'core-answer',view:unknown,signal:AbortSignal) {
   signal.throwIfAborted();if(this.pending)throw Error('Decision backend busy');
   view=structuredClone(view);
   const args=claudeArgs(mode,mode==='core'?view as CoreView:mode==='reflection'?view as AttentionView:undefined);
   const prompt=JSON.stringify(mode==='core'?corePrompt(view as CoreView):mode==='core-answer'?coreAnswerPrompt(view as CoreQuestionView):mode==='social'?socialPrompt(view as SocialView):modelPrompt(mode,view as Perspective|AttentionView));if(Buffer.byteLength(prompt)>24000)throw Error('Decision context too large');
   const authoredSize=promptAccounting(args[args.indexOf('--system-prompt')+1]!,prompt,JSON.parse(args[args.indexOf('--json-schema')+1]!));
   this.pending=true;
   // Native client reads its existing login itself. No secret/env copying or extraction.
   const env=Object.fromEntries(['PATH','HOME','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]!])) as NodeJS.ProcessEnv;
   env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1';
   const binary=this.options.binary??'claude';let id:string|undefined;let stage='authentication';
   try {
     const {stdout}=await exec(binary,['auth','status','--json'],{env,timeout:10000,maxBuffer:16384});
     const auth=JSON.parse(stdout);
     if(auth.loggedIn!==true||auth.authMethod!=='claude.ai'||auth.apiProvider!=='firstParty'||auth.subscriptionType!=='max')
       throw Error('Required Claude Max login unavailable');
     stage='setup';signal.throwIfAborted();await mkdir(this.options.scratchRoot,{recursive:true});
     const cwd=await mkdtemp(join(this.options.scratchRoot,'pawn-'));
     stage='budget';id=this.budget.reserve(0.10);this.requestSizes.push({mode,authoredSize});const began=Date.now();
     const stream=new ProviderStreamCounts();this.streamDiagnostics.push({mode,counts:stream.counts});
     stage='transport';const events=await this.invoke(binary,args,prompt,cwd,env,signal,stream,
       cost=>this.budget.settle(id!,cost),
       raw=>this.rawResponses.push({mode,stream:{...stream.counts},structuredOutput:(raw as {structured_output?:unknown}).structured_output??null,result:providerResultMetadata(raw,CLAUDE_MODEL)}));
     stage='parsing';const parsed=parseClaudeResult(events.result,mode);
     const receipt={mode,authoredSize,model:CLAUDE_MODEL,elapsedMs:Date.now()-began,estimatedUsageUSD:parsed.estimatedUsageUSD,turns:parsed.turns,tools:events.tools,status:'rejected',...(parsed.providerChoice?{providerChoice:parsed.providerChoice}:{})};
     this.receipts.push(receipt);
     stage='validation';if(mode==='core')validateCoreChoice(parsed.output,view as CoreView);if(parsed.providerChoice)validateReflectionChoice(parsed.providerChoice,view as AttentionView);
     signal.throwIfAborted();receipt.status='ok';
     return parsed.output;
   } catch(error) {this.failures.push({stage,attemptReserved:!!id,cancelled:signal.aborted,...(stage==='parsing'||stage==='validation'?{issues:validationIssues(error)}:{})});throw Error((id?'Live decision unavailable; attempt retained':'Claude decision preflight failed')+' ['+stage+']');}
   finally {this.pending=false;}
 }
 private invoke(binary:string,args:string[],prompt:string,cwd:string,env:NodeJS.ProcessEnv,signal:AbortSignal,stream:ProviderStreamCounts,onCost:(cost:number)=>void,onResult:(result:unknown)=>void):Promise<{result:unknown;tools:string[]}> {
   return new Promise((resolve,reject)=>{
     const child=spawn(binary,args,{cwd,env,stdio:['pipe','pipe','pipe'],detached:true});
     let buffer='',bytes=0,result:unknown,init=false,tools:string[]=[],failure=false;
     let force:ReturnType<typeof setTimeout>|undefined;
     const stop=()=>{failure=true;try{process.kill(-child.pid!,'SIGTERM');}catch{}
       force??=setTimeout(()=>{try{process.kill(-child.pid!,'SIGKILL');}catch{}},1000);};
     const timer=setTimeout(stop,90000);signal.addEventListener('abort',stop,{once:true});
     child.stdin.on('error',stop);child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>262144)stop();});
     child.stdout.on('data',chunk=>{
       bytes+=chunk.length;if(bytes>262144){stop();return;}buffer+=chunk.toString();
       for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
         try {
           const event=JSON.parse(line);stream.observe(event);
           if(event.type==='system'&&event.subtype==='init'){if(init)throw Error();verifyClaudeInit(event);init=true;tools=event.tools;}
           if(event.type==='system'&&String(event.subtype).startsWith('hook_'))throw Error();
           if(event.type==='assistant'&&event.message?.content?.some((c:any)=>c.type==='tool_use'&&c.name!=='StructuredOutput'))throw Error();
           if(event.type==='result'){
             // Preserve reported usage even for invalid output, error results, or failed exits.
             if(!result)onResult(event);
             const billing=z.object({total_cost_usd:z.number().finite().nonnegative()}).safeParse(event);
             if(billing.success)onCost(billing.data.total_cost_usd);
             if(!init||result)throw Error();result=event;
           }
         }catch{stop();}
       }
     });
     const cleanup=()=>{clearTimeout(timer);clearTimeout(force);signal.removeEventListener('abort',stop);};
     child.on('error',()=>{cleanup();reject(Error('CLI unavailable'));});
     child.on('close',code=>{cleanup();if(code!==0||failure||!init||!result||signal.aborted)reject(Error('CLI decision failed'));else resolve({result,tools});});
     child.stdin.end(prompt);if(signal.aborted)stop();
   });
 }
}
