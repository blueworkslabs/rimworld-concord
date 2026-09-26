import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {controllerCatalog,isolationConfig} from './controller-config.js';

/** The one place the benchmark controller's command line is built. The scored runner and the
 * controller proof both call it, so the proof covers exactly the argv a scored run uses; the proof
 * only appends a provider override pointing the same controller at a local request recorder. */
export const CONTROLLER_VERSION='codex-cli 0.153.4';
export type LaunchOptions={codex:string;root:string;dir:string;arm:'harness'|'ui';model:string;reasoning:'low'|'medium'|'high';callLog:string;uiServer?:string;
  env?:{RIMWORLD_LAB_ROOT?:string;PATH?:string;DISPLAY?:string;XAUTHORITY?:string}};
export const toml=(v:unknown):string=>Array.isArray(v)?'['+v.map(toml).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>JSON.stringify(k)+'='+toml(x)).join(',')+'}':JSON.stringify(v);
export function buildLaunch(o:LaunchOptions,extra:Record<string,unknown>={}){
  const version=execFileSync(o.codex,['--version'],{encoding:'utf8'}).trim();
  if(version!==CONTROLLER_VERSION)throw Error('Controller version changed; re-review effective tool configuration');
  const env=o.env??{};
  const config:Record<string,unknown>={approval_policy:'never',sandbox_mode:'read-only',project_doc_max_bytes:0,include_environment_context:false,web_search:'disabled',model_reasoning_effort:o.reasoning,
    'tools.update_plan.enabled':false,'tools.experimental_request_user_input.enabled':false,
    'mcp_servers.arm.command':process.execPath,'mcp_servers.arm.args':[o.root+`/dist/trials/${o.arm==='ui'?'ui':'harness'}-mcp-server.js`],
    'mcp_servers.arm.env':{RIMWORLD_LAB_ROOT:env.RIMWORLD_LAB_ROOT??'',CONCORD_HARNESS_LOCKED:'1',CONCORD_BENCH_CALL_LOG:o.callLog,CONCORD_BENCH_PROCESS_FILE:o.callLog+'.process.json',CONCORD_BENCH_DIR:o.dir,CONCORD_UI_BACKEND:o.uiServer??'',PATH:env.PATH??'',DISPLAY:env.DISPLAY??'',XAUTHORITY:env.XAUTHORITY??''},
    'mcp_servers.arm.tool_timeout_sec':60};
  const catalog=controllerCatalog(JSON.parse(execFileSync(o.codex,['debug','models','--bundled'],{encoding:'utf8',maxBuffer:10*1024*1024})),o.model);
  writeFileSync(o.dir+'/controller-catalog.json',JSON.stringify(catalog));
  Object.assign(config,isolationConfig,{model_catalog_json:o.dir+'/controller-catalog.json'},extra);
  const args=['exec','--strict-config','--json','--ephemeral','--ignore-user-config','--ignore-rules','--skip-git-repo-check','-C',o.dir+'/cwd','-m',o.model,...Object.entries(config).flatMap(([k,v])=>['-c',k+'='+toml(v)]),'-'];
  return {version,config,catalog,args};
}
