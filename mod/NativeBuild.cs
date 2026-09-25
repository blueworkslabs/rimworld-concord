using System;
using System.Collections.Generic;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;
using Verse.AI;

namespace Concord {
    // Construction as a native intent (docs/MIGRATION_PRODUCTION.md, Gate B as amended by #88).
    // One intent per footprint key: the tag follows blueprint -> frame -> building only at the two
    // replacement points; every other disappearance is an event. Patches (NativeBuildPatches.cs)
    // read this state; a static fast path keeps them O(1) while nothing is tagged.

    /** One receipt line. kind: delivery, work, finish, pretag, forced, rejected, violation, note,
     *  withdrawal, ending, fate. role: accepted, helper, pretag, forced (had refused). */
    [Serializable] public class BuildRecord : IExposable {
        public int seq,tick,generation,count=0;public float work;
        public string kind,pawn,role,def,occurrence,text;
        public void ExposeData() {
            Scribe_Values.Look(ref seq,"seq");Scribe_Values.Look(ref tick,"tick");Scribe_Values.Look(ref generation,"generation");
            Scribe_Values.Look(ref count,"count");Scribe_Values.Look(ref work,"work");
            Scribe_Values.Look(ref kind,"kind");Scribe_Values.Look(ref pawn,"pawn");Scribe_Values.Look(ref role,"role");
            Scribe_Values.Look(ref def,"def");Scribe_Values.Look(ref occurrence,"occurrence");Scribe_Values.Look(ref text,"text");
        }
    }
    /** A carrier-scoped part of one job (P5.1): which intent/generation it may touch and how. */
    public class BuildSegment : IExposable {
        public string intentId,kind;public int generation,admittedTick,settlements;public float baseline=-1f;public bool pretag,open=true;
        public void ExposeData() {
            Scribe_Values.Look(ref intentId,"intentId");Scribe_Values.Look(ref kind,"kind");
            Scribe_Values.Look(ref generation,"generation");Scribe_Values.Look(ref admittedTick,"admittedTick");
            Scribe_Values.Look(ref settlements,"settlements");Scribe_Values.Look(ref baseline,"baseline",-1f);
            Scribe_Values.Look(ref pretag,"pretag");Scribe_Values.Look(ref open,"open",true);
        }
    }
    /** Saved per job: the pawn, whether a scanner produced it with forced: true, and its segments. */
    public class BuildJob : IExposable {
        public int job,deposits,lastSeenTick;public string pawn;public bool forced;
        public List<BuildSegment> segments=new List<BuildSegment>();
        public BuildSegment Segment(string intentId,int generation){return segments.FirstOrDefault(s=>s.intentId==intentId&&s.generation==generation);}
        public void ExposeData() {
            Scribe_Values.Look(ref job,"job");Scribe_Values.Look(ref deposits,"deposits");Scribe_Values.Look(ref lastSeenTick,"lastSeenTick");
            Scribe_Values.Look(ref pawn,"pawn");Scribe_Values.Look(ref forced,"forced");
            Scribe_Collections.Look(ref segments,"segments",LookMode.Deep);
            if(segments==null)segments=new List<BuildSegment>();
        }
    }
    public class BuildIntent : IExposable {
        public string intentId,status="open",stage="blueprint",def,label,siteId,stopReason,finisher,note,fate,held;
        public int mapId=-1,x,z,rot,generation,thingId=-1,createdTick,untilTick,fateTick=-1,violations,rejectedStarts;
        /** The frame's native workDone at completion or failure: every settled share must sum to it. */
        public float finalWork=-1f;
        public bool contributed,placedByCore,watchFate;
        public List<string> accepted=new List<string>(),excluded=new List<string>();
        public List<int> excludedTicks=new List<int>();
        public List<BuildRecord> records=new List<BuildRecord>();
        public ThingDef Def {get{return DefDatabase<ThingDef>.GetNamedSilentFail(def);}}
        public bool Open {get{return status=="open";}}
        public string Key {get{return BuildState.KeyOf(mapId,x,z,rot,def);}}
        public bool Excluded(string pawn){return pawn!=null&&excluded.Contains(pawn);}
        public string Role(string pawn){return accepted.Contains(pawn)?"accepted":"helper";}
        public void ExposeData() {
            Scribe_Values.Look(ref intentId,"intentId");Scribe_Values.Look(ref status,"status","open");Scribe_Values.Look(ref stage,"stage","blueprint");
            Scribe_Values.Look(ref def,"def");Scribe_Values.Look(ref label,"label");Scribe_Values.Look(ref siteId,"siteId");
            Scribe_Values.Look(ref stopReason,"stopReason");Scribe_Values.Look(ref finisher,"finisher");Scribe_Values.Look(ref note,"note");
            Scribe_Values.Look(ref fate,"fate");Scribe_Values.Look(ref held,"held");
            Scribe_Values.Look(ref mapId,"mapId",-1);Scribe_Values.Look(ref x,"x");Scribe_Values.Look(ref z,"z");Scribe_Values.Look(ref rot,"rot");
            Scribe_Values.Look(ref generation,"generation");Scribe_Values.Look(ref thingId,"thingId",-1);
            Scribe_Values.Look(ref createdTick,"createdTick");Scribe_Values.Look(ref untilTick,"untilTick");Scribe_Values.Look(ref fateTick,"fateTick",-1);
            Scribe_Values.Look(ref violations,"violations");Scribe_Values.Look(ref rejectedStarts,"rejectedStarts");Scribe_Values.Look(ref finalWork,"finalWork",-1f);
            Scribe_Values.Look(ref contributed,"contributed");Scribe_Values.Look(ref placedByCore,"placedByCore");Scribe_Values.Look(ref watchFate,"watchFate");
            Scribe_Collections.Look(ref accepted,"accepted",LookMode.Value);Scribe_Collections.Look(ref excluded,"excluded",LookMode.Value);
            Scribe_Collections.Look(ref excludedTicks,"excludedTicks",LookMode.Value);
            Scribe_Collections.Look(ref records,"records",LookMode.Deep);
            if(Scribe.mode==LoadSaveMode.PostLoadInit){
                if(accepted==null)accepted=new List<string>();if(excluded==null)excluded=new List<string>();
                if(excludedTicks==null)excludedTicks=new List<int>();if(records==null)records=new List<BuildRecord>();
            }
        }
    }
    [Serializable] public class BuildShare {public string pawn,role,def;public int count;public float work;}
    [Serializable] public class BuildView {
        public string intentId,status,stage,def,label,siteId,stopReason,finisher,note,fate,held;
        public int mapId,x,z,rot,generation,thingId,createdTick,untilTick,fateTick,violations,rejectedStarts;public float finalWork;
        public string[] accepted,excluded;
        [NonSerialized] public BuildShare[] delivered,work;
        [NonSerialized] public BuildRecord[] records;
    }

    /** Transient scoped transition (never saved: saves happen between ticks, not inside calls). */
    public class BuildTransition {
        public BuildIntent intent;public int predecessor;public Map map;public ThingDef expected;public string kind;
        public List<Thing> spawned=new List<Thing>();public bool predecessorRemoved,committed;
    }

    public class BuildState : GameComponent {
        public List<BuildIntent> intents=new List<BuildIntent>();
        public Dictionary<int,BuildJob> jobs=new Dictionary<int,BuildJob>();
        public Dictionary<string,int> generations=new Dictionary<string,int>();
        /** Jobs a supported scanner returned with forced: true, by load ID (amendment 1). */
        public Dictionary<int,int> forcedStamps=new Dictionary<int,int>();
        public int seq;
        private bool reconcileAfterLoad;
        // Fast path for every patch: nothing tagged, nothing watched -> return at once.
        public static bool Active;
        // Current carrier or watched building thing ID -> intent.
        public static readonly Dictionary<int,BuildIntent> byThing=new Dictionary<int,BuildIntent>();
        public static BuildTransition transition;
        // A player removal (Cancel/Deconstruct) waiting to learn whether a blueprint takes its place in
        // the same call (the build designator wipes, then places). Resolved by B11, the next frame
        // update, or the next state export, whichever comes first. Never saved.
        public static BuildIntent pending;public static DestroyMode pendingMode;
        // Lab fault injection for scripted case 14 only; one-shot.
        public static string fault;
        public static bool TakeFault(string f){if(fault!=f)return false;fault=null;return true;}
        public BuildState(Game game) { }
        public static BuildState Get() {return Current.Game==null?null:Current.Game.GetComponent<BuildState>();}
        public static string KeyOf(int mapId,int x,int z,int rot,string def){return mapId+":"+x+","+z+":"+rot+":"+def;}
        public override void ExposeData() {
            Scribe_Collections.Look(ref intents,"concordBuildIntents",LookMode.Deep);
            Scribe_Collections.Look(ref jobs,"concordBuildJobs",LookMode.Value,LookMode.Deep);
            Scribe_Collections.Look(ref generations,"concordBuildGenerations",LookMode.Value,LookMode.Value);
            Scribe_Collections.Look(ref forcedStamps,"concordBuildForced",LookMode.Value,LookMode.Value);
            Scribe_Values.Look(ref seq,"concordBuildSeq");
            if(intents==null)intents=new List<BuildIntent>();if(jobs==null)jobs=new Dictionary<int,BuildJob>();
            if(generations==null)generations=new Dictionary<string,int>();if(forcedStamps==null)forcedStamps=new Dictionary<int,int>();
            if(Scribe.mode==LoadSaveMode.PostLoadInit){reconcileAfterLoad=true;Reindex();}
        }
        public override void StartedNewGame(){Reindex();}
        public override void LoadedGame(){Reindex();}
        public void Reindex() {
            byThing.Clear();transition=null;pending=null;fault=null;
            foreach(var i in intents)if((i.Open||i.watchFate)&&i.thingId>=0)byThing[i.thingId]=i;
            Active=byThing.Count>0||intents.Any(i=>i.Open);
        }
        public BuildIntent ById(string id){return intents.FirstOrDefault(i=>i.intentId==id);}
        public static BuildIntent ForThing(Thing t){BuildIntent i;return t!=null&&Active&&byThing.TryGetValue(t.thingIDNumber,out i)?i:null;}
        public static BuildIntent OpenFor(Thing t){var i=ForThing(t);return i!=null&&i.Open?i:null;}
        private static WorldState World(){return Current.Game.GetComponent<WorldState>();}
        public void Emit(Pawn p,string kind,string detail){World().Emit(p==null?"":p.GetUniqueLoadID(),kind,detail);}
        public BuildRecord Record(BuildIntent i,BuildRecord r) {
            r.seq=++seq;r.tick=Find.TickManager.TicksGame;r.generation=i.generation;
            if(r.occurrence!=null&&i.records.Any(x=>x.occurrence==r.occurrence))return null;
            // Durable accounting/dedup history must not be evicted with the 32-line display tail.
            i.records.Add(r);return r;
        }

        // ---- consent -------------------------------------------------------------------------
        public static string Id(Pawn p){return p==null?null:p.GetUniqueLoadID();}
        public bool Forced(Job job){int t;return job!=null&&(forcedStamps.TryGetValue(job.loadID,out t)||(jobs.ContainsKey(job.loadID)&&jobs[job.loadID].forced));}
        /** An excluded pawn's own (non-forced) job may not touch this intent's carrier. */
        public bool Blocked(BuildIntent i,Pawn p,Job job){return i!=null&&i.Open&&p!=null&&i.Excluded(Id(p))&&!Forced(job);}
        public static IEnumerable<Thing> Touched(Job j) {
            if(j==null) yield break;
            if(j.targetA.Thing!=null)yield return j.targetA.Thing;
            if(j.targetB.Thing!=null)yield return j.targetB.Thing;
            if(j.targetC.Thing!=null)yield return j.targetC.Thing;
            if(j.targetQueueB!=null)foreach(var t in j.targetQueueB)if(t.Thing!=null)yield return t.Thing;
        }
        public static bool BuildJobDef(Job j){return j!=null&&(j.def==JobDefOf.HaulToContainer||j.def==JobDefOf.FinishFrame);}
        public List<BuildIntent> TaggedIn(Job j){var list=new List<BuildIntent>();if(!BuildJobDef(j))return list;foreach(var t in Touched(j)){var i=OpenFor(t);if(i!=null&&!list.Contains(i))list.Add(i);}return list;}

        // ---- admission (P5.2 a) ----------------------------------------------------------------
        /** Returns false when the incoming candidate must not start. */
        public bool Admit(Pawn p,Job job,Pawn_JobTracker tracker) {
            var tagged=TaggedIn(job);if(tagged.Count==0)return true;
            bool forced=Forced(job);
            foreach(var i in tagged) {
                if(!i.Excluded(Id(p))||forced) continue;
                i.rejectedStarts++;Record(i,new BuildRecord{kind="rejected",pawn=Id(p),occurrence="reject:"+job.loadID+":"+i.generation});
                Emit(p,"build-rejected-start","intent="+i.intentId+";job="+job.loadID);
                return false;
            }
            var bj=Job(job,p);bj.forced=bj.forced||forced;
            foreach(var i in tagged) {
                var seg=bj.Segment(i.intentId,i.generation);
                if(seg==null){seg=new BuildSegment{intentId=i.intentId,generation=i.generation,kind=job.def==JobDefOf.FinishFrame?"work":"delivery",admittedTick=Find.TickManager.TicksGame};bj.segments.Add(seg);}
                seg.open=true;
                // Work baseline re-taken at every start, including resume from pause (P5.4).
                var f=Carrier(i) as Frame;if(seg.kind=="work"&&f!=null)seg.baseline=f.workDone;
            }
            return true;
        }
        public BuildJob Job(Job job,Pawn p){BuildJob bj;if(!jobs.TryGetValue(job.loadID,out bj)){bj=new BuildJob{job=job.loadID,pawn=Id(p)};jobs[job.loadID]=bj;}bj.lastSeenTick=Find.TickManager.TicksGame;return bj;}
        /** Reject an incoming candidate that is not the current job: extract it from the queue if still
         *  there, release its reservations, keep unrelated current work (P5.2 a). */
        public void DisposeCandidate(Pawn p,Job job) {
            var q=p.jobs.jobQueue;if(q!=null&&q.Contains(job))q.Extract(job);
            p.ClearReservationsForJob(job);
            BuildJob bj;if(jobs.TryGetValue(job.loadID,out bj)){foreach(var s in bj.segments)s.open=false;}
        }

        // ---- work settlement (P5.4, signature C1) -----------------------------------------------
        public void Settle(Pawn p,Job job,Frame frame,string at) {
            BuildJob bj;if(job==null||!jobs.TryGetValue(job.loadID,out bj))return;
            var i=OpenFor(frame)??ForThing(frame);if(i==null)return;
            var seg=bj.Segment(i.intentId,i.generation);if(seg==null||seg.kind!="work"||seg.baseline<0)return;
            float delta=frame.workDone-seg.baseline;seg.baseline=frame.workDone;seg.settlements++;
            if(delta<=0)return;
            var who=Id(p);string role=seg.pretag?"pretag":bj.forced&&i.Excluded(who)?"forced":i.Excluded(who)?"violation":i.Role(who);
            if(role=="violation")i.violations++;
            if(role!="pretag")i.contributed=true;
            Record(i,new BuildRecord{kind="work",pawn=who,role=role,work=delta,occurrence="work:"+job.loadID+":"+seg.settlements+":"+i.generation,text=at});
            Emit(p,"build-work","intent="+i.intentId+";work="+delta.ToString("0.0",System.Globalization.CultureInfo.InvariantCulture)+";role="+role);
        }

        // ---- deposit (P2) ------------------------------------------------------------------------
        public void Deposited(Pawn p,Job job,Frame frame,ThingDef def,int delta) {
            var i=OpenFor(frame);if(i==null||delta<=0)return;
            var bj=Job(job,p);var seg=bj.Segment(i.intentId,i.generation);
            var who=Id(p);string role=seg!=null&&seg.pretag?"pretag":bj.forced&&i.Excluded(who)?"forced":i.Excluded(who)?"violation":i.Role(who);
            if(role=="violation")i.violations++;
            if(role!="pretag")i.contributed=true;
            bj.deposits++;
            Record(i,new BuildRecord{kind="delivery",pawn=who,role=role,def=def.defName,count=delta,occurrence="deposit:"+job.loadID+":"+frame.thingIDNumber+":"+bj.deposits+":"+i.generation});
            Emit(p,"build-delivered","intent="+i.intentId+";def="+def.defName+";count="+delta+";role="+role);
        }

        // ---- lifecycle ---------------------------------------------------------------------------
        public Thing Carrier(BuildIntent i) {
            var map=Find.Maps.FirstOrDefault(m=>m.uniqueID==i.mapId);if(map==null||i.thingId<0)return null;
            var c=new IntVec3(i.x,0,i.z);if(!c.InBounds(map))return null;
            return c.GetThingList(map).FirstOrDefault(t=>t.thingIDNumber==i.thingId);
        }
        private void SettleCurrentFrame(Frame frame) {
            if(frame==null||!frame.Spawned)return;
            foreach(var pawn in frame.Map.mapPawns.AllPawnsSpawned)
                if(pawn.CurJob!=null&&pawn.CurJob.def==JobDefOf.FinishFrame&&pawn.CurJob.targetA.Thing==frame)
                    Settle(pawn,pawn.CurJob,frame,"intent ending");
        }
        public void End(BuildIntent i,string status,string reason,Pawn p=null) {
            if(!i.Open)return;
            // Close the accounting boundary before removing lookup/ownership. Accrued work stands.
            SettleCurrentFrame(Carrier(i) as Frame);
            i.status=status;i.stopReason=reason;
            foreach(var bj in jobs.Values)foreach(var s in bj.segments.Where(s=>s.intentId==i.intentId&&s.generation==i.generation))s.open=false;
            if(status=="built"){i.watchFate=true;i.fate="standing";}
            else byThing.Remove(i.thingId);
            Record(i,new BuildRecord{kind="ending",pawn=Id(p),text=status+(reason==null?"":": "+reason),occurrence="end:"+i.generation});
            Emit(p,"build-ended","intent="+i.intentId+";status="+status+(reason==null?"":";reason="+reason));
            Active=byThing.Count>0||intents.Any(x=>x.Open);
        }
        public void Move(BuildIntent i,Thing successor,string stage) {
            byThing.Remove(i.thingId);i.thingId=successor.thingIDNumber;i.stage=stage;byThing[i.thingId]=i;
            Record(i,new BuildRecord{kind="note",text="stage "+stage,occurrence="stage:"+stage+":"+i.generation});
            Emit(null,"build-stage","intent="+i.intentId+";stage="+stage);
        }
        /** Classify a removal no transition owns (P2 "carrier removed"). */
        public void Removed(Thing t,DestroyMode mode) {
            var i=ForThing(t);if(i==null)return;
            if(transition!=null&&transition.predecessor==t.thingIDNumber){transition.predecessorRemoved=true;return;}
            if(i.status=="built"&&i.watchFate) {
                i.fate=mode==DestroyMode.Deconstruct?"deconstructed":"destroyed";i.fateTick=Find.TickManager.TicksGame;i.watchFate=false;byThing.Remove(t.thingIDNumber);
                Record(i,new BuildRecord{kind="fate",text=i.fate,occurrence="fate:"+i.generation});
                Emit(null,"build-fate","intent="+i.intentId+";fate="+i.fate);
                Active=byThing.Count>0||intents.Any(x=>x.Open);return;
            }
            var frame=t as Frame;
            if(frame!=null){SettleCurrentFrame(frame);i.held=Held(frame);i.finalWork=frame.workDone;}
            // Cancel and Deconstruct are both player removals, but the destroy mode does not say which:
            // the deconstruct designator removes frames with Deconstruct, and the build designator may
            // cancel first and then wipe with Deconstruct before placing its own blueprint. Wait.
            if(mode==DestroyMode.Cancel||mode==DestroyMode.Deconstruct){if(pending!=null&&pending!=i)ResolvePending(false);if(pending==null){pending=i;pendingMode=mode;}return;}
            if(mode==DestroyMode.Vanish)End(i,"failed","removed");
            else End(i,"failed","destroyed");
        }
        public string Refund(BuildIntent i){return i.stage=="frame"?"; held "+(String.IsNullOrEmpty(i.held)?"nothing":i.held)+"; returned: not recorded":"";}
        public void ResolvePending(bool replaced) {
            var i=pending;pending=null;if(i==null||!i.Open)return;
            if(replaced)End(i,"stopped","replaced by the player"+Refund(i));
            else if(pendingMode==DestroyMode.Cancel)End(i,"stopped","cancelled by the player"+Refund(i));
            else End(i,"stopped","deconstructed by the player's order"+Refund(i));
        }
        public bool Overlaps(BuildIntent i,Thing t,Map map) {
            if(map==null||map.uniqueID!=i.mapId||i.Def==null)return false;
            var mine=GenAdj.OccupiedRect(new IntVec3(i.x,0,i.z),new Rot4(i.rot),i.Def.size);
            return t.OccupiedRect().Overlaps(mine);
        }
        public override void GameComponentUpdate(){if(pending!=null)ResolvePending(false);}
        public static string Held(Frame f){return String.Join(", ",f.resourceContainer.Select(x=>x.stackCount+" "+x.def.defName).ToArray());}

        // ---- operator ops ------------------------------------------------------------------------
        public BuildIntent Accept(Request r) {
            var p=WorldState.FindActor(r.actor);if(p==null)throw new Exception("Unknown pawn");
            var i=ById(r.intentId);var pending=i!=null&&i.status=="pending"?i:null;
            if(i!=null&&pending==null){
                if(!i.Open)throw new Exception("Intent is "+i.status);
                if(i.Excluded(r.actor))throw new Exception("Pawn is excluded; a change of mind is a new offer");
                if(!i.accepted.Contains(r.actor))i.accepted.Add(r.actor);return i;
            }
            if(pending!=null&&pending.Excluded(r.actor))throw new Exception("Pawn is excluded; a change of mind is a new offer");
            if(r.maxTicks<600||r.maxTicks>60000)throw new Exception("maxTicks must be 600-60000");
            var map=p.Map;Thing carrier;ThingDef def;Rot4 rot;bool placed=false;
            if(!String.IsNullOrEmpty(r.target)) {
                // An existing colony blueprint (colony-public, placed by someone).
                carrier=map.listerThings.AllThings.FirstOrDefault(t=>t.GetUniqueLoadID()==r.target);
                if(!(carrier is Blueprint_Build)&&!(carrier is Frame))throw new Exception("Not a colony blueprint or frame");
                if(carrier.Destroyed||carrier.Faction!=Faction.OfPlayer)throw new Exception("Not a colony blueprint or frame");
                def=carrier.def.entityDefToBuild as ThingDef;rot=carrier.Rotation;
            } else {
                // Operator-declared candidate site: the site must be clear; our placement never wipes.
                def=DefDatabase<ThingDef>.GetNamedSilentFail(r.thing);rot=new Rot4(r.count);
                if(def==null||def.blueprintDef==null)throw new Exception("Unknown buildable def");
                if(!BuildDefs.Allowed(def))throw new Exception("Def not in the configured list");
                var cell=new IntVec3(r.x,0,r.z);
                if(!cell.InBounds(map))throw new Exception("Site out of bounds");
                var ok=GenConstruct.CanPlaceBlueprintAt(def,cell,rot,map);
                if(!ok.Accepted||GenAdj.OccupiedRect(cell,rot,def.size).Cells.SelectMany(x=>x.GetThingList(map)).Any(t=>t.def.category==ThingCategory.Building||t is Blueprint||t is Frame))throw new Exception("Site not clear: "+ok.Reason);
                carrier=GenConstruct.PlaceBlueprintForBuild(def,cell,map,rot,Faction.OfPlayer,null);placed=true;
            }
            if(def==null||!BuildDefs.Allowed(def))throw new Exception("Def not in the configured list");
            var key=KeyOf(map.uniqueID,carrier.Position.x,carrier.Position.z,rot.AsInt,def.defName);
            if(intents.Any(x=>x.Open&&x.Key==key))throw new Exception("An open agreement already covers this site");
            int gen;generations.TryGetValue(key,out gen);gen++;generations[key]=gen;
            // A later intent at the same key closes the previous fate watch: a new generation.
            foreach(var old in intents.Where(x=>x.Key==key&&x.watchFate)){old.watchFate=false;byThing.Remove(old.thingId);}
            i=pending??new BuildIntent{intentId=r.intentId};
            i.def=def.defName;i.mapId=map.uniqueID;i.x=carrier.Position.x;i.z=carrier.Position.z;i.rot=rot.AsInt;i.generation=gen;
            i.thingId=carrier.thingIDNumber;i.stage=carrier is Frame?"frame":"blueprint";i.status="open";i.placedByCore=placed;
            i.siteId=r.siteId;i.label=String.IsNullOrEmpty(r.label)?def.label:r.label;
            i.createdTick=Find.TickManager.TicksGame;i.untilTick=i.createdTick+r.maxTicks;
            if(!i.accepted.Contains(r.actor))i.accepted.Add(r.actor);
            if(pending==null)intents.Add(i);
            byThing[i.thingId]=i;Active=true;
            // Jobs already touching the carrier are pre-tag: uncredited ordinary work (P5.1).
            foreach(var other in map.mapPawns.AllPawnsSpawned) {
                foreach(var job in new[]{other.CurJob}.Concat(other.jobs==null||other.jobs.jobQueue==null?Enumerable.Empty<Job>():other.jobs.jobQueue.Select(q=>q.job))) {
                    if(!BuildJobDef(job)||!Touched(job).Any(t=>t.thingIDNumber==i.thingId))continue;
                    var bj=Job(job,other);var seg=bj.Segment(i.intentId,i.generation);
                    if(seg==null){seg=new BuildSegment{intentId=i.intentId,generation=i.generation,kind=job.def==JobDefOf.FinishFrame?"work":"delivery",admittedTick=i.createdTick,pretag=true};bj.segments.Add(seg);}
                    var f=carrier as Frame;if(seg.kind=="work"&&f!=null)seg.baseline=f.workDone;
                    Emit(other,"build-pretag-marked","intent="+i.intentId+";job="+job.loadID);
                }
            }
            // Refusals recorded before the tag bind now (P5.1: attachment applies the sweep).
            foreach(var ex in i.excluded.ToList())Sweep(i,WorldState.FindActor(ex));
            Emit(p,"build-opened","intent="+i.intentId+";def="+i.def+";stage="+i.stage+";generation="+i.generation);
            return i;
        }
        public BuildIntent Exclude(Request r) {
            var i=ById(r.intentId);
            if(i==null){i=new BuildIntent{intentId=r.intentId,status="pending"};intents.Add(i);}
            var p=WorldState.FindActor(r.actor);
            // Settle work under its pre-change role before publishing exclusion and interrupting.
            if(i.Open&&p!=null&&p.CurJob!=null&&p.CurJob.def==JobDefOf.FinishFrame) {
                var frame=p.CurJob.targetA.Thing as Frame;
                if(frame!=null&&frame.thingIDNumber==i.thingId)Settle(p,p.CurJob,frame,"before exclusion");
            }
            if(!i.excluded.Contains(r.actor)){i.excluded.Add(r.actor);i.excludedTicks.Add(Find.TickManager.TicksGame);}
            bool wasAccepted=i.accepted.Remove(r.actor);
            if(i.Open) {
                Record(i,new BuildRecord{kind="withdrawal",pawn=r.actor,text=(wasAccepted?"withdrew":"refused")+(String.IsNullOrEmpty(r.reason)?"":": "+r.reason)});
                if(!TakeFault("no-sweep"))Sweep(i,p);
                // All accepted pawns withdrew before any contribution: stop (signature C2).
                if(i.accepted.Count==0&&!i.contributed)End(i,"stopped","every accepted pawn withdrew before any contribution",p);
            }
            Emit(p,"build-excluded","intent="+i.intentId+";reason="+(r.reason??""));
            return i;
        }
        /** P5.3: queued candidates out with native cleanup, then the current job without a new search. */
        public void Sweep(BuildIntent i,Pawn p) {
            if(p==null||!i.Open)return;
            Func<Job,bool> touches=j=>BuildJobDef(j)&&!Forced(j)&&Touched(j).Any(t=>t.thingIDNumber==i.thingId);
            if(p.jobs.jobQueue!=null)foreach(var q in p.jobs.jobQueue.Where(q=>touches(q.job)).ToList())DisposeCandidate(p,q.job);
            if(touches(p.CurJob))p.jobs.EndCurrentJob(JobCondition.InterruptForced,false);
        }
        public void Stop(Request r){var i=ById(r.intentId);if(i==null)throw new Exception("Unknown intent");End(i,"stopped",String.IsNullOrEmpty(r.reason)?"stopped by the coordinator":r.reason);}

        public override void GameComponentTick() {
            if(!Active&&!reconcileAfterLoad)return;
            int now=Find.TickManager.TicksGame;
            if(reconcileAfterLoad){reconcileAfterLoad=false;AfterLoad();}
            if(now%60!=0)return;
            foreach(var i in intents.Where(x=>x.Open).ToList()) {
                var c=Carrier(i);
                if(now>=i.untilTick){End(i,"expired","deadline passed at stage "+i.stage);continue;}
                if(c==null){
                    // Not found and no removal observed: a different occupant fails the intent; never re-tag.
                    End(i,"failed","tagged thing missing");continue;
                }
                var map=c.Map;var other=GenAdj.OccupiedRect(new IntVec3(i.x,0,i.z),new Rot4(i.rot),i.Def.size).Cells.SelectMany(cell=>cell.GetThingList(map))
                    .FirstOrDefault(t=>t!=c&&(t is Blueprint||t is Frame||t.def.category==ThingCategory.Building&&t.def.building!=null&&t.def.building.isEdifice));
                if(other!=null){End(i,"failed","a different "+(other.def.entityDefToBuild??other.def).label+" on the site");continue;}
                var forbidden=c.IsForbidden(Faction.OfPlayer);var note=forbidden?"forbidden by the player":null;
                if(note!=i.note){i.note=note;Record(i,new BuildRecord{kind="note",text=note??"no longer forbidden"});}
            }
            foreach(var i in intents.Where(x=>x.watchFate).ToList()) {
                var b=Carrier(i);
                if(b==null&&i.fate=="standing"){i.fate="left its place";i.fateTick=now;i.watchFate=false;byThing.Remove(i.thingId);Record(i,new BuildRecord{kind="fate",text=i.fate,occurrence="fate:"+i.generation});}
            }
            // Forced stamps and job records for jobs that exist nowhere any more are dropped.
            if(now%600==0)Prune(now);
            Active=byThing.Count>0||intents.Any(x=>x.Open);
        }
        private HashSet<int> LiveJobs(){
            var live=new HashSet<int>();
            foreach(var m in Find.Maps)foreach(var p in m.mapPawns.AllPawnsSpawned){if(p.CurJob!=null)live.Add(p.CurJob.loadID);if(p.jobs!=null&&p.jobs.jobQueue!=null)foreach(var q in p.jobs.jobQueue)live.Add(q.job.loadID);}
            return live;
        }
        private void Prune(int now){
            var live=LiveJobs();
            foreach(var k in forcedStamps.Keys.Where(k=>!live.Contains(k)&&now-forcedStamps[k]>600).ToList())forcedStamps.Remove(k);
            foreach(var k in jobs.Keys.Where(k=>!live.Contains(k)&&now-jobs[k].lastSeenTick>600).ToList())jobs.Remove(k);
        }
        /** Restored current and queued jobs did not pass StartJob: recheck, keeping saved baselines. */
        private void AfterLoad() {
            foreach(var i in intents.Where(x=>x.Open))foreach(var ex in i.excluded)Sweep(i,WorldState.FindActor(ex));
        }

        public string Json() {
            if(pending!=null)ResolvePending(false);
            // Unity's runtime serializer omits nested custom-object arrays in this assembly. Emit
            // each receipt/share explicitly, as the existing hauling view does; never default
            // a missing ledger to zero on the TypeScript side.
            return "["+String.Join(",",intents.Select(i=>{
                var v=View(i);
                return JsonUtility.ToJson(v).TrimEnd('}')+",\"delivered\":["+
                    String.Join(",",v.delivered.Select(d=>JsonUtility.ToJson(d)).ToArray())+"],\"work\":["+
                    String.Join(",",v.work.Select(w=>JsonUtility.ToJson(w)).ToArray())+"],\"records\":["+
                    String.Join(",",v.records.Select(r=>JsonUtility.ToJson(r)).ToArray())+"]}";
            }).ToArray())+"]";
        }
        public static BuildView View(BuildIntent i) {
            var delivered=i.records.Where(r=>r.kind=="delivery").GroupBy(r=>r.pawn+"|"+r.role+"|"+r.def).Select(g=>new BuildShare{pawn=g.First().pawn,role=g.First().role,def=g.First().def,count=g.Sum(r=>r.count)}).ToArray();
            var work=i.records.Where(r=>r.kind=="work").GroupBy(r=>r.pawn+"|"+r.role).Select(g=>new BuildShare{pawn=g.First().pawn,role=g.First().role,work=g.Sum(r=>r.work)}).ToArray();
            return new BuildView{intentId=i.intentId,status=i.status,stage=i.stage,def=i.def,label=i.label,siteId=i.siteId,stopReason=i.stopReason,finisher=i.finisher,note=i.note,fate=i.fate,held=i.held,
                mapId=i.mapId,x=i.x,z=i.z,rot=i.rot,generation=i.generation,thingId=i.thingId,createdTick=i.createdTick,untilTick=i.untilTick,fateTick=i.fateTick,
                violations=i.violations,rejectedStarts=i.rejectedStarts,finalWork=i.finalWork,accepted=i.accepted.ToArray(),excluded=i.excluded.ToArray(),delivered=delivered,work=work,
                records=i.records.Skip(Math.Max(0,i.records.Count-32)).ToArray()};
        }

        // ---- lab (scripted cases only) --------------------------------------------------------------
        public string Lab(Request r) {
            var p=WorldState.FindActor(r.actor);var i=ById(r.intentId);
            Func<Thing> carrier=()=>{if(i==null)throw new Exception("Unknown intent");var c=Carrier(i);if(c==null)throw new Exception("No carrier");return c;};
            if(r.op=="lab-build-forced") {
                // The amended order rule: a supported scanner's JobOnThing(pawn, thing, forced: true),
                // taken as an ordered job, exactly as the float-menu provider does.
                if(p==null)throw new Exception("Unknown pawn");var t=carrier();
                WorkGiver_Scanner g=r.reason=="work"?(WorkGiver_Scanner)DefDatabase<WorkGiverDef>.AllDefs.First(d=>d.giverClass==typeof(WorkGiver_ConstructFinishFrames)).Worker
                    :(WorkGiver_Scanner)DefDatabase<WorkGiverDef>.AllDefs.First(d=>d.giverClass==(t is Frame?typeof(WorkGiver_ConstructDeliverResourcesToFrames):typeof(WorkGiver_ConstructDeliverResourcesToBlueprints))).Worker;
                var job=g.JobOnThing(p,t,true);if(job==null)throw new Exception("No forced job available");
                // count 1: queued behind the current job (shift-click), to exercise queued/restored stamps.
                p.jobs.TryTakeOrderedJob(job,JobTag.Misc,r.count==1);
                return "{\"job\":"+job.loadID+",\"def\":\""+job.def.defName+"\"}";
            }
            if(r.op=="lab-build-queue") {
                // An ordinary (forced: false) scanner job for the carrier, enqueued behind the current
                // job without being started: a pre-existing queued candidate (cases 13 and 15).
                if(p==null)throw new Exception("Unknown pawn");var t=carrier();
                WorkGiver_Scanner g=r.reason=="work"?(WorkGiver_Scanner)DefDatabase<WorkGiverDef>.AllDefs.First(d=>d.giverClass==typeof(WorkGiver_ConstructFinishFrames)).Worker
                    :(WorkGiver_Scanner)DefDatabase<WorkGiverDef>.AllDefs.First(d=>d.giverClass==(t is Frame?typeof(WorkGiver_ConstructDeliverResourcesToFrames):typeof(WorkGiver_ConstructDeliverResourcesToBlueprints))).Worker;
                var job=g.JobOnThing(p,t,false);if(job==null)throw new Exception("No ordinary job available");
                p.jobs.jobQueue.EnqueueLast(job,JobTag.Misc);
                return "{\"job\":"+job.loadID+",\"def\":\""+job.def.defName+"\"}";
            }
            if(r.op=="lab-build-ration") {
                // Partial first delivery (case 7): isolate a nearby count-sized stack, but leave a
                // distant full-cost stack available so native resource admission still succeeds.
                if(p==null)throw new Exception("Unknown pawn");var def=DefDatabase<ThingDef>.GetNamedSilentFail(r.thing??"WoodLog");if(def==null)throw new Exception("Unknown def");
                var loose=p.Map.listerThings.ThingsOfDef(def).Where(t=>t.Spawned&&!t.IsInValidStorage()).ToList();
                var src=loose.OrderByDescending(t=>t.stackCount).FirstOrDefault();if(src==null||src.stackCount<r.count||r.count<1)throw new Exception("Not enough loose "+def.defName);
                var distant=loose.Where(t=>t!=src&&t.stackCount>=20&&t.Position.DistanceToSquared(p.Position)>=400).FirstOrDefault();
                if(distant==null)throw new Exception("Fixture needs a distant full-cost stack outside the five-cell pickup radius");
                foreach(var t in loose)t.SetForbidden(true,false);
                distant.SetForbidden(false,false);
                var part=src.SplitOff(r.count);part.SetForbidden(false,false);
                if(!GenPlace.TryPlaceThing(part,p.Position,p.Map,ThingPlaceMode.Near))throw new Exception("Could not place the ration");
                return "{\"ration\":"+r.count+",\"thing\":\""+part.GetUniqueLoadID()+"\",\"distant\":\""+distant.GetUniqueLoadID()+"\"}";
            }
            if(r.op=="lab-build-deconstruct-order") {
                // The player's ordinary deconstruct designator on the tagged blueprint/frame (case 7/12 contrast).
                var t=carrier();var d=new Designator_Deconstruct();var ok=d.CanDesignateThing(t);
                if(!ok.Accepted)throw new Exception("Deconstruct designator refused: "+ok.Reason);d.DesignateThing(t);return "{\"designated\":true}";
            }
            if(r.op=="lab-build-fault") {
                if(r.reason!="no-sweep"&&r.reason!="successor-absent"&&r.reason!="successor-ambiguous"&&r.reason!="completion-exception"&&r.reason!="none")throw new Exception("Unknown fault");
                fault=r.reason=="none"?null:r.reason;return "{\"fault\":\""+(fault??"none")+"\"}";
            }
            if(r.op=="lab-build-fail") {var f=carrier() as Frame;if(f==null)throw new Exception("Not a frame");f.FailConstruction(p??f.Map.mapPawns.FreeColonistsSpawned.First());return "{\"failed\":true}";}
            if(r.op=="lab-build-destroy") {
                var t=carrier();var mode=(DestroyMode)Enum.Parse(typeof(DestroyMode),r.reason);t.Destroy(mode);return "{\"destroyed\":\""+mode+"\"}";
            }
            if(r.op=="lab-build-replace") {
                // The player's build designator: cancel matching frames, wipe with Deconstruct, place.
                var t=carrier();var def=DefDatabase<ThingDef>.GetNamedSilentFail(r.thing);if(def==null)throw new Exception("Unknown def");
                var map=t.Map;var cell=t.Position;
                GenSpawn.WipeExistingThings(cell,Rot4.North,def.blueprintDef,map,DestroyMode.Deconstruct);
                var bp=GenConstruct.PlaceBlueprintForBuild(def,cell,map,Rot4.North,Faction.OfPlayer,null);
                return "{\"placed\":\""+bp.GetUniqueLoadID()+"\"}";
            }
            if(r.op=="lab-build-forbid") {var t=carrier();t.SetForbidden(r.count==1,false);return "{\"forbidden\":"+(r.count==1?"true":"false")+"}";}
            if(r.op=="lab-build-deconstruct") {
                if(i==null||!i.watchFate)throw new Exception("No standing building");var b=Carrier(i);if(b==null)throw new Exception("No building");
                b.Map.designationManager.AddDesignation(new Designation(b,DesignationDefOf.Deconstruct));return "{\"designated\":true}";
            }
            if(r.op=="lab-build-block") {
                // A blocking thing on the footprint (case 14): an item stack the conversion must wait for.
                var t=carrier();var def=DefDatabase<ThingDef>.GetNamedSilentFail(r.thing??"Steel");var s=ThingMaker.MakeThing(def);s.stackCount=Math.Max(1,r.count);
                GenPlace.TryPlaceThing(s,t.Position,t.Map,ThingPlaceMode.Direct);return "{\"blocker\":\""+s.GetUniqueLoadID()+"\"}";
            }
            if(r.op=="lab-build-blueprint") {
                // An untagged ordinary blueprint (cases 4 and 16) at a clear cell.
                if(p==null)throw new Exception("Unknown pawn");var def=DefDatabase<ThingDef>.GetNamedSilentFail(r.thing);var cell=new IntVec3(r.x,0,r.z);
                if(def==null||!GenConstruct.CanPlaceBlueprintAt(def,cell,Rot4.North,p.Map).Accepted)throw new Exception("Cannot place");
                var bp=GenConstruct.PlaceBlueprintForBuild(def,cell,p.Map,Rot4.North,Faction.OfPlayer,null);return "{\"blueprint\":\""+bp.GetUniqueLoadID()+"\"}";
            }
            if(r.op=="lab-build-priority") {
                // Work settings for a case: Construction and Hauling priorities (0 disables).
                if(p==null)throw new Exception("Unknown pawn");if(r.count<0||r.count>4||r.quota<0||r.quota>4)throw new Exception("Priority must be 0-4");
                p.workSettings.SetPriority(WorkTypeDefOf.Construction,r.count);p.workSettings.SetPriority(WorkTypeDefOf.Hauling,r.quota);
                return "{\"construction\":"+p.workSettings.GetPriority(WorkTypeDefOf.Construction)+",\"hauling\":"+p.workSettings.GetPriority(WorkTypeDefOf.Hauling)+"}";
            }
            if(r.op=="lab-build-site") {
                // Evidence: what stands on a cell (def, id, kind, frame contents).
                var smap=p!=null?p.Map:Find.CurrentMap;var cell=new IntVec3(r.x,0,r.z);
                var rows=cell.GetThingList(smap).Select(t=>"{\"def\":\""+t.def.defName+"\",\"id\":"+t.thingIDNumber+",\"load\":\""+t.GetUniqueLoadID()+"\",\"kind\":\""+(t is Blueprint?"blueprint":t is Frame?"frame":t.def.category.ToString())+"\",\"forbidden\":"+(t.IsForbidden(Faction.OfPlayer)?"true":"false")+(t is Frame?",\"held\":\""+Held((Frame)t)+"\",\"workDone\":"+((Frame)t).workDone.ToString("0.000",System.Globalization.CultureInfo.InvariantCulture)+",\"workToBuild\":"+((Frame)t).WorkToBuild.ToString("0.000",System.Globalization.CultureInfo.InvariantCulture):"")+"}").ToArray();
                return "{\"things\":["+String.Join(",",rows)+"]}";
            }
            if(r.op=="lab-build-spawn") {
                // A different building dropped onto a cell by a direct spawn (vanish wipe; case 8).
                var smap=p!=null?p.Map:Find.CurrentMap;var def=DefDatabase<ThingDef>.GetNamedSilentFail(r.thing);if(def==null)throw new Exception("Unknown def");
                var t=ThingMaker.MakeThing(def,def.MadeFromStuff?GenStuff.DefaultStuffFor(def):null);t.SetFaction(Faction.OfPlayer);
                GenSpawn.Spawn(t,new IntVec3(r.x,0,r.z),smap,WipeMode.Vanish);return "{\"spawned\":\""+t.GetUniqueLoadID()+"\"}";
            }
            if(r.op=="lab-build-designate") {
                // The player's real build designator at a cell (case 12: placing over a tagged frame).
                var def=DefDatabase<ThingDef>.GetNamedSilentFail(r.thing);if(def==null)throw new Exception("Unknown def");
                var d=new Designator_Build(def);var cell=new IntVec3(r.x,0,r.z);var ok=d.CanDesignateCell(cell);
                if(!ok.Accepted)throw new Exception("Designator refused: "+ok.Reason);d.DesignateSingleCell(cell);return "{\"designated\":true}";
            }
            if(r.op=="lab-build-cost"){if(r.count==0||r.count==1){BuildCost.Reset();BuildCost.timing=r.count==1;}return BuildCost.Json();}
            if(r.op=="lab-build-job") {
                // The pawn's current and queued jobs, with their Concord segments (evidence only).
                if(p==null)throw new Exception("Unknown pawn");
                Func<Job,string> row=j=>{BuildJob bj;jobs.TryGetValue(j.loadID,out bj);return "{\"job\":"+j.loadID+",\"def\":\""+j.def.defName+"\",\"forced\":"+(Forced(j)?"true":"false")+",\"segments\":"+(bj==null?0:bj.segments.Count(s=>s.open))+"}";};
                var queued=p.jobs.jobQueue==null?new string[0]:p.jobs.jobQueue.Select(q=>row(q.job)).ToArray();
                return "{\"current\":"+(p.CurJob==null?"null":row(p.CurJob))+",\"queued\":["+String.Join(",",queued)+"],\"carrying\":"+(p.carryTracker.CarriedThing==null?0:p.carryTracker.CarriedThing.stackCount)+"}";
            }
            throw new Exception("Unsupported lab operation");
        }
    }

    /** Defs a construction intent may target (configuration; decision 9: campfire for Gate C). */
    public static class BuildDefs {
        public static readonly List<string> allowed=new List<string>{"Campfire"};
        public static bool Allowed(ThingDef d){return d!=null&&allowed.Contains(d.defName);}
    }
}
