import {z} from 'zod';
/** Operator-only allowlist. Never preserve arbitrary provider text, paths, IDs or usage payloads. */
const fieldNames=new Set(['type','subtype','is_error','total_cost_usd','num_turns','modelUsage','structured_output','decision','reflection','social','kind','choice','reason','action','update','expectedRevision','notes','subject','text','messageIds','evidenceSeqs','proposalId','agreementId','target','bed','x','z','count','trips','maxTicks']);
function tag(value:unknown,known:string[]){return typeof value==='string'&&known.includes(value)?value:value===undefined?'missing':'other';}
function number(value:unknown){return typeof value==='number'&&Number.isFinite(value)?value:null;}
export function providerResultMetadata(raw:unknown,expectedModel:string){
 const r=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
 const usage=r.modelUsage,keys=usage&&typeof usage==='object'&&!Array.isArray(usage)?Object.keys(usage):[];
 return {type:tag(r.type,['result']),subtype:tag(r.subtype,['success','error_max_turns','error_during_execution','error_max_budget_usd','error_max_structured_output_retries']),
  isError:typeof r.is_error==='boolean'?r.is_error:null,turns:number(r.num_turns),reportedCostUSD:number(r.total_cost_usd),
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
 if(error instanceof Error&&error.message==='Unexpected model route')return [{code:'unexpected_model_route',path:['modelUsage']}];
 return [{code:'unclassified',path:[]}];
}
