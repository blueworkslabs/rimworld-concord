using System;
using System.Collections.Generic;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;

namespace Concord {
    [Serializable] public class CasualtyObservation {public string target,name;public int x,z;}
    public class CasualtyNotice : IExposable {
        public string observer,target;
        public void ExposeData(){Scribe_Values.Look(ref observer,"observer");Scribe_Values.Look(ref target,"target");}
    }
    public static class Casualties {
        // Perception is independent of bed availability or ability to perform rescue.
        // A carrying pawn can see a casualty even while rescue options are unavailable.
        public static List<Pawn> Visible(Pawn p) {
            var result=new List<Pawn>();
            if(!p.Spawned||p.Dead||p.Downed)return result;
            for(int distance=0;distance<=12;distance++)
                for(int dx=-distance;dx<=distance;dx++)for(int dz=-distance;dz<=distance;dz++) {
                    if(Math.Max(Math.Abs(dx),Math.Abs(dz))!=distance||result.Count>=8)continue;
                    var cell=p.Position+new IntVec3(dx,0,dz);
                    if(!cell.InBounds(p.Map)||cell.Fogged(p.Map)||!GenSight.LineOfSight(p.Position,cell,p.Map))continue;
                    foreach(var t in cell.GetThingList(p.Map).OfType<Pawn>())
                        if(t!=p&&t.Faction==p.Faction&&t.IsColonist&&!t.IsPrisoner&&!t.IsSlave&&result.Count<8)result.Add(t);
                }
            return result;
        }
        public static bool NeedsHelp(Pawn p){return !p.Dead&&p.Downed&&!p.InBed()&&!p.ageTracker.CurLifeStage.alwaysDowned;}
        public static string View(Pawn p,string epoch) {
            var observations=Visible(p).Where(NeedsHelp).Select(t=>new CasualtyObservation {target=t.GetUniqueLoadID(),name=t.LabelShort,x=t.Position.x,z=t.Position.z});
            return "{\"epoch\":\""+epoch+"\",\"tick\":"+Find.TickManager.TicksGame+",\"mapId\":"+p.Map.uniqueID+",\"radius\":12,\"observations\":["+
                String.Join(",",observations.Select(o=>JsonUtility.ToJson(o)).ToArray())+"]}";
        }
    }
}
