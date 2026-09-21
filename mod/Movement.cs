using System;
using System.Collections.Generic;
using System.Linq;
using Verse;
using Verse.AI;
using UnityEngine;

namespace Concord
{
    [Serializable] public class MoveOption { public string kind="move"; public int x,z; }
    [Serializable] public class MovementView {
        public string epoch,status;
        public int tick,originX,originZ,radius=3;
    }
    public static class Movement
    {
        public static bool Available(Pawn p) {
            return p!=null && p.Spawned && !p.Dead && !p.Downed && !p.InMentalState && !p.Drafted;
        }
        // Shared physical checks: observations never replace validation at dispatch.
        public static bool Reachable(Pawn p,IntVec3 cell) {
            return cell.InBounds(p.Map) && cell.Standable(p.Map) && p.CanReach(cell,PathEndMode.OnCell,Danger.None);
        }
        public static string Options(Pawn p,string epoch) {
            var view=new MovementView {epoch=epoch,tick=Find.TickManager.TicksGame,
                originX=p.Position.x,originZ=p.Position.z,status=Available(p)?"available":"unavailable"};
            var options=new List<MoveOption>();
            if(Available(p)) {
                // At most 24 cells examined (Manhattan radius 3), at most 12 offered.
                // No map scan, fogged destinations, or destinations behind opaque walls.
                for(int distance=1;distance<=view.radius;distance++)
                    for(int dx=-distance;dx<=distance;dx++)
                        for(int dz=-distance;dz<=distance;dz++) {
                            if(Math.Abs(dx)+Math.Abs(dz)!=distance || options.Count>=12) continue;
                            var cell=p.Position+new IntVec3(dx,0,dz);
                            if(!cell.InBounds(p.Map) || cell.Fogged(p.Map) || !GenSight.LineOfSight(p.Position,cell,p.Map)) continue;
                            if(Reachable(p,cell)) options.Add(new MoveOption {x=cell.x,z=cell.z});
                        }
            }
            return JsonUtility.ToJson(view).TrimEnd('}')+",\"options\":["+String.Join(",",options.Select(o=>JsonUtility.ToJson(o)).ToArray())+"]}";
        }
    }
}
