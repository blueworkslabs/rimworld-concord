import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
/** Linux-only benchmark ownership receipt. MCP is a separate process group in pinned Codex.
 * Check start time before signalling; never signal a reused PID or the runner's group. */
function identity(pid:number){
 try{const s=readFileSync(`/proc/${pid}/stat`,'utf8');const f=s.slice(s.lastIndexOf(')')+2).split(' ');return {pid,group:Number(f[2]),started:f[19],state:f[0]};}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}
export function registerArm(){
 const file=process.env.CONCORD_BENCH_PROCESS_FILE;if(!file)throw Error('Benchmark process ownership file required');
 const own=identity(process.pid);if(!own||own.group!==process.pid)throw Error('Benchmark arm must own its process group');
 writeFileSync(file,JSON.stringify(own));
 if(existsSync(file+'.stop'))throw Error('Benchmark already stopped');
}
export async function stopArm(file:string){
 writeFileSync(file+'.stop','stop');
 if(!existsSync(file))return;
 const saved=JSON.parse(readFileSync(file,'utf8')),now=identity(saved.pid);
 if(!now||now.started!==saved.started)return;
 if(now.group!==saved.pid||now.group===identity(process.pid)?.group)throw Error('Unsafe benchmark arm process ownership');
 try{process.kill(-now.group,'SIGKILL');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}
 const end=Date.now()+1000;
 while(Date.now()<end){const p=identity(saved.pid);if(!p||p.started!==saved.started||p.state==='Z')return;await delay(10);}
 throw Error('Benchmark arm failed to stop');
}

/** An arm server serves only inside a run that holds the lab lock (the pair script holds it for both
 * runs): if a non-blocking flock on the lab lock succeeds, nobody holds it, and the server refuses. */
export function assertLabLockHeld(labRoot=process.env.RIMWORLD_LAB_ROOT){
 if(!labRoot||!labRoot.startsWith('/'))throw Error('Absolute RIMWORLD_LAB_ROOT required');
 const r=spawnSync('flock',['-n',labRoot+'/concord/coordinator.lock','true']);
 if(r.error)throw r.error;if(r.status===0)throw Error('Lab lock is not held: the arm server runs only inside a benchmark run');
}
