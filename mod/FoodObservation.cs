using System;
using System.Linq;
using System.Collections.Generic;
using RimWorld;
using UnityEngine;
using Verse;
namespace Concord {
 [Serializable] public class FoodItem {public string thing,label;public int count,x,z,simpleMealIngredientCount;public bool nutritionGiving,forbidden;}
 [Serializable] public class FoodFire {public string thing;public int x,z;public bool usableForBills,forbidden;}
 [Serializable] public class FoodSight {public string source="shared-local-sighting",epoch;public int tick,mapId,radius=12;public bool truncated;public FoodItem[] items;public FoodFire[] campfires;}
 public static class FoodObservation {
  // Seeing a stack is independent of skill, needs, reservations and executable jobs.
  public static string Json(Pawn p,string epoch){
   var seen=new HashSet<Thing>();
   for(int dx=-12;dx<=12;dx++)for(int dz=-12;dz<=12;dz++){
    var cell=p.Position+new IntVec3(dx,0,dz);if(Production.Visible(p,cell))foreach(var t in cell.GetThingList(p.Map))seen.Add(t);
   }
   var ordered=seen.OrderBy(t=>(t.Position-p.Position).LengthHorizontalSquared).ThenBy(t=>t.GetUniqueLoadID()).ToArray();
   var food=ordered.Where(t=>t.def.category==ThingCategory.Item&&(t.def.IsNutritionGivingIngestible||Production.Ingredients(t)>0)).ToArray();
   var fires=ordered.OfType<Building_WorkTable>().Where(t=>t.def==Production.Campfire).ToArray();
   return JsonUtility.ToJson(new FoodSight{epoch=epoch,tick=Find.TickManager.TicksGame,mapId=p.Map.uniqueID,truncated=food.Length>8||fires.Length>4,
    items=food.Take(8).Select(t=>new FoodItem{thing=t.GetUniqueLoadID(),label=t.LabelNoCount,count=t.stackCount,x=t.Position.x,z=t.Position.z,nutritionGiving=t.def.IsNutritionGivingIngestible,forbidden=t.IsForbidden(p),simpleMealIngredientCount=Production.Ingredients(t)}).ToArray(),
    campfires=fires.Take(4).Select(t=>new FoodFire{thing=t.GetUniqueLoadID(),x=t.Position.x,z=t.Position.z,usableForBills=t.CurrentlyUsableForBills(),forbidden=t.IsForbidden(p)}).ToArray()});
  }
 }
}
