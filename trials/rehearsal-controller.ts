/** Scripted stand-in for the benchmark controller, for lifecycle rehearsals only (docs/HARNESS.md):
 * no model. `--version` and `debug …` go to the real codex, so the runner's version and catalog
 * checks stay real. `exec` reads the same `-c mcp_servers.arm.*` settings the real controller would,
 * starts that server, and drives it with a fixed script over MCP (harness arm: the T1 walk-through;
 * UI arm: a few screenshots and a pause toggle, then report_done, lifecycle only). It prints
 * codex-shaped JSONL events with zero usage. A rehearsal receipt never counts as a scored run. */
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
const real=process.env.CONCORD_REAL_CODEX??'codex';
const argv=process.argv.slice(2);
if(argv[0]!=='exec'){const r=spawnSync(real,argv,{stdio:'inherit'});process.exit(r.status??1);}
const cfg=new Map<string,string>();for(let i=0;i<argv.length;i++)if(argv[i]==='-c'){const kv=argv[++i]!;const at=kv.indexOf('=');cfg.set(kv.slice(0,at),kv.slice(at+1));}
const parse=(v:string|undefined)=>v===undefined?undefined:JSON.parse(v.startsWith('{')?v.replace(/"=/g,'":'):v);
const command=parse(cfg.get('mcp_servers.arm.command')) as string,args=(parse(cfg.get('mcp_servers.arm.args'))??[]) as string[],env=(parse(cfg.get('mcp_servers.arm.env'))??{}) as Record<string,string>;
const serverPath=args.join(' ');const arm=/ui-mcp-server/.test(serverPath)?'ui':'harness';
const emit=(o:object)=>process.stdout.write(JSON.stringify(o)+'\n');
emit({type:'thread.started',thread_id:'rehearsal'});emit({type:'turn.started'});
const server=spawn(command,args,{env,stdio:['pipe','pipe','inherit']});
const pending=new Map<number,(v:any)=>void>();let next=1;
createInterface({input:server.stdout}).on('line',l=>{const m=JSON.parse(l);pending.get(m.id)?.(m);pending.delete(m.id);});
const rpc=(method:string,params:object={})=>new Promise<any>(r=>{const id=next++;pending.set(id,r);server.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
const call=async(name:string,a:object={})=>{const r=await rpc('tools/call',{name,arguments:a});const text=r.result?.content?.find((c:any)=>c.type==='text')?.text;
  emit({type:'item.completed',item:{type:'mcp_tool_call',server:'arm',tool:name,status:r.result?.isError?'failed':'completed'}});try{return JSON.parse(text);}catch{return text;}};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'concord-rehearsal',version:'1'}});
server.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');await rpc('tools/list');
try{
  if(arm==='ui'){for(let i=0;i<3;i++){await call('screenshot');await sleep(1000);}await call('key',{key:'space'});await call('screenshot');await call('report_done',{summary:'UI lifecycle rehearsal: no gameplay attempted.'});}
  else{
    const o=await call('observe');const pawns=o.colony.pawns as {x:number;z:number}[];
    const cx=Math.round(pawns.reduce((n,p)=>n+p.x,0)/pawns.length),cz=Math.round(pawns.reduce((n,p)=>n+p.z,0)/pawns.length);
    let fire:any;outer:for(let r=2;r<12;r++)for(let dx=-r;dx<=r;dx++)for(const dz of [-r,r]){const a=await call('act',{action:{action:'place_blueprint',def:'Campfire',x:cx+dx,z:cz+dz}});if(a?.ok){fire=a;break outer;}}
    if(!fire)throw Error('no placement accepted');
    await call('time',{control:'3'});
    let bench:any;for(let i=0;i<150&&!bench;i++){await sleep(2000);const s=await call('observe');bench=s.colony.map.things.find((t:any)=>t.def==='Campfire'&&t.kind==='building');}
    if(!bench)throw Error('campfire not built');
    await call('time',{control:'pause'});
    const bill=await call('act',{action:{action:'bill',bench:bench.id,recipe:'CookMealSimple',repeat:'count',count:3}});if(!bill?.ok)throw Error('bill refused');
    await call('time',{control:'3'});
    for(let i=0;i<300;i++){await sleep(2000);const s=await call('observe');const b=s.colony.bills.flatMap((x:any)=>x.bills).find((x:any)=>x.loadId===bill.id);if(b&&b.repeatCount===0)break;}
    await call('report_done',{summary:'Harness lifecycle rehearsal: scripted T1 walk-through.'});
  }
}catch(e){emit({type:'error',message:String(e)});}
emit({type:'turn.completed',usage:{input_tokens:0,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0}});
server.stdin.end();setTimeout(()=>process.exit(0),500);
