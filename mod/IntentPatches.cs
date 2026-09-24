using System;
using System.Linq;
using HarmonyLib;
using RimWorld;
using Verse;
using Verse.AI;

namespace Concord {
    // Harmony patches for native intents, numbered as in docs/SPIKE_NATIVE_HAUL.md.
    // Applied only in the staging lab (see Bootstrap). Each reads cached state only.
    static class IntentHooks {
        // Pawns inside CleanupCurrentJob: placements then are incidental, whatever the job says.
        public static readonly System.Collections.Generic.Dictionary<Pawn,int> cleanup=new System.Collections.Generic.Dictionary<Pawn,int>();
        // The pawn whose carried drop is being placed (hook 4 scope; hook 5 skips inside it).
        public static Pawn placing;
        public static bool InCleanup(Pawn p) {int n;return cleanup.TryGetValue(p,out n)&&n>0;}
        public static bool Colonist(Pawn p) {return p!=null&&p.IsFreeColonist&&p.Spawned;}
        public static bool TaggedHaul(Job j) {return j!=null&&j.def==JobDefOf.HaulToCell;}
    }

    // 1. Admission for storage searches.
    [HarmonyPatch(typeof(StoreUtility),"TryFindBestBetterStoreCellForWorker")]
    static class Patch1_StoreSearch {
        static bool Prefix(Thing t,Pawn carrier,ISlotGroup slotGroup) {
            var sg=slotGroup as SlotGroup;
            var z=sg==null?null:sg.parent as Zone_Stockpile;
            if(z==null) return true;
            var i=IntentState.ForZone(z);
            if(i==null) return true;
            bool carried=carrier!=null&&t!=null&&carrier.carryTracker.CarriedThing==t;
            return IntentState.Admits(i,carrier,carried?t.stackCount:0,carrier==null?null:carrier.CurJob);
        }
    }

    // 2. Commit point for re-targets of a running HaulToCell job. Widest patch: early exit.
    [HarmonyPatch(typeof(Job),nameof(Job.SetTarget))]
    static class Patch2_SetTarget {
        static void Postfix(Job __instance,TargetIndex ind,LocalTargetInfo pack) {
            if(ind!=TargetIndex.B||__instance.def!=JobDefOf.HaulToCell) return;
            var s=IntentState.Get();
            if(s==null||s.intents.Count==0) return;
            Pawn p=null;
            foreach(var m in Find.Maps){p=m.mapPawns.FreeColonistsSpawned.FirstOrDefault(x=>x.CurJob==__instance);if(p!=null)break;}
            if(p==null) return;
            var old=s.Holding(__instance);
            var next=IntentState.ForCell(p.Map,pack.Cell);
            if(old==next) return; // within the zone the reservation stays with the job
            if(old!=null){old.reserved.Remove(__instance.loadID);old.reservedBy.Remove(__instance.loadID);}
            if(next!=null) {
                var carried=p.carryTracker.CarriedThing;
                int want=carried!=null?carried.stackCount:__instance.count;
                s.Reserve(next,p,__instance,Math.Min(want,Math.Max(0,next.Remaining)));
            }
        }
    }

    // 3. Admission for preselected cells: cap fresh pickups. Reserves nothing.
    [HarmonyPatch(typeof(HaulAIUtility),nameof(HaulAIUtility.HaulToCellStorageJob))]
    static class Patch3_HaulJobFactory {
        static void Postfix(Pawn p,Thing t,IntVec3 storeCell,Job __result) {
            if(__result==null) return;
            var i=IntentState.ForCell(p.Map,storeCell);
            if(i==null) return;
            if(IntentState.CarriedFor(p,t)>0) return; // whole carried loads are checked at start, never trimmed
            if(IntentState.Admits(i,p,0,null)&&!IntentState.Get().FaultFor(p))__result.count=Math.Min(__result.count,i.Remaining);
        }
    }

    // 3b. Veto before start, and the reservation commit for the CurJob before any toil runs.
    [HarmonyPatch(typeof(JobDriver_HaulToCell),nameof(JobDriver_HaulToCell.TryMakePreToilReservations))]
    static class Patch3b_PreToil {
        static bool Prefix(JobDriver_HaulToCell __instance,ref bool __result) {
            var p=__instance.pawn;var job=__instance.job;
            var i=IntentState.ForCell(p.Map,job.targetB.Cell);
            if(i==null) return true;
            var s=IntentState.Get();
            // An opportunistic replacement can reach this before any StartJob postfix.
            if(p.CurJob==job)s.ReleaseObsolete(p);
            if(s.FaultFor(p)&&i.Standing(p)) return true;
            int carried=IntentState.CarriedFor(p,job.targetA.Thing);
            bool standing=i.Standing(p);
            int avail=i.Remaining+i.Own(job);
            bool needsPickup=carried>0&&p.carryTracker.CarriedThing!=job.targetA.Thing&&
                p.carryTracker.AvailableStackSpace(job.targetA.Thing.def)>0;
            if(standing&&(carried>0?carried<=avail&&(!needsPickup||avail>carried):avail>=1)) return true;
            i.rejectedStarts++;
            s.Emit(p,"intent-rejected-start","intent="+i.intentId+";job="+job.loadID+";reason="+(standing?"quota":"standing")+";carried="+carried);
            __result=false;
            return false;
        }
        static void Postfix(JobDriver_HaulToCell __instance,bool __result) {
            if(!__result) return;
            var p=__instance.pawn;var job=__instance.job;
            if(p.CurJob!=job) return; // queued/ordered validation never acquires a reservation
            var i=IntentState.ForCell(p.Map,job.targetB.Cell);
            if(i==null) return;
            var s=IntentState.Get();
            int avail=Math.Max(0,i.Remaining+i.Own(job));
            if(s.FaultFor(p)) {
                s.faultSkipNext=false;s.faultPawn=null;
                s.Reserve(i,p,job,Math.Min(avail,job.count));
                s.Emit(p,"lab-fault","intent="+i.intentId+";job="+job.loadID+";admission skipped");
                return;
            }
            int carried=IntentState.CarriedFor(p,job.targetA.Thing);
            if(carried>0) {
                // Reserve the whole carried load plus any admitted additional pickup.
                int pickup=HaulBudget.AdditionalPickup(carried,job.count,avail,
                    p.carryTracker.AvailableStackSpace(job.targetA.Thing.def));
                s.Reserve(i,p,job,carried+pickup);
                job.count=pickup;
            } else {
                int alloc=Math.Min(job.count,avail);
                s.Reserve(i,p,job,alloc);
                job.count=alloc;
            }
        }
    }

    // 4. Wrap placedAction on both carry-tracker drop overloads.
    static class DropWrap {
        public static void Wrap(Pawn_CarryTracker tracker,IntVec3 dropLoc,ThingPlaceMode mode,ref Action<Thing,int> placedAction,out Pawn state) {
            state=IntentHooks.placing;
            var s=IntentState.Get();
            if(s==null||s.intents.Count==0) return;
            var p=tracker.pawn;
            IntentHooks.placing=p;
            var job=p.CurJob;
            Job participation=mode==ThingPlaceMode.Direct&&!IntentHooks.InCleanup(p)&&IntentHooks.TaggedHaul(job)&&
                job.haulMode==HaulMode.ToCellStorage&&job.targetB.Cell==dropLoc?job:null;
            string source=participation!=null?"haul":IntentHooks.InCleanup(p)?"cleanup":mode==ThingPlaceMode.Near?"near":"other";
            var orig=placedAction;
            placedAction=(th,n)=>{if(orig!=null)orig(th,n);s.Placed(p,th,n,participation,source);};
        }
    }
    [HarmonyPatch(typeof(Pawn_CarryTracker),nameof(Pawn_CarryTracker.TryDropCarriedThing),
        new[]{typeof(IntVec3),typeof(ThingPlaceMode),typeof(Thing),typeof(Action<Thing,int>)},
        new[]{ArgumentType.Normal,ArgumentType.Normal,ArgumentType.Out,ArgumentType.Normal})]
    static class Patch4_Drop {
        static void Prefix(Pawn_CarryTracker __instance,IntVec3 dropLoc,ThingPlaceMode mode,ref Action<Thing,int> placedAction,out Pawn __state) {
            DropWrap.Wrap(__instance,dropLoc,mode,ref placedAction,out __state);
        }
        static Exception Finalizer(Exception __exception,Pawn __state) {IntentHooks.placing=__state;return __exception;}
    }
    [HarmonyPatch(typeof(Pawn_CarryTracker),nameof(Pawn_CarryTracker.TryDropCarriedThing),
        new[]{typeof(IntVec3),typeof(int),typeof(ThingPlaceMode),typeof(Thing),typeof(Action<Thing,int>)},
        new[]{ArgumentType.Normal,ArgumentType.Normal,ArgumentType.Normal,ArgumentType.Out,ArgumentType.Normal})]
    static class Patch4_DropCount {
        static void Prefix(Pawn_CarryTracker __instance,IntVec3 dropLoc,ThingPlaceMode mode,ref Action<Thing,int> placedAction,out Pawn __state) {
            DropWrap.Wrap(__instance,dropLoc,mode,ref placedAction,out __state);
        }
        static Exception Finalizer(Exception __exception,Pawn __state) {IntentHooks.placing=__state;return __exception;}
    }

    // 5. Fresh spawns into the tagged zone outside a hook-4 scope. Merges go to reconciliation.
    [HarmonyPatch(typeof(Zone_Stockpile),nameof(Zone_Stockpile.Notify_ReceivedThing))]
    static class Patch5_Received {
        static void Postfix(Zone_Stockpile __instance,Thing newItem) {
            if(IntentHooks.placing!=null) return;
            var s=IntentState.Get();
            if(s==null||s.intents.Count==0) return;
            s.Spawned(__instance,newItem);
        }
    }

    // 6. Ownership check, job events, cleanup classification and release.
    [HarmonyPatch(typeof(Pawn_JobTracker),nameof(Pawn_JobTracker.StartJob))]
    static class Patch6_StartJob {
        static void Postfix(Pawn_JobTracker __instance,Job newJob,Pawn ___pawn) {
            var s=IntentState.Get();
            if(s==null) return;
            if(s.intents.Count>0)s.ReleaseObsolete(___pawn);
            if(__instance.curJob!=newJob||!IntentHooks.Colonist(___pawn)) return;
            var i=IntentHooks.TaggedHaul(newJob)?IntentState.ForCell(___pawn.Map,newJob.targetB.Cell):null;
            s.Emit(___pawn,"job-start",newJob.def.defName+";job="+newJob.loadID+(i!=null?";intent="+i.intentId+";count="+newJob.count:""));
        }
    }
    [HarmonyPatch(typeof(Pawn_JobTracker),"CleanupCurrentJob")]
    static class Patch6_Cleanup {
        static void Prefix(Pawn_JobTracker __instance,JobCondition condition,Pawn ___pawn,out Job __state) {
            __state=__instance.curJob;
            if(__state==null) return;
            int n;IntentHooks.cleanup.TryGetValue(___pawn,out n);IntentHooks.cleanup[___pawn]=n+1;
            var s=IntentState.Get();
            if(s!=null&&IntentHooks.Colonist(___pawn))s.Emit(___pawn,"job-end",__state.def.defName+";job="+__state.loadID+";condition="+condition);
        }
        static Exception Finalizer(Exception __exception,Pawn ___pawn,Job __state) {
            if(__state!=null) {
                int n;
                if(IntentHooks.cleanup.TryGetValue(___pawn,out n)){if(n<=1)IntentHooks.cleanup.Remove(___pawn);else IntentHooks.cleanup[___pawn]=n-1;}
                var s=IntentState.Get();
                if(s!=null)s.Release(__state);
            }
            return __exception;
        }
    }

    // 7. Ingestion with item count and nutrition.
    [HarmonyPatch(typeof(Thing),nameof(Thing.Ingested))]
    static class Patch7_Ingested {
        static void Prefix(Thing __instance,out int __state) {__state=__instance.stackCount;}
        static void Postfix(Thing __instance,Pawn ingester,float __result,int __state) {
            if(!IntentHooks.Colonist(ingester)) return;
            var s=IntentState.Get();
            if(s==null) return;
            int count=__instance.Destroyed?__state:__state-__instance.stackCount;
            s.Emit(ingester,"ingested",__instance.def.defName+";count="+count+";nutrition="+__result.ToString("0.###"),__instance.GetUniqueLoadID());
        }
    }

    // 8. Social interactions between free colonists only.
    [HarmonyPatch(typeof(Pawn_InteractionsTracker),nameof(Pawn_InteractionsTracker.TryInteractWith))]
    static class Patch8_Interaction {
        static void Postfix(Pawn recipient,InteractionDef intDef,bool __result,Pawn ___pawn) {
            if(!__result||!IntentHooks.Colonist(___pawn)||!IntentHooks.Colonist(recipient)) return;
            var s=IntentState.Get();
            if(s!=null)s.Emit(___pawn,"interaction",intDef.defName,recipient.GetUniqueLoadID());
        }
    }
}
