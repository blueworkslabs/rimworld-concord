using System;
using System.Collections.Generic;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;
using Verse.AI;

namespace Concord {
    [Serializable] public class HaulOption {
        public string kind="haul",thing;
        public int x,z,count,trips=1,maxTicks=1800;
    }
    public static class Hauling {
        public static bool Ready(Pawn p) {
            return Movement.Available(p) && !p.WorkTagIsDisabled(WorkTags.Hauling) &&
                p.health.capacities.CapableOf(PawnCapacityDefOf.Manipulation) &&
                (p.needs.food==null || p.needs.food.CurLevelPercentage>=0.35f) &&
                (p.needs.rest==null || p.needs.rest.CurLevelPercentage>=0.35f);
        }
        public static bool Destination(Pawn p,Thing t,IntVec3 cell,int count) {
            if(!cell.InBounds(p.Map)||cell.Fogged(p.Map)||!cell.IsValidStorageFor(p.Map,t) ||
               !StoreUtility.IsGoodStoreCell(cell,p.Map,t,p,p.Faction)) return false;
            var stack=cell.GetThingList(p.Map).FirstOrDefault(x=>x.def.category==ThingCategory.Item);
            return stack==null ? count<=t.def.stackLimit : stack.CanStackWith(t)&&stack.stackCount+count<=stack.def.stackLimit;
        }
        public static bool Valid(Pawn p,Thing t,IntVec3 cell,int count) {
            return Ready(p)&&t!=null&&t.Spawned&&t.Map==p.Map&&t.def.EverHaulable&&
                !t.IsForbidden(p)&&!t.Position.Fogged(p.Map)&&t.Position!=cell&&count>=1&&count<=25&&t.stackCount>=count&&
                Destination(p,t,cell,count)&&p.CanReserve(t,1,count)&&p.carryTracker.MaxStackSpaceEver(t.def)>=count&&
                p.CanReach(t,PathEndMode.ClosestTouch,Danger.None)&&p.CanReach(cell,PathEndMode.OnCell,Danger.None);
        }
        public static string Options(Pawn p,string epoch) {
            var options=new List<HaulOption>();
            if(Ready(p)) {
                // Local visible square only, bounded scans; never expose the full item registry.
                var cells=new List<IntVec3>();
                for(int dx=-6;dx<=6;dx++)for(int dz=-6;dz<=6;dz++) {
                    var c=p.Position+new IntVec3(dx,0,dz);
                    if(c.InBounds(p.Map)&&!c.Fogged(p.Map)&&GenSight.LineOfSight(p.Position,c,p.Map))cells.Add(c);
                }
                int candidates=0;
                foreach(var cell in cells)foreach(var t in cell.GetThingList(p.Map).ToArray()) {
                    if(options.Count>=6||candidates>=24)break;
                    if(!t.def.EverHaulable||t.def.category!=ThingCategory.Item)continue;
                    // Already correctly stored goods are not proposed for needless shuffling.
                    if(t.Position.IsValidStorageFor(p.Map,t))continue;
                    candidates++;
                    int count=Math.Min(10,t.stackCount);
                    foreach(var dest in cells)if(Valid(p,t,dest,count)) {
                        options.Add(new HaulOption {thing=t.GetUniqueLoadID(),x=dest.x,z=dest.z,count=count});break;
                    }
                }
            }
            return "{\"epoch\":\""+epoch+"\",\"tick\":"+Find.TickManager.TicksGame+",\"status\":\""+(Ready(p)?"available":"unavailable")+"\",\"options\":["+
                String.Join(",",options.Select(o=>JsonUtility.ToJson(o)).ToArray())+"]}";
        }
    }
    // Native reservations, movement and carrying. No opportunistic extra stacks or
    // alternate destination: the final drop is tied to the pawn's accepted cell.
    public class JobDriver_ConcordHaul : JobDriver {
        public override bool TryMakePreToilReservations(bool errorOnFailed) {
            return pawn.Reserve(job.targetA,job,1,job.count,null,errorOnFailed)&&pawn.Reserve(job.targetB,job,1,-1,null,errorOnFailed);
        }
        protected override IEnumerable<Toil> MakeNewToils() {
            this.FailOnDestroyedOrNull(TargetIndex.A);
            this.FailOnForbidden(TargetIndex.A);
            this.FailOnForbidden(TargetIndex.B);
            yield return Toils_Goto.GotoThing(TargetIndex.A,PathEndMode.ClosestTouch);
            yield return Toils_Haul.StartCarryThing(TargetIndex.A,false,false,true);
            yield return Toils_Haul.CarryHauledThingToCell(TargetIndex.B);
            var drop=ToilMaker.MakeToil("ConcordExactDrop");
            drop.defaultCompleteMode=ToilCompleteMode.Instant;
            drop.initAction=()=>{
                var record=Current.Game.GetComponent<WorldState>().actions.FirstOrDefault(a=>a.jobId==job.loadID&&a.actor==pawn.GetUniqueLoadID());
                var carried=pawn.carryTracker.CarriedThing;
                // IsGoodStoreCell checks for NEW reservations. Release our own cell
                // reservation immediately before this synchronous validate-and-drop.
                pawn.Map.reservationManager.Release(job.targetB,pawn,job);
                if(record==null||record.status!="started"||carried==null||carried.stackCount!=record.count||
                   !Hauling.Ready(pawn)||Find.TickManager.TicksGame>=record.untilTick||!Hauling.Destination(pawn,carried,job.targetB.Cell,record.count)) {
                    if(record!=null&&record.status=="started") {record.status="failed";record.reason="Exact drop revalidation failed";}
                    EndJobWith(JobCondition.Incompletable);return;
                }
                Thing placed;
                int delivered=0;
                bool ok=pawn.carryTracker.TryDropCarriedThing(job.targetB.Cell,ThingPlaceMode.Direct,out placed,(thing,count)=>{delivered+=count;});
                record.delivered=delivered;
                record.status=ok&&delivered==record.count?"completed":"failed";
                record.reason=record.status=="completed"?"Delivered agreed quantity to agreed storage cell":"Exact drop failed or partial; no rerouting";
            };
            yield return drop;
        }
    }
}
