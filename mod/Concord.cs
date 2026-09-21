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
        public string id, actor, status, reason;
        public int x, z, jobId;
        public void ExposeData() {
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
        private readonly Dictionary<string,Sample> samples=new Dictionary<string,Sample>();
        public readonly Dictionary<string,Thinking> thinking=new Dictionary<string,Thinking>();
        public WorldState(Game game) { }
        public override void ExposeData() {
            Scribe_Values.Look(ref world,"concordWorld");
            Scribe_Collections.Look(ref actions,"concordActions",LookMode.Deep);
            if(actions==null) actions=new List<ActionRecord>();
            Scribe_Collections.Look(ref events,"concordEvents",LookMode.Deep);
            Scribe_Values.Look(ref eventSeq,"concordEventSeq");
            if(events==null) events=new List<NativeEvent>();
        }
        public void Reconcile() {
            if(Find.CurrentMap==null) return;
            foreach(var a in actions.Where(a=>a.status=="started")) {
                var pawn=Find.CurrentMap.mapPawns.FreeColonistsSpawned.FirstOrDefault(p=>p.GetUniqueLoadID()==a.actor);
                if(pawn==null || pawn.Dead || pawn.Downed) { a.status="interrupted"; a.reason="Pawn unavailable"; }
                else if(pawn.Position==new IntVec3(a.x,0,a.z)) { a.status="completed"; a.reason="Reached destination"; }
                else if(pawn.CurJob==null || pawn.CurJob.loadID!=a.jobId) { a.status="interrupted"; a.reason="Native job changed"; }
            }
        }
        private void Emit(string pawn,string kind,string detail) {
            events.Add(new NativeEvent {seq=++eventSeq,tick=Find.TickManager.TicksGame,pawn=pawn,kind=kind,detail=detail});
            if(events.Count>256) events.RemoveAt(0);
        }
        public void Observe() {
            if(Find.CurrentMap==null) return;
            foreach(var p in Find.CurrentMap.mapPawns.FreeColonistsSpawned) {
                var id=p.GetUniqueLoadID(); var now=Awareness.Read(p); Sample old;
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
    [Serializable] public class Request { public string id,actionId,op,epoch,actor,activityId,leaseId; public int x,z,ttlMs; }
    [Serializable] public class Response { public string id,error; public bool ok; }
    [Serializable] public class PawnView { public string id,name,job; public int x,z; public float health; }
    [Serializable] public class Snapshot { public string world,epoch; public int ticks,decisionPauses; public bool loaded,paused,manualPaused; }

    [StaticConstructorOnStartup]
    public static class Bootstrap
    {
        static Bootstrap() {
            if(!GenCommandLine.CommandLineArgPassed("rimworld-lab") ||
               String.IsNullOrEmpty(Environment.GetEnvironmentVariable("RIMWORLD_LAB_ROOT")) ||
               GenFilePaths.SaveDataFolderPath!=Path.Combine(Environment.GetEnvironmentVariable("RIMWORLD_LAB_ROOT"),"profile")) return;
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
                x=p.Position.x,z=p.Position.z,health=p.health.summaryHealth.SummaryHealthPercent
            }).TrimEnd('}')+",\"facts\":"+Awareness.Facts(p)+"}");
            return JsonUtility.ToJson(snapshot).TrimEnd('}')+",\"pawns\":["+String.Join(",",pawns.ToArray())+"],\"actions\":["+
                String.Join(",",w.actions.Select(a=>JsonUtility.ToJson(a)).ToArray())+"],\"eventSeq\":"+w.eventSeq+",\"events\":["+
                String.Join(",",w.events.Select(e=>JsonUtility.ToJson(e)).ToArray())+"]}";
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
                if(prior.actor!=r.actor || prior.x!=r.x || prior.z!=r.z) throw new Exception("Action ID collision");
                return prior;
            }
            if(w.actions.Any(a=>a.actor==r.actor && a.status=="started")) throw new Exception("Pawn has an active commitment");
            var aNew=new ActionRecord {id=r.actionId,actor=r.actor,x=r.x,z=r.z,status="failed",reason=""};
            w.actions.Add(aNew);
            var cell=new IntVec3(r.x,0,r.z);
            if(pawn==null) { aNew.reason="Pawn is no longer available on this map"; return aNew; }
            if(pawn.Dead || pawn.Downed || pawn.InMentalState || pawn.Drafted) { aNew.reason="Pawn cannot accept a voluntary job now"; return aNew; }
            if(!cell.InBounds(pawn.Map) || !cell.Standable(pawn.Map) || !pawn.CanReach(cell,PathEndMode.OnCell,Danger.None)) {
                aNew.reason="Destination unavailable or unsafe"; return aNew;
            }
            if(pawn.Position==cell) {aNew.status="completed"; aNew.reason="Already at destination"; return aNew;}
            var job=JobMaker.MakeJob(JobDefOf.Goto,cell);
            pawn.jobs.TryTakeOrderedJob(job,JobTag.Misc);
            if(pawn.CurJob!=job) { aNew.reason="Native scheduler rejected job"; return aNew; }
            aNew.jobId=job.loadID; aNew.status="started"; aNew.reason="Pawn accepted movement";
            return aNew;
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
                if(r.op=="move") receipt=JsonUtility.ToJson(Move(r));
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
