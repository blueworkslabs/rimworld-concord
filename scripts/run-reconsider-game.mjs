// Finite combined trial on the native-login/protected-egress host. No credentials cross SSH.
import {randomUUID} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {InferenceLane} from '../dist/src/inference-lane.js';
import {ClaudeDecisionBackend} from '../dist/src/claude-decision.js';
import {JevAppraiser,TrialBudget} from '../dist/src/appraisal.js';
import {protectedJevTransport} from '../dist/src/protected-jev.js';
const config=JSON.parse(await readFile(process.argv[2],'utf8')),cold=process.argv.includes('--cold'),scripted=process.argv.includes('--scripted');

if(!/^[a-zA-Z0-9_.@-]+$/.test(config.sshTarget)||config.sshTarget.startsWith('-')||
 !['labRoot','remoteRepo','ledger','jevLedger','scratchRoot','receipt'].every(k=>typeof config[k]==='string'&&config[k].startsWith('/')))throw Error('Invalid operator configuration');
const backend=scripted?{receipts:[],summary:()=>({attempts:0,reservedEquivalentUSD:0,estimatedUsageUSD:0}),close(){},async decide(){return {kind:'accept',reason:'Scripted dry-run consent'};},async reflect(){return {kind:config.scriptedReflection??'withdraw',reason:'Scripted reconsideration after actual local sighting'};}}:new ClaudeDecisionBackend({ledgerPath:config.ledger,scratchRoot:config.scratchRoot,trial:'reconsider-v1'});
const budget=new TrialBudget(config.jevLedger,.008,4,'jev-reconsider-v1');
const before={claude:backend.summary(),jev:budget.summary()};
if(!cold&&(before.claude.attempts||before.jev.calls))throw Error('Fresh trial required; no replay or automatic continuation');
const maxDecisions=6-Number(before.claude.attempts);
const appraiser=cold?undefined:scripted?{async assess(){return {reflectionScore:.2,costUSD:0};}}:new JevAppraiser(protectedJevTransport(),budget);
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const env=Object.fromEntries(['PATH','HOME','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const digestCode="const fs=require('fs'),p=require('path'),h=require('crypto').createHash('sha256'),d=process.argv[1];for(const n of fs.readdirSync(d).filter(n=>n.endsWith('.js')).sort()){h.update(n);h.update(fs.readFileSync(p.join(d,n)));}console.log(h.digest('hex'));";
const local=execFileSync(process.execPath,['-e',digestCode,new URL('../dist/src/',import.meta.url).pathname],{env,encoding:'utf8'}).trim();
const remote=execFileSync('ssh',['-o','BatchMode=yes',config.sshTarget,'node -e '+quote(digestCode)+' '+quote(config.remoteRepo+'/dist/src')],{env,timeout:15000,encoding:'utf8'}).trim();
if(local!==remote)throw Error('Remote runner differs from local build');
const marker=config.receipt+'.started';
const runId=cold?JSON.parse(await readFile(marker,'utf8')).runId:randomUUID();
if(!cold)await writeFile(marker,JSON.stringify({runId,scripted,at:new Date().toISOString()}),{flag:'wx',mode:0o600});
const command=`env CONCORD_TRIAL_ID=${quote(runId)} RIMWORLD_LAB_ROOT=${quote(config.labRoot)} bash ${quote(config.remoteRepo+'/scripts/run-reconsider-lab.sh')} ${cold?'cold':'game'}${scripted?' --scripted':''}`;
const child=spawn('ssh',['-o','BatchMode=yes',config.sshTarget,command],{env,stdio:['pipe','pipe','pipe']});
const lane=new InferenceLane();
const input=createInterface({input:child.stdout,crlfDelay:Infinity}),active=new Map(),seen=new Set(),tasks=[],appraisals=[];
let receipt,draining=false,failed=false,decisionCount=0,appraisalCount=0;
const send=m=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(m)+'\n');};
child.stderr.on('data',()=>{});child.stdin.on('error',()=>{failed=true;});
async function handle(line){
 if(line.length>32000)throw Error('Oversized input');const m=JSON.parse(line);
 if(m.type==='receipt'){if(receipt)throw Error('Duplicate receipt');receipt=m.receipt;return;}
 if(!/^[0-9a-f-]{36}$/.test(m.id))throw Error('Invalid correlation');
 if(m.type==='decision-cancel'||m.type==='appraisal-cancel'){active.get(m.id)?.abort();return;}
 if(m.type==='drain'){draining=true;for(const c of active.values())c.abort();await lane.drain();send({type:'drained',id:m.id});return;}
 if(draining||cold||seen.has(m.id))throw Error('Unexpected request');
 const isDecision=m.type==='decision-request';
 if(isDecision){if(!['decision','reflection'].includes(m.mode)||++decisionCount>maxDecisions)throw Error('Decision limit');}
 else if(m.type!=='appraisal'||++appraisalCount>4-Number(before.jev.calls))throw Error('Appraisal limit');
 seen.add(m.id);const controller=new AbortController();active.set(m.id,controller);const start=Date.now();
 try{
  await lane.run(controller.signal,async()=>{
  if(isDecision){const output=await (m.mode==='decision'?backend.decide(m.view,controller.signal):backend.reflect(m.view,controller.signal));send({type:'decision-result',id:m.id,output});}
  else {const r=await appraiser.assess(m.view,controller.signal,20000);appraisals.push({status:'ok',elapsedMs:Date.now()-start,score:r.reflectionScore,costUSD:r.costUSD});send({type:'appraisal-result',id:m.id,result:{reflectionScore:r.reflectionScore}});}
  });
 }catch{
  // Failures and cancellation retain their reservations; never reroll a response.
  if(!isDecision)appraisals.push({status:'failed',elapsedMs:Date.now()-start});
  send(isDecision?{type:'decision-result',id:m.id,error:'Decision unavailable'}:{type:'appraisal-result',id:m.id,error:'Appraisal unavailable'});
 }finally{active.delete(m.id);}
}
input.on('line',line=>tasks.push(handle(line).catch(()=>{failed=true;child.kill();})));
const timer=setTimeout(()=>{failed=true;child.kill();},1200000);
const code=await new Promise(resolve=>{child.on('error',()=>resolve(-1));child.on('close',resolve);});
clearTimeout(timer);input.close();for(const c of active.values())c.abort();await Promise.all(tasks);
const result={at:new Date().toISOString(),kind:cold?'reconsider-live-cold':scripted?'reconsider-scripted':'reconsider-live',runId,passed:!failed&&code===0&&receipt?.passed===true,
 before,after:{claude:backend.summary(),jev:budget.summary()},decisions:backend.receipts,appraisals,game:receipt,
 accounting:'Claude native Max API-equivalent usage estimates; Jev paid API. Fresh immutable ledgers, no rerolls.'};
backend.close();budget.close();await writeFile(cold?config.receipt+'.cold.json':config.receipt,JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
