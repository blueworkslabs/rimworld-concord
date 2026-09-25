using System;
using System.Collections.Generic;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;
using Verse.AI;

namespace Concord {
    [Serializable] public class RescueOption {
        public string kind="rescue",target,bed;
        public int x,z,maxTicks=1800;
    }
    [Serializable] public class RescueObservation { public string target,targetName,bed,bedLabel; }
    public static class Rescue {
        public static bool Ready(Pawn p) {
            return Movement.Available(p)&&!p.WorkTagIsDisabled(WorkTags.Caring)&&
                p.health.capacities.CapableOf(PawnCapacityDefOf.Manipulation)&&
                (p.needs.food==null||p.needs.food.CurLevelPercentage>=0.35f)&&
                (p.needs.rest==null||p.needs.rest.CurLevelPercentage>=0.35f);
        }
        public static bool Patient(Pawn p,Pawn t) {
            return t!=null&&t!=p&&!t.Dead&&t.Downed&&t.Faction==p.Faction&&t.IsColonist&&
                !t.IsPrisoner&&!t.IsSlave&&!t.ageTracker.CurLifeStage.alwaysDowned&&
                t.MapHeld==p.Map&&!t.InBed()&&!t.IsForbidden(p);
        }
        // Single medical beds only: no ownership reassignment, guest conversion or capture.
        public static bool Bed(Pawn p,Pawn t,Building_Bed b) {
            return b!=null&&b.Spawned&&b.Map==p.Map&&b.Faction==p.Faction&&b.Medical&&
                b.SleepingSlotsCount==1&&!b.ForPrisoners&&!b.ForSlaves&&!b.IsForbidden(p)&&
                !b.Position.Fogged(p.Map)&&RestUtility.CanUseBedNow(b,t,true)&&
                b.GetCurOccupant(0)==null&&p.CanReach(b,PathEndMode.OnCell,Danger.None);
        }
        public static bool Valid(Pawn p,Pawn t,Building_Bed b,bool handover=false) {
            // handover: read-only offerability while a tagged trip is still carrying; execution
            // (Valid without handover) always requires empty hands.
            return (handover||Ready(p))&&Patient(p,t)&&t.Spawned&&!t.Position.Fogged(p.Map)&&
                (handover||p.carryTracker.CarriedThing==null)&&Bed(p,t,b)&&p.CanReserve(t)&&p.CanReserve(b,1,0)&&
                p.CanReach(t,PathEndMode.ClosestTouch,Danger.None);
        }
        public static string Options(Pawn p,string epoch,bool handover=false) {
            var options=new List<RescueOption>();var observations=new List<RescueObservation>();
            if(handover||Ready(p)) {
                var targets=new List<Pawn>();var beds=new List<Building_Bed>();
                // A bounded visible square, not the global pawn/bed registry.
                var cells=new List<IntVec3>();
                for(int dx=-12;dx<=12;dx++)for(int dz=-12;dz<=12;dz++) {
                    var c=p.Position+new IntVec3(dx,0,dz);
                    if(c.InBounds(p.Map)&&!c.Fogged(p.Map)&&GenSight.LineOfSight(p.Position,c,p.Map))cells.Add(c);
                }
                foreach(var c in cells.OrderBy(c=>(c-p.Position).LengthHorizontalSquared).ThenBy(c=>c.x).ThenBy(c=>c.z))
                    foreach(var thing in c.GetThingList(p.Map)) {
                        var t=thing as Pawn;var b=thing as Building_Bed;
                        if(t!=null&&targets.Count<8&&Patient(p,t))targets.Add(t);
                        if(b!=null&&beds.Count<12&&!beds.Contains(b))beds.Add(b);
                    }
                foreach(var t in targets)foreach(var b in beds)if(options.Count<6&&Valid(p,t,b,handover)) {
                    options.Add(new RescueOption {target=t.GetUniqueLoadID(),bed=b.GetUniqueLoadID(),x=b.Position.x,z=b.Position.z});
                    observations.Add(new RescueObservation {target=t.GetUniqueLoadID(),targetName=t.LabelShort,bed=b.GetUniqueLoadID(),bedLabel=b.LabelNoCount});
                }
            }
            return "{\"epoch\":\""+epoch+"\",\"tick\":"+Find.TickManager.TicksGame+",\"mapId\":"+p.Map.uniqueID+",\"status\":\""+(Ready(p)?"available":"unavailable")+"\",\"options\":["+
                String.Join(",",options.Select(o=>JsonUtility.ToJson(o)).ToArray())+"],\"observations\":["+
                String.Join(",",observations.Select(o=>JsonUtility.ToJson(o)).ToArray())+"]}";
        }
    }
    public class JobDriver_ConcordRescue : JobDriver {
        private Pawn Patient {get{return job.targetA.Thing as Pawn;}}
        private Building_Bed Bed {get{return job.targetB.Thing as Building_Bed;}}
        private ActionRecord Record {get{return Current.Game.GetComponent<WorldState>().actions.FirstOrDefault(a=>a.jobId==job.loadID&&a.actor==pawn.GetUniqueLoadID());}}
        public override bool TryMakePreToilReservations(bool errorOnFailed) {
            return pawn.Reserve(job.targetA,job,1,-1,null,errorOnFailed)&&pawn.Reserve(job.targetB,job,1,0,null,errorOnFailed);
        }
        protected override IEnumerable<Toil> MakeNewToils() {
            this.FailOnDestroyedOrNull(TargetIndex.A);this.FailOnDestroyedOrNull(TargetIndex.B);
            this.FailOnForbidden(TargetIndex.A);this.FailOnForbidden(TargetIndex.B);
            this.FailOn(()=>!Rescue.Ready(pawn)||!Rescue.Patient(pawn,Patient)||!Rescue.Bed(pawn,Patient,Bed)||
                Bed.Position!=new IntVec3(Record==null?-1:Record.x,0,Record==null?-1:Record.z)||
                (Record!=null&&(Record.status!="started"||Find.TickManager.TicksGame>=Record.untilTick)));
            AddFinishAction(condition=>{
                // Interruption returns the casualty to the world at the carrier's position.
                // Never teleport back, silently switch beds, or count this as a rescue.
                if(pawn.carryTracker.CarriedThing==Patient) {
                    Thing dropped;pawn.carryTracker.TryDropCarriedThing(pawn.Position,ThingPlaceMode.Direct,out dropped);
                }
            });
            yield return Toils_Goto.GotoThing(TargetIndex.A,PathEndMode.ClosestTouch).FailOnDespawnedNullOrForbidden(TargetIndex.A);
            yield return Toils_Haul.StartCarryThing(TargetIndex.A);
            yield return Toils_Goto.GotoThing(TargetIndex.B,PathEndMode.Touch).FailOn(()=>pawn.carryTracker.CarriedThing!=Patient);
            var drop=ToilMaker.MakeToil("ConcordRescueExactBed");drop.defaultCompleteMode=ToilCompleteMode.Instant;
            drop.initAction=()=>{
                var r=Record;var t=Patient;var b=Bed;
                if(r==null||r.status!="started"||!Rescue.Ready(pawn)||!Rescue.Patient(pawn,t)||!Rescue.Bed(pawn,t,b)||
                    b.Position!=new IntVec3(r.x,0,r.z)||pawn.carryTracker.CarriedThing!=t||Find.TickManager.TicksGame>=r.untilTick) {
                    if(r!=null&&r.status=="started"){r.status="failed";r.reason="Agreed patient or bed no longer usable";}
                    EndJobWith(JobCondition.Incompletable);return;
                }
                pawn.Map.reservationManager.Release(job.targetB,pawn,job);
                RestUtility.TuckIntoBed(b,pawn,t,true);
                bool delivered=t.Spawned&&!t.Dead&&t.CurrentBed()==b&&b.GetCurOccupant(0)==t&&pawn.carryTracker.CarriedThing!=t;
                r.delivered=delivered?1:0;r.status=delivered?"completed":"failed";
                r.reason=delivered?"Delivered agreed casualty to agreed medical bed; treatment not implied":"Exact bed placement failed; no rerouting";
            };
            yield return drop;
        }
    }
}
