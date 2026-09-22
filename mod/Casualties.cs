using System;
using System.Collections.Generic;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;

namespace Concord {
    [Serializable] public class CasualtyObservation {public string target,name;public int x,z;}
    [Serializable] public class VisibleSubject {public string target;public bool downed,inBed;}
    [Serializable] public class VisibleBed {public string bed;public int x,z;public bool medical,occupied,prisoner,slave,colonyOwned,forbidden;}
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
            var visible=Visible(p);
            var observations=visible.Where(NeedsHelp).Select(t=>new CasualtyObservation {target=t.GetUniqueLoadID(),name=t.LabelShort,x=t.Position.x,z=t.Position.z});
            var subjects=visible.Select(t=>new VisibleSubject {target=t.GetUniqueLoadID(),downed=t.Downed,inBed=t.InBed()});
            var beds=new List<VisibleBed>();
            if(p.Spawned&&!p.Dead&&!p.Downed)
                for(int distance=0;distance<=12;distance++)
                    for(int dx=-distance;dx<=distance;dx++)for(int dz=-distance;dz<=distance;dz++) {
                        if(Math.Max(Math.Abs(dx),Math.Abs(dz))!=distance||beds.Count>=12)continue;
                        var cell=p.Position+new IntVec3(dx,0,dz);
                        if(!cell.InBounds(p.Map)||cell.Fogged(p.Map)||!GenSight.LineOfSight(p.Position,cell,p.Map))continue;
                        foreach(var b in cell.GetThingList(p.Map).OfType<Building_Bed>()) {
                            if(beds.Count>=12||beds.Any(x=>x.bed==b.GetUniqueLoadID()))continue;
                            beds.Add(new VisibleBed {bed=b.GetUniqueLoadID(),x=b.Position.x,z=b.Position.z,medical=b.Medical,
                                occupied=Enumerable.Range(0,b.SleepingSlotsCount).Any(i=>b.GetCurOccupant(i)!=null),
                                prisoner=b.ForPrisoners,slave=b.ForSlaves,colonyOwned=b.Faction==p.Faction,forbidden=b.IsForbidden(p)});
                        }
                    }
            return "{\"epoch\":\""+epoch+"\",\"tick\":"+Find.TickManager.TicksGame+",\"mapId\":"+p.Map.uniqueID+",\"radius\":12,\"observations\":["+
                String.Join(",",observations.Select(o=>JsonUtility.ToJson(o)).ToArray())+"],\"visibleSubjects\":["+
                String.Join(",",subjects.Select(o=>JsonUtility.ToJson(o)).ToArray())+"],\"visibleBeds\":["+
                String.Join(",",beds.Select(o=>JsonUtility.ToJson(o)).ToArray())+"]}";
        }
    }
}
