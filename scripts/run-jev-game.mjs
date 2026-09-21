// Operator driver on the protected Gateway host; game runner remains on the lab host.
// Usage: node scripts/run-jev-game.mjs /absolute/operator-config.json [--cold]
import { spawn } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { JevAppraiser,TrialBudget } from '../dist/src/appraisal.js';
import { protectedJevTransport } from '../dist/src/protected-jev.js';

const config=JSON.parse(await readFile(process.argv[2],'utf8'));
const cold=process.argv.includes('--cold');
if(!/^[a-zA-Z0-9_.@-]+$/.test(config.sshTarget)||config.sshTarget.startsWith('-')||
  ![config.labRoot,config.remoteRepo,config.ledger,config.receipt].every(p=>typeof p==='string'&&p.startsWith('/')))
  throw Error('Invalid operator configuration');
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const budget=new TrialBudget(config.ledger);const before=budget.summary();
if(!cold&&Number(before.calls)>1)throw Error('Insufficient remaining calls for two-appraisal trial');
const appraiser=cold?undefined:new JevAppraiser(protectedJevTransport(),budget);
// Deliberately forward no model credentials, sentinels or proxy environment to SSH.
const env=Object.fromEntries(['PATH','HOME','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const command=`env RIMWORLD_LAB_ROOT=${quote(config.labRoot)} flock -n ${quote(config.labRoot+'/concord/coordinator.lock')} node ${quote(config.remoteRepo+'/dist/src/jev-game-acceptance.js')}${cold?' --cold':''}`;
const child=spawn('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10',config.sshTarget,command],{env,stdio:['pipe','pipe','pipe']});
const input=createInterface({input:child.stdout,crlfDelay:Infinity});
const calls=[];const active=new Map();const seen=new Set();let receipt,failed=false,stderrBytes=0;
const tasks=[];
child.stderr.on('data',b=>{stderrBytes+=b.length;}); // Do not print arbitrary transport diagnostics.
child.stdin.on('error',()=>{failed=true;});
function reply(message){if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(message)+'\n');}
async function handle(line){
  if(line.length>24000)throw Error('Oversized relay input');
  const message=JSON.parse(line);
  if(message.type==='receipt'){if(receipt)throw Error('Duplicate receipt');receipt=message.receipt;return;}
  if(!/^[0-9a-f-]{36}$/.test(message.id))throw Error('Invalid correlation ID');
  if(message.type==='appraisal-cancel'){active.get(message.id)?.abort();return;}
  if(message.type!=='appraisal'||cold||seen.has(message.id)||seen.size>=2||active.size)throw Error('Unexpected relay request');
  seen.add(message.id);const controller=new AbortController();active.set(message.id,controller);
  const began=Date.now();
  try {
    const result=await appraiser.assess(message.view,controller.signal,20000);
    calls.push({status:'ok',latencyMs:Date.now()-began,reflectionScore:result.reflectionScore,
      model:/^typesafe\/jev-1\.13(?:-\d{8})?$/.test(result.model)?result.model:'unrecognized-variant',costUSD:result.costUSD});
    reply({type:'appraisal-result',id:message.id,result:{reflectionScore:result.reflectionScore}});
  }catch {
    calls.push({status:'failed',latencyMs:Date.now()-began});
    reply({type:'appraisal-result',id:message.id,error:'Appraisal unavailable'});
  }finally {active.delete(message.id);}
}
input.on('line',line=>{const task=handle(line).catch(()=>{failed=true;child.kill();});tasks.push(task);});
const timeout=setTimeout(()=>{failed=true;child.kill();},240000);
const code=await new Promise(resolve=>{child.on('error',()=>resolve(-1));child.on('close',resolve);});
clearTimeout(timeout);input.close();for(const c of active.values())c.abort();await Promise.all(tasks);
const after=budget.summary();budget.close();
const result={at:new Date().toISOString(),kind:cold?'jev-game-cold':'jev-game-trial',
  passed:!failed&&code===0&&receipt?.passed===true&&calls.every(c=>c.status==='ok'),calls,before,after,game:receipt,
  ...(code!==0?{runnerExit:code,stderrBytes}:{})};
await writeFile(config.receipt,JSON.stringify(result,null,2),{mode:0o600});
console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
