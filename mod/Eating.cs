using System;
using System.Collections.Generic;
using System.Linq;
using RimWorld;
using Verse;
using Verse.AI;
using UnityEngine;
namespace Concord {
 [Serializable] public class EatOption {public string thing,label;public int x,z,count,maxTicks=1800;}
 public static class Eating {
  public static bool Ready(Pawn p){return Movement.Available(p)&&p.needs.food!=null&&p.health.capacities.CapableOf(PawnCapacityDefOf.Manipulation);}
  public static bool Food(Pawn p,Thing t){return t!=null&&!t.Destroyed&&(t.def.defName=="RawBerries"||t.def==ThingDefOf.MealSimple)&&t.IngestibleNow&&!t.IsForbidden(p)&&p.WillEat(t,p)&&!t.def.IsDrug;}
  public static int Portion(Pawn p,Thing t){return Math.Min(25,Math.Min(t.stackCount,FoodUtility.WillIngestStackCountOf(p,t.def,FoodUtility.NutritionForEater(p,t))));}
  public static bool Valid(Pawn p,Thing t,int n){return Ready(p)&&p.needs.food.CurLevelPercentage<.9f&&p.carryTracker.CarriedThing==null&&!(p.jobs.curDriver is JobDriver_Ingest)&&Food(p,t)&&t.Spawned&&t.Map==p.Map&&Production.Visible(p,t.Position)&&n>=1&&n<=25&&n<=Portion(p,t)&&p.CanReserve(t,1,n)&&p.CanReach(t,PathEndMode.ClosestTouch,Danger.None);}
  public static string Options(Pawn p,string epoch){
   var list=new List<EatOption>();
   if(Ready(p))for(int dx=-12;dx<=12;dx++)for(int dz=-12;dz<=12;dz++){
    var c=p.Position+new IntVec3(dx,0,dz);if(!Production.Visible(p,c))continue;
    foreach(var t in c.GetThingList(p.Map))if(list.Count<6&&Food(p,t)){int n=Portion(p,t);if(Valid(p,t,n))list.Add(new EatOption{thing=t.GetUniqueLoadID(),label=t.LabelNoCount,x=c.x,z=c.z,count=n});}
   }
   return "{\"epoch\":\""+epoch+"\",\"tick\":"+Find.TickManager.TicksGame+",\"mapId\":"+p.Map.uniqueID+",\"options\":["+String.Join(",",list.Select(o=>JsonUtility.ToJson(o)).ToArray())+"]}";
  }
  public static void Start(Pawn p,Request r,ActionRecord a){
   var t=Production.FindThing(p.Map,r.thing);
   if(r.mapId!=p.Map.uniqueID||r.maxTicks!=1800||!Valid(p,t,r.count)||t.Position!=new IntVec3(r.x,0,r.z)){a.reason="Food, portion, diet, availability, map or reservation changed";return;}
   a.untilTick=Math.Min(r.untilTick,Find.TickManager.TicksGame+1800);if(a.untilTick<=Find.TickManager.TicksGame){a.reason="Eating deadline expired";return;}
   var job=JobMaker.MakeJob(DefDatabase<JobDef>.GetNamed("Concord_Eat"),t);job.count=r.count;job.takeExtraIngestibles=0;
   a.jobId=job.loadID;a.status="started";a.reason="Pawn chose a bounded portion; not yet consumed";
   p.jobs.TryTakeOrderedJob(job,JobTag.Misc);
   if(p.CurJob!=job&&a.status=="started"){a.status="failed";a.reason="Native scheduler rejected eating";p.jobs.jobQueue.RemoveAll(p,q=>q.loadID==job.loadID);}
  }
 }
 public class JobDriver_ConcordEat:JobDriver_Ingest {
  protected override IEnumerable<Toil> MakeNewToils(){
   this.FailOn(()=>{var a=Production.Record(pawn,job);return a==null||a.status!="started"||!Eating.Ready(pawn)||Find.TickManager.TicksGame>=a.untilTick||!Eating.Food(pawn,job.targetA.Thing);});
   foreach(var toil in base.MakeNewToils()){
    if(toil.debugName=="FinalizeIngest"){
     var native=toil.initAction;
     toil.initAction=()=>{
      var a=Production.Record(pawn,job);var t=job.targetA.Thing;
      // Pickup preserves the selected source, but may split its identity. Never
      // collect extra stacks; bound the carried portion before native ingestion.
      if(a==null||a.status!="started"||!Eating.Food(pawn,t)||t.stackCount<1||t.stackCount>a.count||pawn.carryTracker.CarriedThing!=t||pawn.needs.food.CurLevelPercentage>=.9f){EndJobWith(JobCondition.Incompletable);return;}
      int before=t.stackCount;float nutrition=pawn.records.GetValue(RecordDefOf.NutritionEaten);
      native();int consumed=before-(t.Destroyed?0:t.stackCount);float gained=pawn.records.GetValue(RecordDefOf.NutritionEaten)-nutrition;
      a.delivered=Math.Max(0,consumed);a.status=consumed>0&&consumed<=a.count&&gained>0?"completed":"failed";
      a.reason=a.status=="completed"?"Native ingestion consumed "+consumed+" units from the chosen portion":"Native ingestion was not confirmed; no retry";
     };
    }
    yield return toil;
   }
  }
 }
}
