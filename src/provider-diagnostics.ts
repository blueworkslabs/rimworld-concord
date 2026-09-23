import {z} from 'zod';
/** Operator-only allowlist. Never preserve arbitrary provider text, paths, IDs or usage payloads. */
const fieldNames=new Set(['type','subtype','is_error','total_cost_usd','num_turns','modelUsage','structured_output','decision','reflection','social','kind','choice','reason','action','update','expectedRevision','notes','subject','text','messageIds','evidenceSeqs','proposalId','agreementId','target','bed','x','z','count','trips','maxTicks','core','topics','sourceId','status','actionTopicId','opportunityId','pawn']);
function tag(value:unknown,known:string[]){return typeof value==='string'&&known.includes(value)?value:value===undefined?'missing':'other';}
function number(value:unknown){return typeof value==='number'&&Number.isFinite(value)?value:null;}
const apiKinds=['max_output_tokens','dlp_request_denied','claude_code_version_too_old','safety_monitor_blocked','effort_requires_thinking','advisor_incompatible','tool_history_mismatch','autocompact_thrashing','pdf_too_large','pdf_password_protected','no_response','tls_untrusted_ca','gateway_content_type','provider_credentials','gateway_signin_required','gateway_session_expired','api_key_auth_disabled','org_disabled_credential','invalid_credential_header','model_requires_usage_credits','long_context_credits_required','consent_unanswered','no_allowed_fallback','model_substitution_disabled','field_not_granted'];
const apiCodes=[...apiKinds,'rate_limit_error','overloaded_error','authentication_error','permission_error','invalid_request_error','api_error','not_found_error','request_too_large'];
function httpStatus(value:unknown){return typeof value==='number'&&Number.isInteger(value)&&value>=400&&value<=599?value:null;}
export function apiErrorMetadata(raw:unknown){const r=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};return {status:httpStatus(r.api_error_status),kind:tag(r.api_error,apiKinds),code:tag(r.api_error_code,apiCodes)};}
export function providerResultMetadata(raw:unknown,expectedModel:string){
 const r=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
 const usage=r.modelUsage,keys=usage&&typeof usage==='object'&&!Array.isArray(usage)?Object.keys(usage):[];
 return {type:tag(r.type,['result']),subtype:tag(r.subtype,['success','error_max_turns','error_during_execution','error_max_budget_usd','error_max_structured_output_retries']),
  isError:typeof r.is_error==='boolean'?r.is_error:null,apiError:apiErrorMetadata(r),turns:number(r.num_turns),reportedCostUSD:number(r.total_cost_usd),
  modelUsageObject:!!usage&&typeof usage==='object'&&!Array.isArray(usage),modelCount:keys.length,expectedModelPresent:keys.includes(expectedModel),otherModelCount:keys.filter(k=>k!==expectedModel).length,
  structuredOutputPresent:Object.hasOwn(r,'structured_output')};
}
export function validationIssues(error:unknown):{code:string;path:(string|number)[]}[]{
 if(error instanceof z.ZodError){
  const issues:any[]=[];
  const visit=(items:typeof error.issues)=>{for(const issue of items){if(issues.length>=16)return;
   issues.push({code:issue.code,path:issue.path.slice(0,8).map(p=>typeof p==='number'?p:fieldNames.has(p)?p:'[other]')});
   if(issue.code==='invalid_union')for(const e of issue.unionErrors)visit(e.issues);
  }};visit(error.issues);return issues;
 }
 if(error instanceof Error){
  const contextErrors=['Unknown core topic source','Duplicate topic update','Topic closure unsupported by linked outcomes','Core topic limit','Only offers link to action topics','Offer requires nonclosed action topic','Unknown core opportunity','Unknown core counter','Core question unavailable'];
  const index=contextErrors.indexOf(error.message);if(index>=0)return [{code:'core_context_'+index,path:[]}];
 }
 if(error instanceof Error&&error.message==='Unexpected model route')return [{code:'unexpected_model_route',path:['modelUsage']}];
 return [{code:'unclassified',path:[]}];
}

/** Event counts, NOT API-round-trip counts. Never retain text, tool inputs/results or IDs. */
type Issue=ReturnType<typeof validationIssues>[number];
type StreamEvent={kind:'api-error';metadata:ReturnType<typeof apiErrorMetadata>}|{kind:'format-call';ordinal:number;messageOrdinal:number|null;concordInputContract:'valid'|'invalid'|'unchecked';issues:Issue[]}|{kind:'format-result';ordinal:number|null;error:boolean;errorMarker:'schema-mismatch'|'input-validation'|'other'|'none'}|{kind:'result';turns:number|null;error:boolean|null};
export class ProviderStreamCounts {
 constructor(private diagnose?:(input:unknown)=>Issue[]){}
 readonly details:{events:StreamEvent[];truncated:boolean;identity:{version:1;complete:boolean;assistantEvents:number}}={events:[],truncated:false,identity:{version:1,complete:true,assistantEvents:0}};
 private toolOrdinals=new Map<string,number>();
 private toolMessages=new Map<string,number|null>();
 private messages=new Map<string,number>();
 private closedMessages=new Set<number>();
 private ended=false;
 private observeIdentity(event:any):number|null{
  const identity=this.details.identity;
  if(this.ended&&['assistant','user'].includes(event?.type))identity.complete=false;
  if(event?.type==='result')this.ended=true;
  if(event?.type!=='assistant')return null;
  identity.assistantEvents=Math.min(4096,identity.assistantEvents+1);
  const id=event.message?.id;
  if(this.counts.assistantEvents>=4096||typeof id!=='string'||!id.trim()||id.length>200||!Array.isArray(event.message?.content)){identity.complete=false;return null;}
  let ordinal=this.messages.get(id);
  if(ordinal===undefined){
   if(this.messages.size>=32){identity.complete=false;return null;}
   ordinal=this.messages.size+1;this.messages.set(id,ordinal);this.counts.assistantMessages=this.messages.size;
  }
  // A completed or earlier message cannot reopen under an old identity.
  if(ordinal!==this.messages.size||this.closedMessages.has(ordinal))identity.complete=false;
  return ordinal;
 }
 private record(event:StreamEvent){if(this.details.events.length<32)this.details.events.push(event);else this.details.truncated=true;}
 private diagnosticEvent(event:any,messageOrdinal:number|null){
  if(event?.type==='assistant'&&event.is_api_error_message===true)this.record({kind:'api-error',metadata:apiErrorMetadata(event)});
  if(event?.type==='assistant'&&Array.isArray(event.message?.content))for(const c of event.message.content){
   if(c?.type!=='tool_use'||c.name!=='StructuredOutput')continue;
   if(typeof c.id!=='string'||!c.id.trim()||c.id.length>200){this.details.truncated=true;continue;}
   if(this.toolOrdinals.has(c.id))continue;
   if(this.toolOrdinals.size>=32){this.details.truncated=true;continue;}
   const ordinal=this.toolOrdinals.size+1;this.toolOrdinals.set(c.id,ordinal);this.toolMessages.set(c.id,messageOrdinal);
   const issues=this.diagnose?.(c.input)??[];
   this.record({kind:'format-call',ordinal,messageOrdinal,concordInputContract:this.diagnose?(issues.length?'invalid':'valid'):'unchecked',issues});
  }
  if(event?.type==='user'&&Array.isArray(event.message?.content))for(const c of event.message.content){
   if(c?.type!=='tool_result')continue;
   const owner=typeof c.tool_use_id==='string'?this.toolMessages.get(c.tool_use_id):undefined;
   if(owner==null)this.details.identity.complete=false;else this.closedMessages.add(owner);
   const error=c.is_error===true;
   // Classification only: never retain the text or anything extracted from it.
   const content=typeof c.content==='string'?c.content.slice(0,8192):Array.isArray(c.content)?c.content.slice(0,8).filter((b:any)=>b?.type==='text'&&typeof b.text==='string').map((b:any)=>b.text.slice(0,1024)).join(' '):'';
   const errorMarker=!error?'none':content.includes('Output does not match required schema:')?'schema-mismatch':content.includes('InputValidationError:')?'input-validation':'other';
   this.record({kind:'format-result',ordinal:typeof c.tool_use_id==='string'?this.toolOrdinals.get(c.tool_use_id)??null:null,error,errorMarker});
  }
  if(event?.type==='result')this.record({kind:'result',turns:number(event.num_turns),error:typeof event.is_error==='boolean'?event.is_error:null});
 }

 readonly counts={assistantEvents:0,assistantMessages:0,userEvents:0,structuredOutputCalls:0,toolResults:0,toolErrors:0,resultEvents:0};
 observe(event:any){
  const messageOrdinal=this.observeIdentity(event);
  this.diagnosticEvent(event,messageOrdinal);
  const inc=(k:keyof typeof this.counts)=>{this.counts[k]=Math.min(4096,this.counts[k]+1);};
  if(event?.type==='assistant'){
   inc('assistantEvents');
   if(Array.isArray(event.message?.content))for(const c of event.message.content)if(c?.type==='tool_use'&&c.name==='StructuredOutput')inc('structuredOutputCalls');
  }
  if(event?.type==='user'){
   inc('userEvents');if(Array.isArray(event.message?.content))for(const c of event.message.content)if(c?.type==='tool_result'){inc('toolResults');if(c.is_error===true)inc('toolErrors');}
  }
  if(event?.type==='result')inc('resultEvents');
 }
}

/** Narrow recovery proof, not a generic relaxation of the result turn bound.
 * Installed client counts input + user/tool-result events in successful num_turns.
 * Exactly two distinct assistant messages and two formatting calls are allowed here.
 */
export function boundedCoreFormattingRecovery(stream:Pick<ProviderStreamCounts,'counts'|'details'>|undefined){
 if(!stream||stream.details.truncated||stream.details.identity?.version!==1||!stream.details.identity.complete)return false;
 const c=stream.counts,e=stream.details.events;
 if(c.assistantEvents<2||c.assistantEvents>4096||c.assistantEvents!==stream.details.identity.assistantEvents||c.assistantMessages!==2||c.structuredOutputCalls!==2||c.userEvents!==2||c.toolResults!==2||c.toolErrors!==1||c.resultEvents!==1||e.length!==5)return false;
 const [a,b,d,f,r]=e;
 return a?.kind==='format-call'&&a.ordinal===1&&a.messageOrdinal===1&&a.concordInputContract==='invalid'&&a.issues.length>0&&
  b?.kind==='format-result'&&b.ordinal===1&&b.error===true&&b.errorMarker==='schema-mismatch'&&
  d?.kind==='format-call'&&d.ordinal===2&&d.messageOrdinal===2&&d.concordInputContract==='valid'&&d.issues.length===0&&
  f?.kind==='format-result'&&f.ordinal===2&&f.error===false&&f.errorMarker==='none'&&
  r?.kind==='result'&&r.turns===3&&r.error===false;
}
