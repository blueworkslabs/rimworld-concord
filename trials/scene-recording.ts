/** Lab-only capture; never exposed to character backends. */
import {dirname} from 'node:path';
import assert from 'node:assert/strict';
import {open,readFile,statfs} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {recordingProcess} from '../src/recording-process.js';
export async function startSceneRecording(prefix:string,nativeMs:number,scripted:boolean,check:()=>void){
 const free=await statfs(dirname(prefix));
 assert(free.bavail*free.bsize>512*1024*1024,'Recording requires 512 MiB free');
 const log=await open(prefix+'-ffmpeg.log','wx');
 const startedUnixMs=Date.now(),label=scripted?'SCRIPTED REHEARSAL - no model calls (silent)':'LIVE LUNA - continuous gameplay (silent)';
 const rec=recordingProcess('ffmpeg',['-nostdin','-n','-loglevel','info','-f','x11grab','-draw_mouse','0','-framerate','15','-video_size','1280x800','-i',':91','-t',String(nativeMs/1000+30),'-an','-vf',`drawtext=text='${label}':x=440:y=75:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=6`,'-c:v','libx264','-preset','veryfast','-crf','22','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart','-fs','268435456','-progress',prefix+'-progress.txt',prefix+'.mp4'],{env:{...process.env,DISPLAY:':91',XAUTHORITY:'/run/rimworld-lab-display/Xauthority'},stdio:['ignore','ignore',log.fd]});
 try{
  await log.close();
  const deadline=Date.now()+10000;
  while(true){
   check();if(rec.failure)throw rec.failure;if(rec.finished)throw Error('Recorder exited before ready');
   const progress=await readFile(prefix+'-progress.txt','utf8').catch(()=> '');
   if([...progress.matchAll(/^frame=(\d+)$/gm)].some(m=>Number(m[1])>0))break;
   if(Date.now()>deadline)throw Error('Recorder produced no frame');await delay(100);
  }
 }catch(e){await rec.stop();throw e;}
 return {prefix,startedUnixMs,readyUnixMs:Date.now(),
  check(){if(rec.failure)throw rec.failure;if(rec.finished)throw Error('Recorder ended before scene completed');},
  async stop(){await rec.stop();},
  async finalize(minMs:number){
   await rec.stop();const code=await rec.completion;assert([0,255].includes(code!),'Recorder exit failure');
   const {stdout}=await promisify(execFile)('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',prefix+'.mp4'],{timeout:30000});
   const media=JSON.parse(stdout);assert(Number(media.format.duration)*1000>=minMs,'Recording shorter than observed scene');
   return {startedUnixMs,readyUnixMs:this.readyUnixMs,finalizedUnixMs:Date.now(),exitCode:code,media,progress:await readFile(prefix+'-progress.txt','utf8'),timeMapping:'Video offsets approximate from recorder spawn; native start and wall-clock samples retained, not frame-exact.'};
  }
 };
}
