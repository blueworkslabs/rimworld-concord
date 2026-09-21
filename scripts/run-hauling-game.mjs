// Finite combined trial on the native-login/protected-egress host. No credentials cross SSH.
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {InferenceLane} from '../dist/src/inference-lane.js';
import {ClaudeDecisionBackend} from '../dist/src/claude-decision.js';
import {JevAppraiser,TrialBudget} from '../dist/src/appraisal.js';
import {protectedJevTransport} from '../dist/src/protected-jev.js';
const config=JSON.parse(await readFile(process.argv[2],'utf8')),cold=process.argv.includes('--cold'),replies=process.argv.includes('--reply-counters');
if(cold&&replies)throw Error('Choose cold restore or counter replies');
if(!/^[a-zA-Z0-9_.@-]+$/.test(config.sshTarget)||config.sshTarget.startsWith('-')||
 !['labRoot','remoteRepo','ledger','jevLedger','scratchRoot','receipt'].every(k=>typeof config[k]==='string'&&config[k].startsWith('/')))throw Error('Invalid operator configuration');
const backend=new ClaudeDecisionBackend({ledgerPath:config.ledger,scratchRoot:config.scratchRoot,trial:'hauling-v1'});
const budget=new TrialBudget(config.jevLedger,.012,6,'jev-hauling-v1');
const before={claude:backend.summary(),jev:budget.summary()};
if(replies&&before.claude.attempts!==3)throw Error('Counter follow-up requires exactly three retained initial attempts');
if(!cold&&!replies&&(before.claude.attempts||before.jev.calls))throw Error('Fresh trial required; no replay or automatic continuation');
const maxDecisions=6-Number(before.claude.attempts);
const appraiser=cold||replies?undefined:new JevAppraiser(protectedJevTransport(),budget);
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const env=Object.fromEntries(['PATH','HOME','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const digestCode="const fs=require('fs'),p=require('path'),h=require('crypto').createHash('sha256'),d=process.argv[1];for(const n of fs.readdirSync(d).filter(n=>n.endsWith('.js')).sort()){h.update(n);h.update(fs.readFileSync(p.join(d,n)));}console.log(h.digest('hex'));";
const local=execFileSync(process.execPath,['-e',digestCode,new URL('../dist/src/',import.meta.url).pathname],{env,encoding:'utf8'}).trim();
const remote=execFileSync('ssh',['-o','BatchMode=yes',config.sshTarget,'node -e '+quote(digestCode)+' '+quote(config.remoteRepo+'/dist/src')],{env,timeout:15000,encoding:'utf8'}).trim();
if(local!==remote)throw Error('Remote runner differs from local build');
const command=`env RIMWORLD_LAB_ROOT=${quote(config.labRoot)} flock -n ${quote(config.labRoot+'/concord/coordinator.lock')} node ${quote(config.remoteRepo+'/dist/src/hauling-live.js')}${cold?' --cold':replies?' --reply-counters':''}`;
const child=spawn('ssh',['-o','BatchMode=yes',config.sshTarget,command],{env,stdio:['pipe','pipe','pipe']});
const lane=new InferenceLane();
const input=createInterface({input:child.stdout,crlfDelay:Infinity}),active=new Map(),seen=new Set(),tasks=[],appraisals=[];
let receipt,failed=false,decisionCount=0,appraisalCount=0;
const send=m=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(m)+'\n');};
child.stderr.on('data',()=>{});child.stdin.on('error',()=>{failed=true;});
async function handle(line){
 if(line.length>32000)throw Error('Oversized input');const m=JSON.parse(line);
 if(m.type==='receipt'){if(receipt)throw Error('Duplicate receipt');receipt=m.receipt;return;}
 if(!/^[0-9a-f-]{36}$/.test(m.id))throw Error('Invalid correlation');
 if(m.type==='decision-cancel'||m.type==='appraisal-cancel'){active.get(m.id)?.abort();return;}
 if(cold||seen.has(m.id))throw Error('Unexpected request');
 const isDecision=m.type==='decision-request';
 if(isDecision){if(!['decision','reflection'].includes(m.mode)||++decisionCount>maxDecisions)throw Error('Decision limit');}
 else if(replies||m.type!=='appraisal'||++appraisalCount>6-Number(before.jev.calls))throw Error('Appraisal limit');
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
const timer=setTimeout(()=>{failed=true;child.kill();},600000);
const code=await new Promise(resolve=>{child.on('error',()=>resolve(-1));child.on('close',resolve);});
clearTimeout(timer);input.close();for(const c of active.values())c.abort();await Promise.all(tasks);
const result={at:new Date().toISOString(),kind:cold?'hauling-live-cold':replies?'hauling-counter-replies':'hauling-live',passed:!failed&&code===0&&receipt?.passed===true,
 before,after:{claude:backend.summary(),jev:budget.summary()},decisions:backend.receipts,appraisals,game:receipt,
 accounting:'Claude native Max API-equivalent usage estimates; Jev paid API. Fresh immutable ledgers, no rerolls.'};
backend.close();budget.close();await writeFile(config.receipt,JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
