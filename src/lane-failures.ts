/** Only an actual successful inference resets a lane; native/idle scheduling is neutral. */
export class LaneFailures {
 readonly totals:Record<string,number>={};
 readonly streaks:Record<string,number>={};
 note(status:string,lane:string){
  if(['failed','interrupted'].includes(status)){
   this.totals[lane]=(this.totals[lane]??0)+1;
   this.streaks[lane]=(this.streaks[lane]??0)+1;
  }else if(['applied','delivered','silent','continued','decided'].includes(status))this.streaks[lane]=0;
  if((this.streaks[lane]??0)>=3)throw Error(`Repeated ${lane} failures; stopped for diagnosis`);
 }
}
