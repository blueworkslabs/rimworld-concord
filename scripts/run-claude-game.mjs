// Native client on the login host; only perspective/decision JSON crosses SSH.
import { spawn,execFileSync } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { ClaudeDecisionBackend } from '../dist/src/claude-decision.js';
const config=JSON.parse(await readFile(process.argv[2],'utf8')),cold=process.argv.includes('--cold');
const audit=process.argv.includes('--audit');
if(cold&&audit)throw Error('Choose cold or audit');
if(audit&&!(typeof config.auditDB==='string'&&config.auditDB.startsWith(config.remoteRepo+'/.runtime/claude-game-')&&config.auditDB.endsWith('.db')))throw Error('Invalid audit database');
if(!/^[a-zA-Z0-9_.@-]+$/.test(config.sshTarget)||config.sshTarget.startsWith('-')||
 ![config.labRoot,config.remoteRepo,config.ledger,config.scratchRoot,config.receipt].every(p=>typeof p==='string'&&p.startsWith('/')))
 throw Error('Invalid operator configuration');
const backend=new ClaudeDecisionBackend({ledgerPath:config.ledger,scratchRoot:config.scratchRoot}),before=backend.summary();
if(!cold&&!audit&&Number(before.attempts)>1)throw Error('Two decision trial attempts must remain');
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const env=Object.fromEntries(['PATH','HOME','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const expectedHash=createHash('sha256').update(await readFile(new URL('../dist/src/claude-game-acceptance.js',import.meta.url))).digest('hex');
const remoteHash=execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10',config.sshTarget,'sha256sum '+quote(config.remoteRepo+'/dist/src/claude-game-acceptance.js')],{env,timeout:15000,encoding:'utf8'}).split(/\s/)[0];
if(remoteHash!==expectedHash)throw Error('Remote decision runner differs from local build; deploy before running');
const cmd=`env RIMWORLD_LAB_ROOT=${quote(config.labRoot)} flock -n ${quote(config.labRoot+'/concord/coordinator.lock')} node ${quote(config.remoteRepo+'/dist/src/claude-game-acceptance.js')}${cold?' --cold':audit?' --audit '+quote(config.auditDB):''}`;
const child=spawn('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10',config.sshTarget,cmd],{env,stdio:['pipe','pipe','pipe']});
let receipt,failed=false;const active=new Map(),seen=new Set(),tasks=[];
child.stderr.on('data',()=>{});child.stdin.on('error',()=>{failed=true;});
const input=createInterface({input:child.stdout,crlfDelay:Infinity});
const send=v=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(v)+'\n');};
async function handle(line){
 if(line.length>32000)throw Error();const m=JSON.parse(line);
 if(m.type==='receipt'){if(receipt)throw Error();receipt=m.receipt;return;}
 if(!/^[0-9a-f-]{36}$/.test(m.id))throw Error();
 if(m.type==='decision-cancel'){active.get(m.id)?.abort();return;}
 if(cold||audit||m.type!=='decision-request'||!['decision','reflection'].includes(m.mode)||active.size||seen.has(m.id)||seen.size>=2)throw Error();
 seen.add(m.id);const controller=new AbortController();active.set(m.id,controller);
 try{
   const output=await (m.mode==='decision'?backend.decide(m.view,controller.signal):backend.reflect(m.view,controller.signal));
   send({type:'decision-result',id:m.id,output});
 }catch{failed=true;send({type:'decision-result',id:m.id,error:'Decision unavailable'});}
 finally{active.delete(m.id);}
}
input.on('line',line=>tasks.push(handle(line).catch(()=>{failed=true;child.kill();})));
const timer=setTimeout(()=>{failed=true;child.kill();},420000);
const code=await new Promise(resolve=>{child.on('error',()=>resolve(-1));child.on('close',resolve);});
clearTimeout(timer);input.close();for(const controller of active.values())controller.abort();await Promise.all(tasks);
const result={at:new Date().toISOString(),kind:cold?'claude-game-cold':audit?'claude-game-audit':'claude-game-trial',passed:!failed&&code===0&&receipt?.passed===true,
 access:'Claude Code native Max login; monetary values are API-equivalent usage estimates, not cash billing',
 before,after:backend.summary(),calls:backend.receipts,game:receipt};backend.close();
await writeFile(config.receipt,JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
