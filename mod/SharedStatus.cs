using System;
using UnityEngine;
using Verse;
namespace Concord {
 [Serializable] public class LinkStatus {public string source="shared-link-telemetry",epoch,food,rest;public int tick;}
 [Serializable] public class SharedStatus {public string pawn,name,source,epoch,food,rest;public int tick;public bool fresh;}
 public static class LinkTelemetry {
  // Deliberate game design: linked crew share only these coarse bands.
  private static string Band(RimWorld.Need need){return need==null?"unknown":need.CurLevelPercentage<0.2f?"urgent":need.CurLevelPercentage<0.5f?"low":"satisfied";}
  public static string Json(Pawn p,string epoch){return JsonUtility.ToJson(new LinkStatus {epoch=epoch,tick=Find.TickManager.TicksGame,food=Band(p.needs.food),rest=Band(p.needs.rest)});}
 }
}
