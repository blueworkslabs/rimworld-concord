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
        public WorldState(Game game) { }
        public override void ExposeData() {
            Scribe_Values.Look(ref world,"concordWorld");
            Scribe_Collections.Look(ref actions,"concordActions",LookMode.Deep);
            if(actions==null) actions=new List<ActionRecord>();
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
        public override void GameComponentTick() { if(Find.TickManager.TicksGame%15==0) Reconcile(); }
    }
    [Serializable] public class Request { public string id,actionId,op,epoch,actor; public int x,z; }
    [Serializable] public class Response { public string id,error; public bool ok; }
    [Serializable] public class PawnView { public string id,name,job; public int x,z; public float health; }
    [Serializable] public class Snapshot { public string world,epoch; public int ticks; public bool loaded,paused; }

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
            var w=World(); w.Reconcile();
            var snapshot=new Snapshot {world=w.world,epoch=w.epoch,ticks=Find.TickManager.TicksGame,loaded=true,paused=Find.TickManager.Paused};
            var pawns=Find.CurrentMap.mapPawns.FreeColonistsSpawned.Select(p=>JsonUtility.ToJson(new PawnView {
                id=p.GetUniqueLoadID(),name=p.LabelShort,job=p.CurJobDef==null?"":p.CurJobDef.defName,
                x=p.Position.x,z=p.Position.z,health=p.health.summaryHealth.SummaryHealthPercent
            }));
            return JsonUtility.ToJson(snapshot).TrimEnd('}')+",\"pawns\":["+String.Join(",",pawns.ToArray())+"],\"actions\":["+
                String.Join(",",w.actions.Select(a=>JsonUtility.ToJson(a)).ToArray())+"]}";
        }
        private static ActionRecord Move(Request r) {
            var w=World();
            if(r.epoch!=w.epoch) throw new Exception("Stale timeline");
            Guid parsed;
            if(!Guid.TryParse(r.actionId,out parsed)) throw new Exception("Action ID must be UUID");
            var pawn=Find.CurrentMap.mapPawns.FreeColonistsSpawned.FirstOrDefault(p=>p.GetUniqueLoadID()==r.actor);
            if(pawn==null) throw new Exception("Actor must own a spawned colonist; core cannot execute pawn jobs");
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
            if(Time.realtimeSinceStartup<next || LongEventHandler.ShouldWaitForEvent) return;
            next=Time.realtimeSinceStartup+0.1f;
            var path=Root+"/request.json";
            if(!File.Exists(path)) return;
            var response=new Response(); string receipt="null";
            try {
                var payload=File.ReadAllText(path); File.Delete(path);
                var r=JsonUtility.FromJson<Request>(payload); response.id=r.id;
                if(r.op=="move") receipt=JsonUtility.ToJson(Move(r));
                else if(r.op!="state") throw new Exception("Unsupported domain operation");
                response.ok=true;
            } catch(Exception e) {response.error=e.Message;}
            try {Atomic(Root+"/response.json",JsonUtility.ToJson(response).TrimEnd('}')+",\"receipt\":"+receipt+",\"state\":"+StateJson()+"}");}
            catch(Exception e) {Log.Error("[Concord] "+e);}
        }
    }
}
