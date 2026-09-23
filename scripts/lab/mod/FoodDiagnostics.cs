using System;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;
using Verse.AI;
namespace Shellmaster.StagingLab {
 // Trusted operator diagnostics only. Never part of a character perspective.
 // These searches do not dispatch jobs, change needs or override food policy.
 [Serializable] public class FoodProbe {
  public string pawn,category,defaultSource,rawMinimumSource,job;
  public float food,wantEatThreshold,urgentThreshold,foodJobPriority;
  public bool rawFoodGene;
 }
 [Serializable] public class FoodCandidate {
  public string thing,def,preference;public int count;
  public bool forbidden,ingestibleNow,willEat,canReserve,canReach;
 }
 public static class FoodDiagnostics {
  static string Id(Thing t){return t==null?null:t.GetUniqueLoadID();}
  public static string Json(){
   var rows=Find.CurrentMap.mapPawns.FreeColonistsSpawned.OrderBy(p=>p.thingIDNumber).Take(16).Select(p=>{
    ThingDef def;
    var normal=FoodUtility.BestFoodSourceOnMap(p,p,p.needs.food.Starving,out def,allowCorpse:false,allowDispenserEmpty:false,allowHarvest:false);
    var raw=FoodUtility.BestFoodSourceOnMap(p,p,p.needs.food.Starving,out def,allowCorpse:false,allowDispenserEmpty:false,allowHarvest:false,minPrefOverride:FoodPreferability.RawBad);
    var row=new FoodProbe{pawn=Id(p),food=p.needs.food.CurLevelPercentage,category=p.needs.food.CurCategory.ToString(),wantEatThreshold=p.RaceProps.FoodLevelPercentageWantEat,urgentThreshold=p.needs.food.PercentageThreshUrgentlyHungry,foodJobPriority=new JobGiver_GetFood().GetPriority(p),rawFoodGene=p.genes!=null&&p.genes.DontMindRawFood,defaultSource=Id(normal),rawMinimumSource=Id(raw),job=p.CurJobDef==null?null:p.CurJobDef.defName};
    var candidates=Find.CurrentMap.listerThings.AllThings.Where(t=>t.def.defName=="RawBerries").OrderBy(t=>t.thingIDNumber).Take(16).Select(t=>JsonUtility.ToJson(new FoodCandidate{thing=Id(t),def=t.def.defName,count=t.stackCount,preference=t.def.ingestible.preferability.ToString(),forbidden=t.IsForbidden(p),ingestibleNow=t.IngestibleNow,willEat=p.WillEat(t,p),canReserve=p.CanReserve(t,10,1),canReach=p.CanReach(t,PathEndMode.ClosestTouch,Danger.Some)})).ToArray();
    return JsonUtility.ToJson(row).TrimEnd('}')+",\"berries\":["+String.Join(",",candidates)+"]}";
   }).ToArray();
   return "{\"tick\":"+Find.TickManager.TicksGame+",\"pawns\":["+String.Join(",",rows)+"]}";
  }
 }
}
