using System;
using System.Collections.Generic;
using System.Linq;
using HarmonyLib;
using RimWorld;
using Verse;
using Verse.AI;

namespace Concord {
    // Construction patch ledger (docs/MIGRATION_PRODUCTION.md, amendment 5). Every patch starts
    // with the static BuildState.Active check (O(1)) before any other work. Per-patch call counts
    // always; wall-clock cost only while a lab measurement enables it (lab-build-cost).
    public static class BuildCost {
        public static readonly string[] Names={"","B1 DeliverToBlueprints.JobOnThing","B2 DeliverToFrames.JobOnThing","B3 IsNewValidNearbyNeeder",
            "B4 FinishFrames.JobOnThing","B5 Pawn_JobTracker.StartJob","B6 Pawn_JobTracker.CleanupCurrentJob","B7 TryGetNextDestinationFromQueue",
            "B8 DepositHauledThingInContainer (wrap)","B9 Blueprint.TryReplaceWithSolidThing","B10 Frame.CompleteConstruction","B11 GenSpawn.Spawn",
            "B12 Frame.FailConstruction","B13 Thing.Destroy"};
        public static bool timing;
        // calls: every entry of the patch's first hook; active: entries that did Concord work after the
        // fast path; micros: every hook body (prefix, postfix, finalizer, wrapper), excluding the
        // native work a wrapper calls (reported separately as nativeMicros). Harmony dispatch itself
        // is not visible from inside a hook; the throughput arm measures the whole.
        public static readonly long[] calls=new long[16],active=new long[16],ticks=new long[16],native=new long[16];
        public static long Start(){return timing?System.Diagnostics.Stopwatch.GetTimestamp():0;}
        public static void Stop(int i,long t0,bool work){calls[i]++;if(work)active[i]++;if(timing)ticks[i]+=System.Diagnostics.Stopwatch.GetTimestamp()-t0;}
        /** A later hook body of the same patch (postfix, finalizer): time only. */
        public static void More(int i,long t0){if(timing)ticks[i]+=System.Diagnostics.Stopwatch.GetTimestamp()-t0;}
        public static void Native(int i,long t0){if(timing){var d=System.Diagnostics.Stopwatch.GetTimestamp()-t0;native[i]+=d;ticks[i]-=d;}}
        public static void Reset(){Array.Clear(calls,0,calls.Length);Array.Clear(active,0,active.Length);Array.Clear(ticks,0,ticks.Length);Array.Clear(native,0,native.Length);}
        public static string Json(){
            var f=1e6/System.Diagnostics.Stopwatch.Frequency;var parts=new List<string>();var inv=System.Globalization.CultureInfo.InvariantCulture;
            for(int i=1;i<Names.Length;i++)parts.Add("{\"patch\":\""+Names[i]+"\",\"calls\":"+calls[i]+",\"active\":"+active[i]+",\"micros\":"+(ticks[i]*f).ToString("0.0",inv)+",\"nativeMicros\":"+(native[i]*f).ToString("0.0",inv)+"}");
            return "{\"timing\":"+(timing?"true":"false")+",\"patches\":["+String.Join(",",parts.ToArray())+"]}";
        }
    }
    static class BuildScan {
        /** Shared by the three scanner filters: excluded pawn, ordinary scan -> no job; a forced scan's
         *  returned job is stamped by identity before admission (amendment 1). */
        public static bool Prefix(Pawn pawn,Thing t,bool forced,ref Job result){
            var i=BuildState.OpenFor(t);if(i==null||forced)return true;
            if(!i.Excluded(BuildState.Id(pawn)))return true;
            result=null;return false;
        }
        public static void Postfix(Pawn pawn,Thing t,bool forced,Job result){
            if(!forced||result==null||BuildState.OpenFor(t)==null)return;
            BuildState.Get().forcedStamps[result.loadID]=Find.TickManager.TicksGame;
        }
    }

    // Scanner filters B1/B2/B4 share one body; "active" means the target is a tagged carrier.
    static class BuildScanPatch {
        public static bool Prefix(int n,Pawn pawn,Thing t,bool forced,ref Job result){
            long c=BuildCost.Start();bool w=BuildState.Active&&BuildState.OpenFor(t)!=null;
            try{return !w||BuildScan.Prefix(pawn,t,forced,ref result);}finally{BuildCost.Stop(n,c,w);}
        }
        public static void Postfix(int n,Pawn pawn,Thing t,bool forced,Job result){
            if(!BuildState.Active||!forced)return;long c=BuildCost.Start();try{BuildScan.Postfix(pawn,t,forced,result);}finally{BuildCost.More(n,c);}
        }
    }
    [HarmonyPatch(typeof(WorkGiver_ConstructDeliverResourcesToBlueprints),nameof(WorkGiver_ConstructDeliverResourcesToBlueprints.JobOnThing))]
    static class BuildPatch1 {
        static bool Prefix(Pawn pawn,Thing t,bool forced,ref Job __result){return BuildScanPatch.Prefix(1,pawn,t,forced,ref __result);}
        static void Postfix(Pawn pawn,Thing t,bool forced,Job __result){BuildScanPatch.Postfix(1,pawn,t,forced,__result);}
    }
    [HarmonyPatch(typeof(WorkGiver_ConstructDeliverResourcesToFrames),nameof(WorkGiver_ConstructDeliverResourcesToFrames.JobOnThing))]
    static class BuildPatch2 {
        static bool Prefix(Pawn pawn,Thing t,bool forced,ref Job __result){return BuildScanPatch.Prefix(2,pawn,t,forced,ref __result);}
        static void Postfix(Pawn pawn,Thing t,bool forced,Job __result){BuildScanPatch.Postfix(2,pawn,t,forced,__result);}
    }
    // The 8-cell nearby-needer extension never carries forced (it calls CanConstruct with false):
    // an excluded pawn's untagged delivery must not fill a tagged site on the side. Evidence event
    // when it filters (case 4).
    [HarmonyPatch(typeof(WorkGiver_ConstructDeliverResources),"IsNewValidNearbyNeeder")]
    static class BuildPatch3 {
        static void Postfix(Thing t,Pawn pawn,ref bool __result){long c=BuildCost.Start();var i=BuildState.Active&&__result?BuildState.OpenFor(t):null;bool w=i!=null;try{
            if(!w||!i.Excluded(BuildState.Id(pawn)))return;
            __result=false;BuildState.Get().Emit(pawn,"build-nearby-filtered","intent="+i.intentId);
        }finally{BuildCost.Stop(3,c,w);}}
    }
    [HarmonyPatch(typeof(WorkGiver_ConstructFinishFrames),nameof(WorkGiver_ConstructFinishFrames.JobOnThing))]
    static class BuildPatch4 {
        static bool Prefix(Pawn pawn,Thing t,bool forced,ref Job __result){return BuildScanPatch.Prefix(4,pawn,t,forced,ref __result);}
        static void Postfix(Pawn pawn,Thing t,bool forced,Job __result){BuildScanPatch.Postfix(4,pawn,t,forced,__result);}
    }
    // P5.2(a): admission for new, queued, resumed candidates. A rejected candidate that is not the
    // current job is disposed without touching unrelated current work.
    [HarmonyPatch(typeof(Pawn_JobTracker),nameof(Pawn_JobTracker.StartJob))]
    static class BuildPatch5 {
        static bool Prefix(Pawn_JobTracker __instance,Job newJob,Pawn ___pawn){long c=BuildCost.Start();bool w=BuildState.Active&&BuildState.BuildJobDef(newJob)&&___pawn!=null;try{
            if(!w)return true;
            var s=BuildState.Get();if(s.Admit(___pawn,newJob,__instance))return true;
            if(__instance.curJob==newJob){__instance.EndCurrentJob(JobCondition.InterruptForced,false);return false;}
            s.DisposeCandidate(___pawn,newJob);return false;
        }finally{BuildCost.Stop(5,c,w);}}
    }
    // C1: work settles at job boundaries (end, interrupt, pause), before the driver is cleared.
    [HarmonyPatch(typeof(Pawn_JobTracker),"CleanupCurrentJob")]
    static class BuildPatch6 {
        static void Prefix(Pawn_JobTracker __instance,Pawn ___pawn){long c=BuildCost.Start();var j=__instance.curJob;var f=BuildState.Active&&j!=null&&j.def==JobDefOf.FinishFrame?j.targetA.Thing as Frame:null;bool w=f!=null&&!f.Destroyed;try{
            if(w)BuildState.Get().Settle(___pawn,j,f,"job end");
        }finally{BuildCost.Stop(6,c,w);}}
    }
    // P5.2(b): a queued destination picked after a consent change.
    [HarmonyPatch(typeof(Toils_Haul),nameof(Toils_Haul.TryGetNextDestinationFromQueue))]
    static class BuildPatch7 {
        static void Postfix(Job job,Pawn actor,ref Thing target,ref bool __result){long c=BuildCost.Start();var i=BuildState.Active&&__result?BuildState.OpenFor(target):null;bool w=i!=null;try{
            if(!w)return;var s=BuildState.Get();
            if(s.Blocked(i,actor,job)){s.Emit(actor,"build-rejected-destination","intent="+i.intentId+";job="+job.loadID);target=null;__result=false;}
        }finally{BuildCost.Stop(7,c,w);}}
    }
    // P2/P5.2(c): the deposit toil is wrapped: consent/generation recheck, then the destination's
    // actual per-def delta, credited once per physical deposit. The native transfer is timed apart.
    [HarmonyPatch(typeof(Toils_Haul),nameof(Toils_Haul.DepositHauledThingInContainer))]
    static class BuildPatch8 {
        static void Postfix(Toil __result,TargetIndex containerInd){
            var toil=__result;var original=toil.initAction;if(original==null)return;
            toil.initAction=()=>{
                if(!BuildState.Active){BuildCost.calls[8]++;original();return;}
                long c=BuildCost.Start();var actor=toil.actor;var job=actor==null?null:actor.CurJob;
                var frame=job!=null?job.GetTarget(containerInd).Thing as Frame:null;
                var i=BuildState.OpenFor(frame);bool w=i!=null;
                try{
                    if(!w){long n0=BuildCost.Start();original();BuildCost.Native(8,n0);return;}
                    var s=BuildState.Get();
                    if(s.Blocked(i,actor,job)){s.Emit(actor,"build-rejected-deposit","intent="+i.intentId+";job="+job.loadID);actor.jobs.EndCurrentJob(JobCondition.Incompletable);return;}
                    var def=actor.carryTracker.CarriedThing==null?null:actor.carryTracker.CarriedThing.def;
                    int before=def==null?0:frame.resourceContainer.TotalStackCountOfDef(def);
                    long n1=BuildCost.Start();original();BuildCost.Native(8,n1);
                    int after=def==null||frame.Destroyed?before:frame.resourceContainer.TotalStackCountOfDef(def);
                    if(def!=null)s.Deposited(actor,job,frame,def,after-before);
                }finally{BuildCost.Stop(8,c,w);}
            };
        }
    }
    // P1/P5.4 conversion: the out createdThing is the successor (amendment 4); the nested blueprint
    // removal is deferred from the removal classifier; the finalizer unwinds on exceptions.
    [HarmonyPatch(typeof(Blueprint),nameof(Blueprint.TryReplaceWithSolidThing))]
    static class BuildPatch9 {
        static bool Prefix(Blueprint __instance,Pawn workerPawn,ref Thing createdThing,ref bool jobEnded,ref bool __result,out BuildTransition __state){
            long c=BuildCost.Start();__state=null;var i=BuildState.Active?BuildState.OpenFor(__instance):null;bool w=i!=null;try{
            if(!w)return true;
            var s=BuildState.Get();
            if(s.Blocked(i,workerPawn,workerPawn==null?null:workerPawn.CurJob)){createdThing=null;jobEnded=false;__result=false;return false;}
            __state=new BuildTransition{intent=i,predecessor=__instance.thingIDNumber,map=__instance.Map,kind="convert"};
            BuildState.transition=__state;return true;
        }finally{BuildCost.Stop(9,c,w);}}
        static void Postfix(bool __result,ref Thing createdThing,BuildTransition __state){
            if(__state==null)return;long c=BuildCost.Start();try{
            var i=__state.intent;var s=BuildState.Get();__state.committed=true;
            var ok=__result&&createdThing is Frame&&createdThing.Spawned&&createdThing.Map==__state.map&&createdThing.Position==new IntVec3(i.x,0,i.z)&&createdThing.Rotation.AsInt==i.rot&&createdThing.def.entityDefToBuild==i.Def;
            if(ok)s.Move(i,createdThing,"frame");
            else if(__state.predecessorRemoved)s.End(i,"failed","successor not observed");
            else s.Record(i,new BuildRecord{kind="note",text="conversion did not happen; blueprint still in place"});
            }finally{BuildCost.More(9,c);}
        }
        static Exception Finalizer(Exception __exception,BuildTransition __state){
            if(__state!=null){long c=BuildCost.Start();BuildState.transition=null;if(__exception!=null&&!__state.committed&&__state.predecessorRemoved)BuildState.Get().End(__state.intent,"failed","conversion error");BuildCost.More(9,c);}
            return __exception;
        }
    }
    // Completion: settle the finisher's work first (the tick adds its increment before calling this),
    // then require exactly one qualified spawned successor from the scoped spawn collector.
    [HarmonyPatch(typeof(Frame),nameof(Frame.CompleteConstruction))]
    static class BuildPatch10 {
        static void Prefix(Frame __instance,Pawn worker,out BuildTransition __state){long c=BuildCost.Start();__state=null;var i=BuildState.Active?BuildState.OpenFor(__instance):null;bool w=i!=null;try{
            if(!w)return;
            var s=BuildState.Get();if(worker!=null)s.Settle(worker,worker.CurJob,__instance,"completion");
            i.finalWork=__instance.workDone;
            __state=new BuildTransition{intent=i,predecessor=__instance.thingIDNumber,map=__instance.Map,expected=__instance.def.entityDefToBuild as ThingDef,kind="complete"};
            BuildState.transition=__state;
        }finally{BuildCost.Stop(10,c,w);}}
        static void Postfix(Pawn worker,BuildTransition __state){
            if(__state==null)return;long c=BuildCost.Start();try{
            var i=__state.intent;var s=BuildState.Get();__state.committed=true;
            var qualified=__state.spawned.Distinct().Where(t=>t.Spawned).ToList();
            // Lab faults (scripted case 14 only): an absent or ambiguous successor.
            if(BuildState.TakeFault("successor-absent"))qualified.Clear();
            if(BuildState.TakeFault("successor-ambiguous")&&worker!=null)qualified.Add(worker);
            if(__state.predecessorRemoved&&qualified.Count==1){s.Move(i,qualified[0],"built");i.finisher=BuildState.Id(worker);
                s.Record(i,new BuildRecord{kind="finish",pawn=i.finisher,occurrence="finish:"+i.generation});s.End(i,"built",null,worker);}
            else if(__state.predecessorRemoved)s.End(i,"failed","successor not observed ("+qualified.Count+" candidates)");
            else s.Record(i,new BuildRecord{kind="note",text="completion returned without removing the frame"});
            }finally{BuildCost.More(10,c);}
        }
        static Exception Finalizer(Exception __exception,BuildTransition __state){
            if(__state!=null){long c=BuildCost.Start();BuildState.transition=null;if(__exception!=null&&!__state.committed&&__state.predecessorRemoved)BuildState.Get().End(__state.intent,"failed","completion error");BuildCost.More(10,c);}
            return __exception;
        }
    }
    // The main Spawn overload every other overload forwards to. Works only inside a completion
    // scope (successor collection) or while a player removal is pending (replacement attribution).
    [HarmonyPatch(typeof(GenSpawn),nameof(GenSpawn.Spawn),new[]{typeof(Thing),typeof(IntVec3),typeof(Map),typeof(Rot4),typeof(WipeMode),typeof(bool),typeof(bool)})]
    static class BuildPatch11 {
        static void Postfix(Thing __result,IntVec3 loc,Map map){var t=BuildState.transition;var pend=BuildState.pending;bool w=t!=null&&t.kind=="complete"||pend!=null;if(!w){BuildCost.calls[11]++;return;}
            long c=BuildCost.Start();try{
            if(__result==null)return;
            if(pend!=null&&__result is Blueprint&&BuildState.Get().Overlaps(pend,__result,map)){BuildState.Get().ResolvePending(true);return;}
            if(t==null||t.kind!="complete"||map!=t.map||__result.def!=t.expected)return;
            var i=t.intent;if(loc!=new IntVec3(i.x,0,i.z)||__result.Rotation.AsInt!=i.rot)return;
            if(!t.spawned.Contains(__result))t.spawned.Add(__result);
            if(BuildState.TakeFault("completion-exception"))throw new Exception("Concord lab fault: exception inside completion");
        }finally{BuildCost.Stop(11,c,w);}}
    }
    // Failure: settle the failing worker (the roll precedes that tick's increment), record what the
    // frame held; the nested destroy and the fresh ordinary blueprint join the single failed record.
    [HarmonyPatch(typeof(Frame),nameof(Frame.FailConstruction))]
    static class BuildPatch12 {
        static void Prefix(Frame __instance,Pawn worker,out BuildTransition __state){long c=BuildCost.Start();__state=null;var i=BuildState.Active?BuildState.OpenFor(__instance):null;bool w=i!=null;try{
            if(!w)return;
            var s=BuildState.Get();if(worker!=null)s.Settle(worker,worker.CurJob,__instance,"failure");
            i.finalWork=__instance.workDone;i.held=BuildState.Held(__instance);
            __state=new BuildTransition{intent=i,predecessor=__instance.thingIDNumber,map=__instance.Map,kind="fail"};
            BuildState.transition=__state;
        }finally{BuildCost.Stop(12,c,w);}}
        static void Postfix(Pawn worker,BuildTransition __state){
            if(__state==null)return;long c=BuildCost.Start();__state.committed=true;
            BuildState.Get().End(__state.intent,"failed","construction failed; held "+(String.IsNullOrEmpty(__state.intent.held)?"nothing":__state.intent.held)+"; returned: not recorded",worker);
            BuildCost.More(12,c);
        }
        static Exception Finalizer(Exception __exception,BuildTransition __state){
            if(__state!=null){long c=BuildCost.Start();BuildState.transition=null;if(__exception!=null&&!__state.committed)BuildState.Get().End(__state.intent,"failed","failure error");BuildCost.More(12,c);}
            return __exception;
        }
    }
    // Removal classifier for tagged carriers and watched buildings; O(1) dictionary lookup first.
    [HarmonyPatch(typeof(Thing),nameof(Thing.Destroy))]
    static class BuildPatch13 {
        static void Prefix(Thing __instance,DestroyMode mode){long c=BuildCost.Start();bool w=BuildState.Active&&BuildState.byThing.ContainsKey(__instance.thingIDNumber);try{
            if(!w||__instance.Destroyed)return;BuildState.Get().Removed(__instance,mode);
        }finally{BuildCost.Stop(13,c,w);}}
    }
}
