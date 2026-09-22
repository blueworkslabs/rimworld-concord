import type {Action,Haul} from '../src/protocol.js';
export function smallerHaul(a:Action,offer:Haul):boolean {
 return a.kind==='haul'&&a.thing===offer.thing&&a.x===offer.x&&a.z===offer.z&&
  a.count<=offer.count&&a.trips<=offer.trips&&a.maxTicks<=offer.maxTicks&&
  (a.count<offer.count||a.trips<offer.trips||a.maxTicks<offer.maxTicks);
}
export class NeedsRunGuard {
 stopped=false;
 stop(){this.stopped=true;}
 check(){if(this.stopped)throw Error('Trial stopped by disconnect or deadline');}
 sample(paused:boolean,ticks:number,initialTick:number){
  this.check();if(paused||ticks<=initialTick)throw Error('Native observation interrupted or not advancing');
 }
}
