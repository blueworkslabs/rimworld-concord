import {homedir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {execFileSync,execFile,spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {controllerCatalog,isolationConfig} from './controller-config.js';

/** The one place the benchmark controller's command line is built. The scored runner and the
 * controller proof both call it, so the proof covers exactly the argv a scored run uses; the proof
 * only appends a provider override pointing the same controller at a local request recorder. */
export const CONTROLLER_VERSION='codex-cli 0.153.4';
export const ARM_TOOLS:Record<'harness'|'ui',string[]>={harness:['observe','look','act','time','report_done'],ui:['screenshot','click','key','type','report_done']};
/** Only the operator-authorized benchmark interface is noninteractive. Unknown tools stay blocked. */
export function armPermissions(arm:'harness'|'ui'){
 return {'mcp_servers.arm.enabled_tools':ARM_TOOLS[arm],
  'mcp_servers.arm.default_tools_approval_mode':'prompt',
  ...Object.fromEntries(ARM_TOOLS[arm].map(name=>['mcp_servers.arm.tools.'+name+'.approval_mode','approve']))};
}

// Pin the operator's native home, never an inherited per-agent CODEX_HOME.
export const CONTROLLER_CODEX_HOME=join(homedir(),'.codex');
export function controllerEnv():NodeJS.ProcessEnv{
 const env:NodeJS.ProcessEnv={...process.env,CODEX_HOME:CONTROLLER_CODEX_HOME};
 delete env.OPENAI_API_KEY;delete env.CODEX_API_KEY;
 return env;
}
/** Non-inference readiness gate; never falls back to API billing or copies credentials.
 * A successful cached-login status is necessary, not proof that a provider request will succeed. */
export function assertNativeSubscriptionLogin(codex:string){
 const r=spawnSync(codex,['login','status'],{encoding:'utf8',timeout:10000,env:controllerEnv()});
 if(r.error||r.status!==0||!/^Logged in using ChatGPT\s*$/m.test(r.stdout+'\n'+r.stderr))
  throw Error('Benchmark requires an existing native ChatGPT login in this launch environment; no model started and no API fallback');
 return {codexHome:CONTROLLER_CODEX_HOME,authentication:'ChatGPT' as const};
}
export type LaunchOptions={codex:string;root:string;dir:string;arm:'harness'|'ui';model:string;reasoning:'low'|'medium'|'high';callLog:string;uiServer?:string;
  env?:{RIMWORLD_LAB_ROOT?:string;PATH?:string;DISPLAY?:string;XAUTHORITY?:string};
  /** Cross-host (docs/HARNESS.md): the controller runs here, the arm server on the game host over
   * `ssh -o BatchMode=yes`, its stdio being the MCP channel. `armEnv` carries the game host's paths. */
  remote?:{sshTarget:string;remoteRepo:string;armEnv:Record<string,string>}};
export const sq=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
/** The remote arm command: `exec` keeps the server the ssh session's process-group leader. */
export function remoteArmCommand(r:NonNullable<LaunchOptions['remote']>,arm:'harness'|'ui'){
  if(!/^[a-zA-Z0-9_.@-]+$/.test(r.sshTarget)||r.sshTarget.startsWith('-')||!r.remoteRepo.startsWith('/'))throw Error('Invalid remote target');
  const env=Object.entries({...r.armEnv,CONCORD_HARNESS_LOCKED:'1'}).map(([k,v])=>{if(!/^[A-Z_][A-Z0-9_]*$/.test(k))throw Error('Invalid env name '+k);return k+'='+sq(v);}).join(' ');
  return {command:'ssh',args:['-o','BatchMode=yes','-o','ConnectTimeout=10','-T',r.sshTarget,`cd ${sq(r.remoteRepo)} && exec env ${env} node dist/trials/${arm==='ui'?'ui':'harness'}-mcp-server.js`],
    env:Object.fromEntries(['PATH','HOME','SSH_AUTH_SOCK','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]!]))};
}
/** Cleanup executes where the owned process receipt lives, never against remote paths locally. */
export async function stopRemoteArm(r:NonNullable<LaunchOptions['remote']>,file:string){
 const command=remoteArmCommand(r,'harness');
 const code="const m=await import('./dist/src/harness/process-lifecycle.js');await m.stopArm(process.argv[1]);";
 const args=[...command.args.slice(0,-1),`cd ${sq(r.remoteRepo)} && exec node --input-type=module -e ${sq(code)} ${sq(file)}`];
 await promisify(execFile)('ssh',args,{env:command.env,timeout:15000,killSignal:'SIGKILL'});
}
/** The arm server's environment. Cross-host, the game-side runner computes it with its own paths
 * and sends it to the controller host (src/harness/controller-wire.ts). */
export function armEnv(o:Pick<LaunchOptions,'dir'|'callLog'|'uiServer'|'env'>):Record<string,string>{
  const env=o.env??{};
  return {RIMWORLD_LAB_ROOT:env.RIMWORLD_LAB_ROOT??'',CONCORD_HARNESS_LOCKED:'1',CONCORD_BENCH_CALL_LOG:o.callLog,CONCORD_BENCH_PROCESS_FILE:o.callLog+'.process.json',CONCORD_BENCH_DIR:o.dir,CONCORD_UI_BACKEND:o.uiServer??'',PATH:env.PATH??'',DISPLAY:env.DISPLAY??'',XAUTHORITY:env.XAUTHORITY??'',XDG_RUNTIME_DIR:process.env.XDG_RUNTIME_DIR??'',DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS??''};
}
export const toml=(v:unknown):string=>Array.isArray(v)?'['+v.map(toml).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>JSON.stringify(k)+'='+toml(x)).join(',')+'}':JSON.stringify(v);
export function buildLaunch(o:LaunchOptions,extra:Record<string,unknown>={}){
  const version=execFileSync(o.codex,['--version'],{encoding:'utf8',env:controllerEnv()}).trim();
  if(version!==CONTROLLER_VERSION)throw Error('Controller version changed; re-review effective tool configuration');
  const config:Record<string,unknown>={...armPermissions(o.arm),approval_policy:'never',sandbox_mode:'read-only',project_doc_max_bytes:0,include_environment_context:false,web_search:'disabled',model_reasoning_effort:o.reasoning,
    'tools.update_plan.enabled':false,'tools.experimental_request_user_input.enabled':false,
    'mcp_servers.arm.command':process.execPath,'mcp_servers.arm.args':[o.root+`/dist/trials/${o.arm==='ui'?'ui':'harness'}-mcp-server.js`],
    'mcp_servers.arm.env':armEnv(o),
    'mcp_servers.arm.tool_timeout_sec':60};
  if(o.remote){const r=remoteArmCommand(o.remote,o.arm);config['mcp_servers.arm.command']=r.command;config['mcp_servers.arm.args']=r.args;config['mcp_servers.arm.env']=r.env;}
  const catalog=controllerCatalog(JSON.parse(execFileSync(o.codex,['debug','models','--bundled'],{encoding:'utf8',env:controllerEnv(),maxBuffer:10*1024*1024})),o.model);
  writeFileSync(o.dir+'/controller-catalog.json',JSON.stringify(catalog));
  Object.assign(config,isolationConfig,{model_catalog_json:o.dir+'/controller-catalog.json'},extra);
  const args=['exec','--strict-config','--json','--ephemeral','--ignore-user-config','--ignore-rules','--skip-git-repo-check','-C',o.dir+'/cwd','-m',o.model,...Object.entries(config).flatMap(([k,v])=>['-c',k+'='+toml(v)]),'-'];
  return {version,config,catalog,args,codexHome:CONTROLLER_CODEX_HOME};
}
