// Finite combined trial on the native-login/protected-egress host. No credentials cross SSH.
import {randomUUID} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {parseTrialMessage} from '../dist/src/trial-wire.js';
import {InferenceLane} from '../dist/src/inference-lane.js';
import {ClaudeDecisionBackend} from '../dist/src/claude-decision.js';


const config=JSON.parse(await readFile(process.argv[2],'utf8')),cold=process.argv.includes('--cold'),scripted=process.argv.includes('--scripted');

if(!/^[a-zA-Z0-9_.@-]+$/.test(config.sshTarget)||config.sshTarget.startsWith('-')||
 !['labRoot','remoteRepo','ledger','scratchRoot','receipt'].every(k=>typeof config[k]==='string'&&config[k].startsWith('/')))throw Error('Invalid operator configuration');
const policy='social-v1';
const backend=scripted?{receipts:[],summary:()=>({attempts:0,reservedEquivalentUSD:0}),close(){},async speak(view){
 return {choice:'say',text:view.exchange.turn==='opening'?'I would like a meal before more work. Would you consider helping with the wood?':'I can consider one load, but I will decide when I see the offer.'};
},async decide(view){
 const food=view.pawn.facts?.find(f=>f.key==='need'&&f.value==='Food')?.level;
 return food<.5?{kind:'refuse',reason:'Scripted choice to eat first'}:{kind:'accept',reason:'Scripted consent to this separate load'};
}}:new ClaudeDecisionBackend({ledgerPath:config.ledger,scratchRoot:config.scratchRoot,trial:policy});
const before={claude:backend.summary()};
if(!cold&&before.claude.attempts)throw Error('Fresh trial required');
const maxDecisions=4-Number(before.claude.attempts);
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const env=Object.fromEntries(['PATH','HOME','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const digestCode="const fs=require('fs'),p=require('path'),h=require('crypto').createHash('sha256'),d=process.argv[1];for(const sub of ['src','trials'])for(const n of fs.readdirSync(p.join(d,sub)).filter(n=>n.endsWith('.js')).sort()){h.update(sub+'/'+n);h.update(fs.readFileSync(p.join(d,sub,n)));}console.log(h.digest('hex'));";
const local=execFileSync(process.execPath,['-e',digestCode,new URL('../dist/',import.meta.url).pathname],{env,encoding:'utf8'}).trim();
const remote=execFileSync('ssh',['-o','BatchMode=yes',config.sshTarget,'node -e '+quote(digestCode)+' '+quote(config.remoteRepo+'/dist')],{env,timeout:15000,encoding:'utf8'}).trim();
if(local!==remote)throw Error('Remote runner differs from local build');
const marker=config.receipt+'.started';
const runId=cold?JSON.parse(await readFile(marker,'utf8')).runId:randomUUID();
if(!cold)await writeFile(marker,JSON.stringify({runId,scripted,policy,at:new Date().toISOString()}),{flag:'wx',mode:0o600});
if(cold&&(JSON.parse(await readFile(marker,'utf8')).policy!==policy||JSON.parse(await readFile(marker,'utf8')).scripted!==scripted))throw Error('Cold policy mismatch');
const command=`env CONCORD_TRIAL_POLICY=${quote(policy)} CONCORD_TRIAL_ID=${quote(runId)} RIMWORLD_LAB_ROOT=${quote(config.labRoot)} bash ${quote(config.remoteRepo+'/scripts/run-social-lab.sh')} ${cold?'cold':'game'}${scripted?' --scripted':''}`;
const child=spawn('ssh',['-o','BatchMode=yes',config.sshTarget,command],{env,stdio:['pipe','pipe','pipe']});
const lane=new InferenceLane();
const input=createInterface({input:child.stdout,crlfDelay:Infinity}),active=new Map(),seen=new Set(),tasks=[],responses=[];
let receipt,draining=false,failed=false,decisionCount=0;
const send=m=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(m)+'\n');};
child.stderr.on('data',()=>{});child.stdin.on('error',()=>{failed=true;});
async function handle(line){
 const m=parseTrialMessage(line);
 if(m.type==='receipt'){if(receipt)throw Error('Duplicate receipt');receipt=m.receipt;return;}
 if(!/^[0-9a-f-]{36}$/.test(m.id))throw Error('Invalid correlation');
 if(m.type==='decision-cancel'){active.get(m.id)?.abort();return;}
 if(m.type==='drain'){draining=true;for(const c of active.values())c.abort();await lane.drain();send({type:'drained',id:m.id});return;}
 if(draining||cold||seen.has(m.id))throw Error('Unexpected request');
 const isDecision=m.type==='decision-request';
 if(isDecision){if(!['decision','social'].includes(m.mode)||++decisionCount>maxDecisions)throw Error('Decision limit');}
 else throw Error('No appraisal requests allowed');
 seen.add(m.id);const controller=new AbortController();active.set(m.id,controller);const start=Date.now();
 try{
  await lane.run(controller.signal,async()=>{
  try {if(isDecision){const output=await (m.mode==='social'?backend.speak(m.view,controller.signal):backend.decide(m.view,controller.signal));
   responses.push({id:m.id,mode:m.mode,pawn:m.view.pawn.id,receivedAt:new Date().toISOString(),elapsedMs:Date.now()-start,output});
   // Preserve returned answers even if the coordinator subsequently rejects them as stale.
   await writeFile(config.receipt+'.responses.json',JSON.stringify({runId,responses,decisions:backend.receipts,rawResponses:backend.rawResponses,failures:backend.failures},null,2),{mode:0o600});
   send({type:'decision-result',id:m.id,output});}

  }finally{await writeFile(config.receipt+'.responses.json',JSON.stringify({runId,responses,decisions:backend.receipts,rawResponses:backend.rawResponses,failures:backend.failures},null,2),{mode:0o600});}
  });
 }catch{
  // Failures and cancellation retain their reservations; never reroll a response.
  send({type:'decision-result',id:m.id,error:'Decision unavailable'});
 }finally{active.delete(m.id);}
}
input.on('line',line=>tasks.push(handle(line).catch(()=>{failed=true;child.kill();})));
const timer=setTimeout(()=>{failed=true;child.kill();},1200000);
const code=await new Promise(resolve=>{child.on('error',()=>resolve(-1));child.on('close',resolve);});
clearTimeout(timer);input.close();for(const c of active.values())c.abort();await Promise.all(tasks);
const result={at:new Date().toISOString(),policy,kind:cold?'social-cold':scripted?'social-scripted':'social-live',runId,passed:!failed&&code===0&&receipt?.passed===true,
 before,after:{claude:backend.summary(),jevCalls:0},decisions:backend.receipts,rawResponses:backend.rawResponses,failures:backend.failures,responses,game:receipt,
 accounting:'Claude native Max API-equivalent usage estimates; No Jev calls. Fresh immutable ledgers, no rerolls.'};
backend.close();await writeFile(cold?config.receipt+'.cold.json':config.receipt,JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
