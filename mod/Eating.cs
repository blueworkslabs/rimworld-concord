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
  public static string FoodFailure(Pawn p,Thing t){
   if(t==null||t.Destroyed)return "food-missing";
   if(t.def.defName!="RawBerries"&&t.def!=ThingDefOf.MealSimple)return "food-type";
   if(!t.IngestibleNow)return "not-ingestible";
   if(t.IsForbidden(p))return "food-forbidden";
   if(!p.WillEat(t,p))return "diet-refuses";
   if(t.def.IsDrug)return "drug-excluded";
   return null;
  }
  public static bool Food(Pawn p,Thing t){return FoodFailure(p,t)==null;}
  public static int Portion(Pawn p,Thing t){return Math.Min(25,Math.Min(t.stackCount,FoodUtility.WillIngestStackCountOf(p,t.def,FoodUtility.NutritionForEater(p,t))));}
  // Same predicates as Valid; first failed check only, not an exhaustive diagnosis.
  public static string ValidationFailure(Pawn p,Thing t,int n){
   if(!Movement.Available(p))return "pawn-unavailable";
   if(p.needs.food==null)return "food-need-missing";
   if(!p.health.capacities.CapableOf(PawnCapacityDefOf.Manipulation))return "manipulation-unavailable";
   if(!(p.needs.food.CurLevelPercentage<.9f))return "food-need-satisfied";
   if(p.carryTracker.CarriedThing!=null)return "already-carrying";
   if(p.jobs.curDriver is JobDriver_Ingest)return "already-ingesting";
   var food=FoodFailure(p,t);if(food!=null)return food;
   if(!t.Spawned)return "food-unspawned";
   if(t.Map!=p.Map)return "food-map-changed";
   if(!Production.Visible(p,t.Position))return "outside-local-view";
   if(n<1||n>25)return "portion-out-of-bounds";
   if(n>Portion(p,t))return "portion-unavailable";
   if(!p.CanReserve(t,1,n))return "reservation-unavailable";
   if(!p.CanReach(t,PathEndMode.ClosestTouch,Danger.None))return "unreachable";
   return null;
  }
  public static bool Valid(Pawn p,Thing t,int n){return ValidationFailure(p,t,n)==null;}
  static void Reject(ActionRecord a,string code){a.failureCode=code;a.reason="Eating rejected: "+code;}
  public static string Options(Pawn p,string epoch){
   var list=new List<EatOption>();
   if(Ready(p))for(int dx=-12;dx<=12;dx++)for(int dz=-12;dz<=12;dz++){
    var c=p.Position+new IntVec3(dx,0,dz);if(!Production.Visible(p,c))continue;
    foreach(var t in c.GetThingList(p.Map))if(list.Count<6&&Food(p,t)){int n=Portion(p,t);if(Valid(p,t,n))list.Add(new EatOption{thing=t.GetUniqueLoadID(),label=t.LabelNoCount,x=c.x,z=c.z,count=n});}
   }
   return "{\"epoch\":\""+epoch+"\",\"tick\":"+Find.TickManager.TicksGame+",\"mapId\":"+p.Map.uniqueID+",\"options\":["+String.Join(",",list.Select(o=>JsonUtility.ToJson(o)).ToArray())+"]}";
  }
  public static void Start(Pawn p,Request r,ActionRecord a){
   a.validatedTick=Find.TickManager.TicksGame;
   if(r.mapId!=p.Map.uniqueID){Reject(a,"request-map-changed");return;}
   if(r.maxTicks!=1800){Reject(a,"invalid-duration");return;}
   var t=Production.FindThing(p.Map,r.thing);var failure=ValidationFailure(p,t,r.count);
   if(failure!=null){Reject(a,failure);return;}
   if(t.Position!=new IntVec3(r.x,0,r.z)){Reject(a,"food-position-changed");return;}
   a.untilTick=Math.Min(r.untilTick,Find.TickManager.TicksGame+1800);if(a.untilTick<=Find.TickManager.TicksGame){Reject(a,"deadline-expired");return;}
   var job=JobMaker.MakeJob(DefDatabase<JobDef>.GetNamed("Concord_Eat"),t);job.count=r.count;job.takeExtraIngestibles=0;
   a.jobId=job.loadID;a.status="started";a.reason="Pawn chose a bounded portion; not yet consumed";
   p.jobs.TryTakeOrderedJob(job,JobTag.Misc);
   if(p.CurJob!=job&&a.status=="started"){a.status="failed";Reject(a,"scheduler-rejected");p.jobs.jobQueue.RemoveAll(p,q=>q.loadID==job.loadID);}
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
