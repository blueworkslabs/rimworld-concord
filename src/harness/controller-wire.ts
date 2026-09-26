import {createInterface} from 'node:readline';

/** Cross-host benchmark wire (docs/HARNESS.md): the game-side runner on the game host and the
 * controller host exchange JSON lines over the ssh session's stdio, as the ongoing runner does.
 * Game → host: ready (setup done, paths for the arm server), stop, receipt, setup-failed.
 * Host → game: launched (the controller started; its version and hashes), launch-failed,
 * controller-event (one line of the controller's JSON event stream), controller-exit. */
export type GameToHost=
  {type:'ready';runId:string;arm:'harness'|'ui';rehearsal:boolean;model:string;reasoning:string;taskSha256:string;armEnv:Record<string,string>;preflightEnv:Record<string,string>}|
  {type:'start';runId:string}|{type:'stop';runId:string}|{type:'receipt';runId:string;receipt:unknown}|{type:'setup-failed';runId:string;error:string};
export type HostToGame=
  {type:'prepared'|'launched';runId:string;at:number;version:string;catalogSha256:string;argsSha256:string;preflight:{findings:string[]}|null}|
  {type:'launch-failed';runId:string;error:string}|{type:'controller-event';runId:string;line:string}|{type:'controller-exit';runId:string;code:number|null};
const MAX_LINE=16*1024*1024;
export class LineChannel<In extends {type:string},Out> {
  private waiters:{match:(m:In)=>boolean;resolve:(m:In)=>void;reject:(e:Error)=>void}[]=[];private handlers:((m:In)=>void)[]=[];private closers:(()=>void)[]=[];
  closed=false;noise:string[]=[];private rl;
  constructor(private input:NodeJS.ReadableStream,private output:NodeJS.WritableStream){
    const rl=this.rl=createInterface({input,crlfDelay:Infinity});
    rl.on('line',line=>{if(!line.trim())return;let m:In;
      // Anything that is not a wire message (a stray log line) is kept aside, never acted on.
      try{if(Buffer.byteLength(line)>MAX_LINE)throw Error('oversized');m=JSON.parse(line);if(typeof m?.type!=='string')throw Error('untyped');}catch{this.noise.push(line.slice(0,2000));return;}
      const w=this.waiters.findIndex(x=>x.match(m));if(w>=0){this.waiters.splice(w,1)[0]!.resolve(m);}for(const h of this.handlers)h(m);});
    rl.on('close',()=>{this.closed=true;for(const h of this.closers)h();for(const w of this.waiters.splice(0))w.reject(Error('Wire closed'));});
  }
  close(){this.rl.close();(this.input as any).destroy?.();}
  send(m:Out){this.output.write(JSON.stringify(m)+'\n');}
  on(h:(m:In)=>void){this.handlers.push(h);}
  onClose(h:()=>void){if(this.closed)h();else this.closers.push(h);}
  next(match:(m:In)=>boolean,timeoutMs:number,signal?:AbortSignal){
    return new Promise<In>((resolve,reject)=>{if(this.closed)return reject(Error('Wire closed'));
      const remove=()=>{const i=this.waiters.indexOf(w);if(i>=0)this.waiters.splice(i,1);clearTimeout(t);signal?.removeEventListener('abort',abort);};
      const w={match,resolve:(m:In)=>{remove();resolve(m);},reject:(e:Error)=>{remove();reject(e);}};
      const abort=()=>w.reject(Error('Wire wait aborted'));
      const t=setTimeout(()=>w.reject(Error('Wire timeout')),timeoutMs);this.waiters.push(w);
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
  }
}
