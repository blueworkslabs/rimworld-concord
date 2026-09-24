using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;
using Verse.AI;

namespace Concord
{
    [Serializable] public class ActionRecord : IExposable
    {
        public string id, actor, status, reason, kind, thing, target, bed, project, stage, failureCode;
        public int x, z, jobId, count, delivered, untilTick, validatedTick;
        public void ExposeData() {
            Scribe_Values.Look(ref failureCode,"failureCode");Scribe_Values.Look(ref validatedTick,"validatedTick");
            Scribe_Values.Look(ref project,"project");Scribe_Values.Look(ref stage,"stage");
            Scribe_Values.Look(ref target,"target"); Scribe_Values.Look(ref bed,"bed");
            Scribe_Values.Look(ref kind,"kind"); Scribe_Values.Look(ref thing,"thing");
            Scribe_Values.Look(ref count,"count"); Scribe_Values.Look(ref delivered,"delivered"); Scribe_Values.Look(ref untilTick,"untilTick");
            Scribe_Values.Look(ref id,"id"); Scribe_Values.Look(ref actor,"actor");
            Scribe_Values.Look(ref status,"status"); Scribe_Values.Look(ref reason,"reason");
            Scribe_Values.Look(ref x,"x"); Scribe_Values.Look(ref z,"z"); Scribe_Values.Look(ref jobId,"jobId");
        }
    }
    public class WorldState : GameComponent
    {
        public string world = Guid.NewGuid().ToString("N");
        // Intentionally NOT serialized: all delayed commands from before a load become stale.
        public readonly string epoch = Guid.NewGuid().ToString("N");
        public List<ActionRecord> actions = new List<ActionRecord>();
        public List<NativeEvent> events = new List<NativeEvent>();
        public int eventSeq;
        public string crewJson;
        public CrewReport crewReport;
        public float crewReceived=-1000f;
        public List<CasualtyNotice> casualtyNotices=new List<CasualtyNotice>();
        public List<CasualtyNotice> recoveryWatches=new List<CasualtyNotice>();
        private readonly Dictionary<string,Sample> samples=new Dictionary<string,Sample>();
        public readonly Dictionary<string,Thinking> thinking=new Dictionary<string,Thinking>();
        public WorldState(Game game) { }
        public override void ExposeData() {
            Scribe_Values.Look(ref world,"concordWorld");
            // Scribe's string loading interprets escapes; encode opaque JSON so it
            // survives independently of a coordinator republishing after load.
            string encoded=Scribe.mode==LoadSaveMode.Saving&&crewJson!=null?Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(crewJson)):null;
            Scribe_Values.Look(ref encoded,"concordCrewLogEncoded");
            if(Scribe.mode==LoadSaveMode.LoadingVars){
                try{crewJson=String.IsNullOrEmpty(encoded)?null:System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(encoded));}
                catch{crewJson=null;Log.Warning("[Concord] Saved crew report unavailable");}
            }
            if(Scribe.mode==LoadSaveMode.PostLoadInit){crewReport=null;crewReceived=-1000f;}
            Scribe_Collections.Look(ref actions,"concordActions",LookMode.Deep);
            if(actions==null) actions=new List<ActionRecord>();
            Scribe_Collections.Look(ref events,"concordEvents",LookMode.Deep);
            Scribe_Values.Look(ref eventSeq,"concordEventSeq");
            Scribe_Collections.Look(ref casualtyNotices,"concordCasualtyNotices",LookMode.Deep);
            if(casualtyNotices==null)casualtyNotices=new List<CasualtyNotice>();
            Scribe_Collections.Look(ref recoveryWatches,"concordRecoveryWatches",LookMode.Deep);
            if(recoveryWatches==null)recoveryWatches=new List<CasualtyNotice>();
            if(events==null) events=new List<NativeEvent>();
        }
        // Action ownership is independent of the operator's selected/viewed map.
        public static Pawn FindActor(string id) {
            return Find.Maps.SelectMany(m=>m.mapPawns.FreeColonistsSpawned).FirstOrDefault(p=>p.GetUniqueLoadID()==id);
        }
        public void Reconcile() {
            foreach(var a in actions.Where(a=>a.status=="started")) {
                var pawn=FindActor(a.actor);
                if(pawn==null || pawn.Dead || pawn.Downed) { a.status="interrupted"; a.reason="Pawn unavailable"; }
                else if((a.kind??"move")=="move" && pawn.Position==new IntVec3(a.x,0,a.z)) { a.status="completed"; a.reason="Reached destination"; }
                else if((a.kind=="haul"||a.kind=="rescue"||a.kind=="build"||a.kind=="cook"||a.kind=="eat") && (!(a.kind=="eat"?Eating.Ready(pawn):a.kind=="rescue"?Rescue.Ready(pawn):a.kind=="build"||a.kind=="cook"?Production.Ready(pawn,a.kind):Hauling.Ready(pawn))||Find.TickManager.TicksGame>=a.untilTick)) {
                    a.status="interrupted";a.reason="Needs, availability or agreed deadline require stopping";
                    if(pawn.CurJob!=null&&pawn.CurJob.loadID==a.jobId)pawn.jobs.EndCurrentJob(JobCondition.InterruptForced);
                }
                else if(a.kind=="build"&&a.stage=="materials-ready") {Production.ContinueBuild(pawn,a);}
                else if(pawn.CurJob==null || pawn.CurJob.loadID!=a.jobId) { a.status="interrupted"; a.reason="Native job changed"; }
                if(a.status!="started")Production.Cleanup(a);
            }
        }
        public void Emit(string pawn,string kind,string detail,string subject="") {
            events.Add(new NativeEvent {seq=++eventSeq,tick=Find.TickManager.TicksGame,pawn=pawn,kind=kind,detail=detail,subject=subject});
            if(events.Count>256) events.RemoveAt(0);
        }
        public void Observe() {
            if(Find.CurrentMap==null) return;
            foreach(var p in Find.CurrentMap.mapPawns.FreeColonistsSpawned) {
                var id=p.GetUniqueLoadID(); var now=Awareness.Read(p); Sample old;
                foreach(var target in Casualties.Visible(p)) {
                    var tid=target.GetUniqueLoadID();
                    // A remembered local downed observation is not a diagnosis.
                    // Leaving view or reaching a bed is NOT observed recovery.
                    var watch=recoveryWatches.FirstOrDefault(n=>n.observer==id&&n.target==tid);
                    if(target.Dead){if(watch!=null)recoveryWatches.Remove(watch);}
                    else if(target.Downed&&!target.ageTracker.CurLifeStage.alwaysDowned){
                        if(watch==null){
                            recoveryWatches.Add(new CasualtyNotice {observer=id,target=tid});
                            if(recoveryWatches.Count>128)recoveryWatches.RemoveAt(0);
                        }
                    }else if(!target.Downed&&watch!=null){
                        Emit(id,"casualty-recovered","Locally observed previously downed colonist no longer downed; cause unknown",tid);
                        recoveryWatches.Remove(watch);
                    }
                    var known=casualtyNotices.FirstOrDefault(n=>n.observer==id&&n.target==tid);
                    if(Casualties.NeedsHelp(target)) {
                        if(known==null) {
                            casualtyNotices.Add(new CasualtyNotice {observer=id,target=tid});
                            Emit(id,"casualty","Locally observed downed colonist "+target.LabelShort+" at "+target.Position.x+","+target.Position.z+"; cause and urgency unknown",tid);
                        }
                    }else if(known!=null)casualtyNotices.Remove(known);
                }
                if(samples.TryGetValue(id,out old)) {
                    if(now.job!=old.job) Emit(id,"job",now.job);
                    if(now.health!=old.health) Emit(id,"health",now.health.ToString());
                    if(now.food!=old.food) Emit(id,"food",now.food.ToString());
                    if(now.rest!=old.rest) Emit(id,"rest",now.rest.ToString());
                    if(now.mood!=old.mood) Emit(id,"mood",now.mood.ToString());
                    foreach(var m in now.memories) if(!old.memories.Contains(m)) Emit(id,"memory",m.def.defName);
                }
                samples[id]=now;
            }
        }
        public override void GameComponentTick() { if(Find.TickManager.TicksGame%30==0) {Reconcile(); Observe();} }
        public override void GameComponentOnGUI() {
            if(Find.CurrentMap==null || RimWorld.Planet.WorldRendererUtility.WorldRendered) return;
            foreach(var p in Find.CurrentMap.mapPawns.FreeColonistsSpawned) {
                Thinking t;
                if(!thinking.TryGetValue(p.GetUniqueLoadID(),out t) || Time.realtimeSinceStartup>=t.until) continue;
                var pos=UI.MapToUIPosition(p.DrawPos);
                var rect=new Rect(pos.x-14,pos.y-48,28,22);
                Widgets.DrawBoxSolid(rect,new Color(0.1f,0.3f,0.5f,0.95f));
                Widgets.Label(rect," ...");
                TooltipHandler.TipRegion(rect,DecisionPauses.Count>0?"Considering a proposal. Decision testing pause active.":"Considering a proposal. Native behavior continues.");
            }
        }
    }
    [Serializable] public class Request { public string id,actionId,op,epoch,actor,activityId,leaseId,thing,target,bed,cancelKind,crewJson,intentId,variant,reason; public int x,z,w,h,quota,ttlMs,count,meals,maxTicks,untilTick; public int mapId=-1; }
    [Serializable] public class Response { public string id,error; public bool ok; }
    [Serializable] public class PawnView { public string id,name,job,currentBed,carrying; public int x,z; public float health; public bool workReady,rescueReady,buildReady,cookReady,downed,haulingCapable; }
    [Serializable] public class Snapshot { public string world,epoch; public int ticks,decisionPauses; public bool loaded,paused,manualPaused; }

    [StaticConstructorOnStartup]
    public static class Bootstrap
    {
        public static HarmonyLib.Harmony harmony;
        static Bootstrap() {
            if(!GenCommandLine.CommandLineArgPassed("rimworld-lab") ||
               String.IsNullOrEmpty(Environment.GetEnvironmentVariable("RIMWORLD_LAB_ROOT")) ||
               GenFilePaths.SaveDataFolderPath!=Path.Combine(Environment.GetEnvironmentVariable("RIMWORLD_LAB_ROOT"),"profile")) return;
            // Native-intent patches (docs/SPIKE_NATIVE_HAUL.md); Harmony comes from brrainz.harmony, never bundled.
            harmony=new HarmonyLib.Harmony("blueworkslabs.concord");harmony.PatchAll(typeof(Bootstrap).Assembly);
            var o=new GameObject("ConcordBridge"); UnityEngine.Object.DontDestroyOnLoad(o); o.AddComponent<Pump>();
        }
    }
    public class Pump : MonoBehaviour
    {
        private static readonly string Root=Path.Combine(Environment.GetEnvironmentVariable("RIMWORLD_LAB_ROOT"),"concord");
        private float next;
        public void Start() { Directory.CreateDirectory(Root); }
        private static void Atomic(string path,string text) {
            File.WriteAllText(path+".tmp",text);
            if(File.Exists(path)) File.Replace(path+".tmp",path,null); else File.Move(path+".tmp",path);
        }
        private static WorldState World() {
            if(Current.Game==null || Find.CurrentMap==null) throw new Exception("No loaded game");
            return Current.Game.GetComponent<WorldState>();
        }
        private static string StateJson() {
            if(Current.Game==null || Find.CurrentMap==null) return "{\"loaded\":false,\"pawns\":[],\"actions\":[]}";
            var w=World(); w.Reconcile(); w.Observe();
            var snapshot=new Snapshot {world=w.world,epoch=w.epoch,ticks=Find.TickManager.TicksGame,loaded=true,paused=Find.TickManager.Paused,manualPaused=Find.TickManager.CurTimeSpeed==TimeSpeed.Paused,decisionPauses=DecisionPauses.Count};
            var pawns=Find.CurrentMap.mapPawns.FreeColonistsSpawned.Select(p=>JsonUtility.ToJson(new PawnView {
                id=p.GetUniqueLoadID(),name=p.LabelShort,job=p.CurJobDef==null?"":p.CurJobDef.defName,
                x=p.Position.x,z=p.Position.z,health=p.health.summaryHealth.SummaryHealthPercent,workReady=Hauling.Ready(p),haulingCapable=!p.WorkTypeIsDisabled(WorkTypeDefOf.Hauling),buildReady=Production.Ready(p,"build"),cookReady=Production.Ready(p,"cook"),rescueReady=Rescue.Ready(p),downed=p.Downed,currentBed=p.CurrentBed()==null?"":p.CurrentBed().GetUniqueLoadID(),carrying=p.carryTracker.CarriedThing==null?"":p.carryTracker.CarriedThing.GetUniqueLoadID()
            }).TrimEnd('}')+",\"eating\":"+Eating.Options(p,w.epoch)+",\"foodObservation\":"+FoodObservation.Json(p,w.epoch)+",\"production\":"+Production.Options(p,w.epoch)+",\"linkStatus\":"+LinkTelemetry.Json(p,w.epoch)+",\"facts\":"+Awareness.Facts(p)+",\"movement\":"+Movement.Options(p,w.epoch)+",\"hauling\":"+Hauling.Options(p,w.epoch)+",\"rescue\":"+Rescue.Options(p,w.epoch)+",\"casualties\":"+Casualties.View(p,w.epoch)+"}");
            return JsonUtility.ToJson(snapshot).TrimEnd('}')+",\"pawns\":["+String.Join(",",pawns.ToArray())+"],\"actions\":["+
                String.Join(",",w.actions.Select(a=>JsonUtility.ToJson(a)).ToArray())+"],\"eventSeq\":"+w.eventSeq+",\"events\":["+
                String.Join(",",w.events.Select(e=>JsonUtility.ToJson(e)).ToArray())+"],\"intents\":"+IntentState.Get().Json()+",\"crewLog\":"+CrewLog.Json(w)+"}";
        }
        private static ActionRecord Move(Request r) {
            var w=World();
            if(r.epoch!=w.epoch) throw new Exception("Stale timeline");
            Guid parsed;
            if(!Guid.TryParse(r.actionId,out parsed)) throw new Exception("Action ID must be UUID");
            var pawn=Find.CurrentMap.mapPawns.FreeColonistsSpawned.FirstOrDefault(p=>p.GetUniqueLoadID()==r.actor);
            w.Reconcile();
            var prior=w.actions.FirstOrDefault(a=>a.id==r.actionId);
            if(prior!=null) {
                if(prior.actor!=r.actor || prior.x!=r.x || prior.z!=r.z || (prior.kind??"move")!=r.op || ((r.op=="haul"||r.op=="build"||r.op=="cook"||r.op=="eat")&&(prior.thing!=r.thing||prior.count!=r.count||prior.target!=r.target)) || (r.op=="rescue"&&(prior.target!=r.target||prior.bed!=r.bed))) throw new Exception("Action ID collision");
                return prior;
            }
            if(w.actions.Any(a=>a.actor==r.actor && a.status=="started")) throw new Exception("Pawn has an active commitment");
            var aNew=new ActionRecord {id=r.actionId,actor=r.actor,x=r.x,z=r.z,status="failed",reason="",kind=r.op,thing=r.thing,count=r.count,target=r.target,bed=r.bed};
            w.actions.Add(aNew);
            var cell=new IntVec3(r.x,0,r.z);
            if(pawn==null) { aNew.reason="Pawn is no longer available on this map"; if(r.op=="eat"){aNew.failureCode="pawn-not-on-map";aNew.validatedTick=Find.TickManager.TicksGame;} return aNew; }
            if(r.op=="eat"){Eating.Start(pawn,r,aNew);return aNew;}
            if(r.op=="build"||r.op=="cook"){Production.Start(pawn,r,aNew);return aNew;}
            if(r.op=="rescue") {
                if(r.mapId!=pawn.Map.uniqueID) {aNew.reason="Rescue observation belongs to a different or unknown map";return aNew;}
                var target=pawn.Map.mapPawns.AllPawnsSpawned.FirstOrDefault(t=>t.GetUniqueLoadID()==r.target);
                var bed=pawn.Map.listerThings.AllThings.OfType<Building_Bed>().FirstOrDefault(b=>b.GetUniqueLoadID()==r.bed);
                if(r.maxTicks<60||r.maxTicks>3600||!Rescue.Valid(pawn,target,bed)||bed.Position!=cell) {aNew.reason="Rescue patient, bed, needs or reservation unavailable";return aNew;}
                aNew.untilTick=Math.Min(Find.TickManager.TicksGame+r.maxTicks,r.untilTick);
                if(aNew.untilTick<=Find.TickManager.TicksGame) {aNew.reason="Rescue deadline expired";return aNew;}
                var rescue=JobMaker.MakeJob(DefDatabase<JobDef>.GetNamed("Concord_Rescue"),target,bed);rescue.count=1;
                // Set identity before toils can initialize; synchronous failure remains failure.
                aNew.jobId=rescue.loadID;aNew.status="started";aNew.reason="Pawn accepted bounded rescue";
                pawn.jobs.TryTakeOrderedJob(rescue,JobTag.Misc);
                if(pawn.CurJob!=rescue&&aNew.status=="started") {aNew.status="failed";aNew.reason="Native scheduler rejected rescue";}
                return aNew;
            }
            if(r.op=="haul") {
                if(r.mapId!=pawn.Map.uniqueID) {aNew.reason="Haul observation belongs to a different or unknown map";return aNew;}
                var thing=Find.CurrentMap.listerThings.AllThings.FirstOrDefault(t=>t.GetUniqueLoadID()==r.thing);
                if(r.maxTicks<60||r.maxTicks>3600||!Hauling.Valid(pawn,thing,cell,r.count)) {aNew.reason="Haul source, storage, needs or reservation unavailable";return aNew;}
                aNew.untilTick=Math.Min(Find.TickManager.TicksGame+r.maxTicks,r.untilTick);
                if(aNew.untilTick<=Find.TickManager.TicksGame) {aNew.reason="Haul deadline expired";return aNew;}
                var haul=JobMaker.MakeJob(DefDatabase<JobDef>.GetNamed("Concord_Haul"),thing,cell);
                haul.count=r.count;
                pawn.jobs.TryTakeOrderedJob(haul,JobTag.Misc);
                if(pawn.CurJob!=haul) {aNew.reason="Native scheduler rejected haul";return aNew;}
                aNew.jobId=haul.loadID;aNew.status="started";aNew.reason="Pawn accepted bounded hauling";return aNew;
            }
            if(!Movement.Available(pawn)) { aNew.reason="Pawn cannot accept a voluntary job now"; return aNew; }
            if(!Movement.Reachable(pawn,cell)) {
                aNew.reason="Destination unavailable or unsafe"; return aNew;
            }
            if(pawn.Position==cell) {aNew.status="completed"; aNew.reason="Already at destination"; return aNew;}
            var job=JobMaker.MakeJob(JobDefOf.Goto,cell);
            pawn.jobs.TryTakeOrderedJob(job,JobTag.Misc);
            if(pawn.CurJob!=job) { aNew.reason="Native scheduler rejected job"; return aNew; }
            aNew.jobId=job.loadID; aNew.status="started"; aNew.reason="Pawn accepted movement";
            return aNew;
        }
        private static ActionRecord Cancel(Request r) {
            var w=World();if(r.epoch!=w.epoch)throw new Exception("Stale timeline");w.Reconcile();
            var a=w.actions.FirstOrDefault(x=>x.id==r.actionId);
            Guid parsed;if(!Guid.TryParse(r.actionId,out parsed))throw new Exception("Action ID must be UUID");
            // Cancellation tombstone also covers a dispatch which never reached the game.
            if(a==null) {a=new ActionRecord {id=r.actionId,actor=r.actor,kind=new[]{"rescue","build","cook","eat"}.Contains(r.cancelKind)?r.cancelKind:"haul",status="interrupted",reason="Withdrawn before dispatch"};w.actions.Add(a);}
            if(a.actor!=r.actor||(a.kind!="haul"&&a.kind!="rescue"&&a.kind!="build"&&a.kind!="cook"&&a.kind!="eat"))throw new Exception("No owned work action");
            if(a.status=="started") {
                a.status="interrupted";a.reason=a.kind=="eat"?"Eating action cancelled; no further consumption authorized":"Pawn withdrew work commitment";
                var p=WorldState.FindActor(r.actor);
                if(p!=null&&p.CurJob!=null&&p.CurJob.loadID==a.jobId)p.jobs.EndCurrentJob(JobCondition.InterruptForced);
            }
            Production.Cleanup(a);
            return a;
        }
        public void Update() {
            DecisionPauses.Update();
            if(Time.realtimeSinceStartup<next || LongEventHandler.ShouldWaitForEvent) return;
            next=Time.realtimeSinceStartup+0.1f;
            var path=Root+"/request.json";
            if(!File.Exists(path)) return;
            var response=new Response(); string receipt="null";
            try {
                var payload=File.ReadAllText(path); File.Delete(path);
                var r=JsonUtility.FromJson<Request>(payload); response.id=r.id;
                if(r.op=="move"||r.op=="haul"||r.op=="rescue"||r.op=="build"||r.op=="cook"||r.op=="eat") receipt=JsonUtility.ToJson(Move(r));
                else if(r.op=="crew-log") {var w=World();CrewLog.Set(w,r.epoch,r.crewJson);}
                else if(r.op=="cancel") receipt=JsonUtility.ToJson(Cancel(r));
                else if(r.op=="intent-accept"||r.op=="intent-exclude"||r.op=="intent-stop") {
                    var w=World();if(r.epoch!=w.epoch) throw new Exception("Stale timeline");
                    var s=IntentState.Get();
                    if(r.op=="intent-accept")s.Accept(r);
                    else if(r.op=="intent-exclude")s.Exclude(r);
                    else {var i=s.ById(r.intentId);if(i==null) throw new Exception("Unknown intent");s.Retire(i,"stopped");}
                    receipt=s.Json();
                }
                else if(r.op.StartsWith("lab-")) {var w=World();if(r.epoch!=w.epoch) throw new Exception("Stale timeline");receipt=IntentState.Get().Lab(r);}
                else if(r.op=="decision-pause") {World();DecisionPauses.Set(r.epoch,r.actor,r.leaseId,r.ttlMs);}
                else if(r.op=="activity") {
                    var w=World();
                    if(r.epoch!=w.epoch) throw new Exception("Stale timeline");
                    if(!Find.CurrentMap.mapPawns.FreeColonistsSpawned.Any(p=>p.GetUniqueLoadID()==r.actor)) throw new Exception("Unknown pawn");
                    if(String.IsNullOrEmpty(r.activityId) || r.ttlMs<0 || r.ttlMs>120000) throw new Exception("Invalid activity");
                    Thinking old;
                    if(r.ttlMs>0) w.thinking[r.actor]=new Thinking {id=r.activityId,until=Time.realtimeSinceStartup+r.ttlMs/1000f};
                    else if(w.thinking.TryGetValue(r.actor,out old) && old.id==r.activityId) w.thinking.Remove(r.actor);
                }
                else if(r.op!="state") throw new Exception("Unsupported domain operation");
                response.ok=true;
            } catch(Exception e) {response.error=e.Message;}
            try {Atomic(Root+"/response.json",JsonUtility.ToJson(response).TrimEnd('}')+",\"receipt\":"+receipt+",\"state\":"+StateJson()+"}");}
            catch(Exception e) {Log.Error("[Concord] "+e);}
        }
    }
}
