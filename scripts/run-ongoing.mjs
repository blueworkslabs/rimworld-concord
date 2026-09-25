// Operator-started continuous native observation. Native Codex login remains on this host.
import {randomUUID} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {parseTrialMessage} from '../dist/src/trial-wire.js';
import {InferenceLane} from '../dist/src/inference-lane.js';
import {ongoingProtocol} from '../dist/trials/ongoing-protocol.js';
import {retentionDeadline} from '../dist/trials/retention-policy.js';

import {CoreRejection} from '../dist/src/core-planner.js';
import {CodexDecisionBackend} from '../dist/src/codex-decision.js';
import {JevAnnotator,appendAnnotation,jevAnnotateVersion} from '../dist/src/jev-annotate.js';
import {TrialBudget} from '../dist/src/appraisal.js';
import {protectedJevTransport} from '../dist/src/protected-jev.js';


const config=JSON.parse(await readFile(process.argv[2],'utf8')),cold=process.argv.includes('--cold'),scripted=process.argv.includes('--scripted'),recorded=process.argv.includes('--recorded'),nativeHaul=process.argv.includes('--native-haul'),migration=process.argv.includes('--hauling-migration'),annotate=process.argv.includes('--annotate-grounding');

if(!/^[a-zA-Z0-9_.@-]+$/.test(config.sshTarget)||config.sshTarget.startsWith('-')||
 !['labRoot','remoteRepo','ledger','scratchRoot','receipt','catalogPath'].every(k=>typeof config[k]==='string'&&config[k].startsWith('/')))throw Error('Invalid operator configuration');

const protocol=ongoingProtocol(recorded,scripted,nativeHaul,migration,annotate),policy=protocol.policy;
// Annotate-only grounding (docs/trials/JEV_ANNOTATE.md): scores every returned core reply after it
// has been sent; gates nothing. The protected transport must exist before the game starts.
const JEV_ANNOTATE_POLICY={id:jevAnnotateVersion,limitUSD:0.2,maxCalls:100};
const jevTransport=annotate&&!scripted?protectedJevTransport():undefined;
const jevBudget=jevTransport?new TrialBudget(config.ledger+'.jev',JEV_ANNOTATE_POLICY.limitUSD,JEV_ANNOTATE_POLICY.maxCalls,JEV_ANNOTATE_POLICY.id):undefined;
const hostAbort=new AbortController();
let scriptedTurn=0;
// Native-haul rehearsal: offer the listed stockpile haul once per able pawn, accept every offer, then wait.
const nativeMock={receipts:[],rawResponses:[],failures:[],summary:()=>({attempts:0,reservedEquivalentUSD:0}),close(){},
 async plan(v){const o=v.opportunities.find(o=>o.action.kind==='haul-zone');return {topics:[],actionTopicId:null,action:o?{kind:'propose',opportunityId:o.id,reason:'Scripted rehearsal: offer the shared stockpile haul.'}:{kind:'wait',reason:'Scripted rehearsal: every able pawn has an answer.'}};},
 async answerCore(){throw Error('Unexpected scripted question');},async decide(){return {kind:'accept',reason:'Scripted rehearsal acceptance.'};},async reflect(){throw Error('Unexpected scripted reflection');}};
const mock={receipts:[],rawResponses:[],failures:[],summary:()=>({attempts:0,reservedEquivalentUSD:0}),close(){},async plan(v){if(scriptedTurn>0){const care=v.selfCare.find(a=>a.completed);return {topics:care?[{sourceId:care.id,text:'This bounded eating action completed.',status:'resolved'}]:[],actionTopicId:null,action:{kind:'wait',reason:'Wait for the receipt; close only confirmed self-care.'}};}return {topics:[{sourceId:'brief',text:'Check voluntary communication without ordering work.',status:'open'}],actionTopicId:null,action:scriptedTurn++===0?{kind:'ask',pawn:v.crew[0].id,text:'Would you like to discuss food before any optional work?',reason:'Ask a voluntary question.'}:{kind:'wait',reason:'Reply received. No work authorized or requested in this scripted rehearsal.'}};},async answerCore(v){if(true){const options=v.pawn.eating?.options??[];const food=recorded?[...options].sort((a,b)=>Math.hypot(a.x-v.pawn.x,a.z-v.pawn.z)-Math.hypot(b.x-v.pawn.x,b.z-v.pawn.z))[0]:options[0];if(!food)throw Error('No scripted eating option');return {choice:'eat',thing:food.thing,text:'I choose this nearby portion now.'};}return {choice:'say',text:'I prefer to eat first. Please leave work for now.'};},async decide(){throw Error('Unexpected scripted work offer');}};
const coreBackend=scripted?((nativeHaul||migration)?nativeMock:mock):new CodexDecisionBackend({ledgerPath:config.ledger+'.core',scratchRoot:config.scratchRoot+'/core',catalogPath:config.catalogPath});
const pawnBackend=scripted?((nativeHaul||migration)?nativeMock:mock):new CodexDecisionBackend({ledgerPath:config.ledger+'.pawns',scratchRoot:config.scratchRoot+'/pawns',catalogPath:config.catalogPath});
const summary=()=>({core:coreBackend.summary(),pawns:pawnBackend.summary()});
const diagnostics=()=>({core:{decisions:coreBackend.receipts,rawResponses:coreBackend.rawResponses,failures:coreBackend.failures,streamDiagnostics:coreBackend.streamDiagnostics??[]},pawns:{decisions:pawnBackend.receipts,rawResponses:pawnBackend.rawResponses,failures:pawnBackend.failures,streamDiagnostics:pawnBackend.streamDiagnostics??[]}});
const ongoingAllowance=t=>{const ms=t-Date.now();if(!Number.isFinite(ms)||ms<=0||ms>110000)throw Error('Decision deadline');return ms;};
const priorHost=cold?JSON.parse(await readFile(config.receipt,'utf8')).hostProcessId:undefined;
if(cold&&(!priorHost||priorHost===process.pid))throw Error('Cold restore requires a new host process');
const before=summary();
if(!cold&&(before.core.attempts||before.pawns.attempts))throw Error('Fresh trial required');
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const env=Object.fromEntries(['PATH','HOME','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const digestCode="const fs=require('fs'),p=require('path'),h=require('crypto').createHash('sha256'),d=process.argv[1];for(const sub of ['src','trials'])for(const n of fs.readdirSync(p.join(d,sub)).filter(n=>n.endsWith('.js')).sort()){h.update(sub+'/'+n);h.update(fs.readFileSync(p.join(d,sub,n)));}h.update('scripts/run-ongoing-lab.sh');h.update(fs.readFileSync(p.resolve(d,'../scripts/run-ongoing-lab.sh')));console.log(h.digest('hex'));";
const local=execFileSync(process.execPath,['-e',digestCode,new URL('../dist/',import.meta.url).pathname],{env,encoding:'utf8'}).trim();
const remote=execFileSync('ssh',['-o','BatchMode=yes',config.sshTarget,'node -e '+quote(digestCode)+' '+quote(config.remoteRepo+'/dist')],{env,timeout:15000,encoding:'utf8'}).trim();
if(local!==remote)throw Error('Remote runner differs from local build');
const marker=config.receipt+'.started';
const runId=cold?JSON.parse(await readFile(marker,'utf8')).runId:randomUUID();
if(!cold)await writeFile(marker,JSON.stringify({runId,scripted,nativeHaul,migration,annotate,policy,protocol,at:new Date().toISOString()}),{flag:'wx',mode:0o600});
if(cold&&JSON.stringify(JSON.parse(await readFile(marker,'utf8')).protocol)!==JSON.stringify(protocol))throw Error('Cold protocol mismatch');
if(cold&&(JSON.parse(await readFile(marker,'utf8')).policy!==policy||JSON.parse(await readFile(marker,'utf8')).scripted!==scripted||!!JSON.parse(await readFile(marker,'utf8')).annotate!==annotate))throw Error('Cold policy mismatch');
const command=`env CONCORD_TRIAL_POLICY=${quote(policy)} CONCORD_TRIAL_ID=${quote(runId)} RIMWORLD_LAB_ROOT=${quote(config.labRoot)} bash ${quote(config.remoteRepo+'/scripts/run-ongoing-lab.sh')} ${cold?'cold':'game'}${scripted?' --scripted':''}${recorded?' --recorded':''}${nativeHaul?' --native-haul':''}${migration?' --hauling-migration':''}`;
const child=spawn('ssh',['-o','BatchMode=yes',config.sshTarget,command],{env,stdio:['pipe','pipe','pipe']});
const lane=new InferenceLane();
const annotationsPath=config.receipt+'.jev-annotations.jsonl',annotationBackendIds=new Map();
const annotator=jevTransport?new JevAnnotator(jevTransport,jevBudget,e=>appendAnnotation(annotationsPath,{runId,backendDecisionId:annotationBackendIds.get(e.decisionId),...e})):undefined;
const input=createInterface({input:child.stdout,crlfDelay:Infinity}),active=new Map(),seen=new Set(),tasks=[],responses=[];
let receipt,draining=false,failed=false,coreCount=0,pawnCount=0;const laneFailures=[];
const send=m=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(m)+'\n');};
const stopHost=()=>{failed=true;hostAbort.abort();for(const c of active.values())c.abort();child.stdin.end();};process.once('SIGTERM',stopHost);process.once('SIGINT',stopHost);
child.stderr.on('data',()=>{});child.stdin.on('error',()=>{failed=true;});
async function handle(line){
 const m=parseTrialMessage(line);
 if(m.type==='receipt'){if(receipt)throw Error('Duplicate receipt');receipt=m.receipt;return;}
 if(!/^[0-9a-f-]{36}$/.test(m.id))throw Error('Invalid correlation');
 if(m.type==='decision-cancel'){active.get(m.id)?.abort();return;}
 if(m.type==='drain'){draining=true;for(const c of active.values())c.abort();await lane.drain();send({type:'drained',id:m.id});return;}
 if(draining||cold||seen.has(m.id))throw Error('Unexpected request');
 const isDecision=m.type==='decision-request';
 if(isDecision){if(!['decision','core','core-answer','reflection'].includes(m.mode))throw Error('Unexpected mode');if(m.mode==='core')coreCount++;else pawnCount++;}
 else throw Error('No appraisal requests allowed');
 seen.add(m.id);const deadline=retentionDeadline(110000),controller=deadline.controller;active.set(m.id,controller);const start=Date.now();
 try{
  const remaining=ongoingAllowance(m.notAfter);
  const cutoffTimer=setTimeout(()=>controller.abort(),remaining);
  let completedCore;
  try {await lane.run(controller.signal,async()=>{
  try {if(isDecision){
   await writeFile(config.receipt+'.request-'+m.id+'.json',JSON.stringify({runId,mode:m.mode,view:m.view,notAfter:m.notAfter}),{flag:'wx',mode:0o600});
   ongoingAllowance(m.notAfter);controller.signal.throwIfAborted();
   const output=await (m.mode==='core'?coreBackend.plan(m.view,controller.signal):m.mode==='core-answer'?pawnBackend.answerCore(m.view,controller.signal):m.mode==='reflection'?pawnBackend.reflect(m.view,controller.signal):pawnBackend.decide(m.view,controller.signal));
   const backendDecisionId=(m.mode==='core'?coreBackend:pawnBackend).receipts.at(-1)?.id;
   responses.push({id:m.id,backendDecisionId,mode:m.mode,pawn:m.view.pawn?.id??null,receivedAt:new Date().toISOString(),elapsedMs:Date.now()-start,output});
   // Preserve returned answers even if the coordinator subsequently rejects them as stale.
   await writeFile(config.receipt+'.responses.json',JSON.stringify({runId,responses,diagnostics:diagnostics()},null,2),{mode:0o600});
   send({type:'decision-result',id:m.id,output});
   if(annotator&&m.mode==='core')completedCore={output,backendDecisionId};}

  }finally{await writeFile(config.receipt+'.responses.json',JSON.stringify({runId,responses,diagnostics:diagnostics()},null,2),{mode:0o600});}
  });
  // Release the lane before even building annotation requests or reserving their budget.
  if(completedCore){annotationBackendIds.set(m.id,completedCore.backendDecisionId);tasks.push(annotator.annotate(m.id,m.mode,m.view,completedCore.output,hostAbort.signal));}
  }finally{clearTimeout(cutoffTimer);}
 }catch(error){
  // Failures and cancellation retain their reservations; never reroll a response. The cause
  // is content-free and travels with the result, so no lane failure hides as "unavailable".
  const cause=error?.failureCause??(String(error?.message).startsWith('Decision deadline')?'deadline':'backend');
  laneFailures.push({mode:m.mode,cause,at:new Date().toISOString()});
  const rejection=m.mode==='core'&&cause==='invalid-output'?CoreRejection.safeParse(error?.coreRejection):null;
  send({type:'decision-result',id:m.id,error:'Decision unavailable',cause,...(rejection?.success?{coreRejection:rejection.data}:{})});
 }finally{deadline.dispose();active.delete(m.id);}
}
input.on('line',line=>tasks.push(handle(line).catch(()=>{failed=true;child.kill();})));
const timer=setTimeout(()=>{failed=true;hostAbort.abort();child.kill();},protocol.wallMs+60000);
const code=await new Promise(resolve=>{child.on('error',()=>resolve(-1));child.on('close',resolve);});
clearTimeout(timer);input.close();hostAbort.abort();for(const c of active.values())c.abort();await Promise.all(tasks);await annotator?.drain();
const result={at:new Date().toISOString(),hostProcessId:process.pid,priorHostProcessId:priorHost,policy,protocol,kind:(migration?'hauling-migration-':nativeHaul?'native-haul-':'')+(cold?'ongoing-cold':scripted?'ongoing-scripted':'ongoing-live'),runId,passed:!failed&&code===0&&receipt?.passed===true,
 before,after:{...summary(),jevCalls:annotator?.summary().attempted??0},diagnostics:diagnostics(),laneFailures,responses,game:receipt,
 ...(annotator?{jev:{policy:JEV_ANNOTATE_POLICY,journal:annotationsPath,...annotator.summary(),ledger:jevBudget.summary()}}:{}),
 accounting:annotator?'Native Codex subscription token usage for decisions, plus annotate-only Jev grounding calls over the protected route (USD, per-call reservations). Annotations gate nothing. No turn ceiling or automatic rerolls.':'Native Codex subscription token usage, not API cash charges. No Jev calls. No turn ceiling or automatic rerolls.'};
coreBackend.close();pawnBackend.close();jevBudget?.close();await writeFile(cold?config.receipt+'.cold.json':config.receipt,JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({passed:result.passed,runId,after:result.after,rounds:receipt?.rounds?.length,error:receipt?.error}));if(!result.passed)process.exitCode=1;
