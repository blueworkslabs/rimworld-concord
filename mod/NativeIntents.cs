using System;
using System.Collections.Generic;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;
using Verse.AI;

namespace Concord {
    // A tagged stockpile that pawns fill through their own work givers
    // (docs/SPIKE_NATIVE_HAUL.md). Patches read this state only; no model call.
    public class HaulIntent : IExposable {
        public string intentId,thingDef,variant="attribution",status="open";
        public int mapId=-1,zoneId=-1,quota,credited,overshoot,incidental,unattributed,removed;
        public int violations,rejectedStarts,finishedAfterExclusion,createdTick,untilTick,lastDeliveryTick=-1;
        public int zoneCount=-1,arrivalsSinceCount;
        public List<string> accepted=new List<string>(),excluded=new List<string>();
        public List<int> excludedTicks=new List<int>();
        public Dictionary<int,int> reserved=new Dictionary<int,int>();
        public Dictionary<int,string> reservedBy=new Dictionary<int,string>();
        public Dictionary<string,int> byPawn=new Dictionary<string,int>();
        public List<IntentDrop> drops=new List<IntentDrop>();
        public bool Open {get{return status=="open";}}
        public int Reserved {get{return reserved.Values.Sum();}}
        public int Remaining {get{return quota-credited-Reserved;}}
        public int Own(Job job) {int n;return job!=null&&reserved.TryGetValue(job.loadID,out n)?n:0;}
        public int ExcludedAt(string pawn) {int i=excluded.IndexOf(pawn);return i<0?-1:excludedTicks[i];}
        public bool Standing(Pawn p) {
            if(p==null) return true;
            var id=p.GetUniqueLoadID();
            if(excluded.Contains(id)) return false;
            return variant!="exclusive"||accepted.Contains(id);
        }
        public void ExposeData() {
            Scribe_Values.Look(ref intentId,"intentId");Scribe_Values.Look(ref thingDef,"thingDef");
            Scribe_Values.Look(ref variant,"variant");Scribe_Values.Look(ref status,"status");
            Scribe_Values.Look(ref mapId,"mapId",-1);Scribe_Values.Look(ref zoneId,"zoneId",-1);
            Scribe_Values.Look(ref quota,"quota");Scribe_Values.Look(ref credited,"credited");
            Scribe_Values.Look(ref overshoot,"overshoot");Scribe_Values.Look(ref incidental,"incidental");
            Scribe_Values.Look(ref unattributed,"unattributed");Scribe_Values.Look(ref removed,"removed");
            Scribe_Values.Look(ref violations,"violations");Scribe_Values.Look(ref rejectedStarts,"rejectedStarts");
            Scribe_Values.Look(ref finishedAfterExclusion,"finishedAfterExclusion");
            Scribe_Values.Look(ref createdTick,"createdTick");Scribe_Values.Look(ref untilTick,"untilTick");
            Scribe_Values.Look(ref lastDeliveryTick,"lastDeliveryTick",-1);
            Scribe_Values.Look(ref zoneCount,"zoneCount",-1);Scribe_Values.Look(ref arrivalsSinceCount,"arrivalsSinceCount");
            Scribe_Collections.Look(ref accepted,"accepted",LookMode.Value);
            Scribe_Collections.Look(ref excluded,"excluded",LookMode.Value);
            Scribe_Collections.Look(ref excludedTicks,"excludedTicks",LookMode.Value);
            Scribe_Collections.Look(ref reserved,"reserved",LookMode.Value,LookMode.Value);
            Scribe_Collections.Look(ref reservedBy,"reservedBy",LookMode.Value,LookMode.Value);
            Scribe_Collections.Look(ref byPawn,"byPawn",LookMode.Value,LookMode.Value);
            Scribe_Collections.Look(ref drops,"drops",LookMode.Deep);
            if(Scribe.mode==LoadSaveMode.PostLoadInit) {
                if(accepted==null)accepted=new List<string>();
                if(excluded==null)excluded=new List<string>();
                if(excludedTicks==null)excludedTicks=new List<int>();
                if(reserved==null)reserved=new Dictionary<int,int>();
                if(reservedBy==null)reservedBy=new Dictionary<int,string>();
                if(byPawn==null)byPawn=new Dictionary<string,int>();
                if(drops==null)drops=new List<IntentDrop>();
            }
        }
    }
    [Serializable] public class IntentDrop : IExposable {
        // kind: participation, incidental, unattributed, removed
        public int seq,tick,count,escape,job=-1;
        public string kind,pawn,source;
        public bool startedBeforeExclusion,violation;
        public void ExposeData() {
            Scribe_Values.Look(ref seq,"seq");Scribe_Values.Look(ref tick,"tick");Scribe_Values.Look(ref count,"count");
            Scribe_Values.Look(ref escape,"escape");Scribe_Values.Look(ref job,"job",-1);
            Scribe_Values.Look(ref kind,"kind");Scribe_Values.Look(ref pawn,"pawn");Scribe_Values.Look(ref source,"source");
            Scribe_Values.Look(ref startedBeforeExclusion,"startedBeforeExclusion");Scribe_Values.Look(ref violation,"violation");
        }
    }
    [Serializable] public class PawnCredit {public string pawn;public int count;}
    [Serializable] public class IntentView {
        public string intentId,thingDef,variant,status;
        public int zoneId,quota,delivered,reserved,remaining,overshoot,incidental,unattributed,removed;
        public int violations,rejectedStarts,finishedAfterExclusion,createdTick,untilTick,lastDeliveryTick;
        public string[] accepted,excluded;
    }

    public class IntentState : GameComponent {
        public List<HaulIntent> intents=new List<HaulIntent>();
        public int dropSeq;
        // Lab-only fault injection: the next tagged job skips admission (escape detector check).
        public bool faultSkipNext;
        public string faultPawn;
        public bool FaultFor(Pawn p) {return faultSkipNext&&p!=null&&p.GetUniqueLoadID()==faultPawn;}
        private bool reconcileAfterLoad;
        public IntentState(Game game) { }
        public static IntentState Get() {return Current.Game==null?null:Current.Game.GetComponent<IntentState>();}
        public override void ExposeData() {
            Scribe_Collections.Look(ref intents,"concordIntents",LookMode.Deep);
            Scribe_Values.Look(ref dropSeq,"concordIntentDropSeq");
            if(intents==null)intents=new List<HaulIntent>();
            if(Scribe.mode==LoadSaveMode.PostLoadInit)reconcileAfterLoad=true;
        }
        public HaulIntent ById(string id) {return intents.FirstOrDefault(i=>i.intentId==id);}
        public static HaulIntent ForZone(Zone z) {
            var s=Get();
            if(s==null||z==null) return null;
            for(int k=0;k<s.intents.Count;k++){var i=s.intents[k];if(i.Open&&i.zoneId==z.ID&&i.mapId==z.Map.uniqueID)return i;}
            return null;
        }
        public static HaulIntent ForCell(Map map,IntVec3 c) {
            if(map==null||!c.IsValid||!c.InBounds(map)) return null;
            var s=Get();
            if(s==null||s.intents.Count==0) return null;
            return ForZone(map.zoneManager.ZoneAt(c) as Zone_Stockpile);
        }
        // Pure admission check: no side effects (storage searches also run speculatively).
        public static bool Admits(HaulIntent i,Pawn p,int carried,Job own) {
            var s=Get();
            if(!i.Standing(p)) return false;
            if(s!=null&&s.FaultFor(p)) return true;
            int avail=i.Remaining+i.Own(own);
            return carried>0?carried<=avail:avail>=1;
        }
        public static int CarriedFor(Pawn p,Thing t) {
            if(p==null) return 0;
            var c=p.carryTracker.CarriedThing;
            if(c==null) return 0;
            if(t==null||c==t||c.def==t.def) return c.stackCount;
            return 0;
        }
        private static WorldState World() {return Current.Game.GetComponent<WorldState>();}
        public void Emit(Pawn p,string kind,string detail,string subject="") {World().Emit(p==null?"":p.GetUniqueLoadID(),kind,detail,subject);}
        private void Record(HaulIntent i,IntentDrop d) {
            d.seq=++dropSeq;d.tick=Find.TickManager.TicksGame;
            i.drops.Add(d);if(i.drops.Count>64)i.drops.RemoveAt(0);
        }

        // Ledger: only a pawn's CurJob owns a reservation.
        public void Reserve(HaulIntent i,Pawn p,Job job,int count) {
            i.reserved[job.loadID]=Math.Max(0,count);
            i.reservedBy[job.loadID]=p.GetUniqueLoadID();
        }
        public void Release(Job job) {
            if(job==null) return;
            foreach(var i in intents){i.reserved.Remove(job.loadID);i.reservedBy.Remove(job.loadID);}
        }
        public void ReleaseObsolete(Pawn p) {
            var id=p.GetUniqueLoadID();var cur=p.CurJob==null?-1:p.CurJob.loadID;
            foreach(var i in intents) {
                var stale=i.reservedBy.Where(kv=>kv.Value==id&&kv.Key!=cur).Select(kv=>kv.Key).ToList();
                foreach(var j in stale){i.reserved.Remove(j);i.reservedBy.Remove(j);}
            }
        }
        public HaulIntent Holding(Job job) {
            if(job==null) return null;
            return intents.FirstOrDefault(i=>i.reserved.ContainsKey(job.loadID));
        }

        // Called from the wrapped placedAction for every placement of a carried drop.
        public void Placed(Pawn p,Thing th,int n,Job participation,string source) {
            if(th==null||n<=0) return;
            var i=ForCell(th.MapHeld,th.PositionHeld);
            if(i==null) return;
            if(th.def.defName==i.thingDef)i.arrivalsSinceCount+=n;
            var pid=p==null?"":p.GetUniqueLoadID();
            if(participation==null||th.def.defName!=i.thingDef) {
                i.incidental+=n;
                Record(i,new IntentDrop {kind="incidental",pawn=pid,count=n,source=source});
                Emit(p,"intent-incidental","intent="+i.intentId+";count="+n+";source="+source);
                return;
            }
            int own=i.Own(participation),covered=Math.Min(n,own),escape=n-covered;
            if(own-covered>0)i.reserved[participation.loadID]=own-covered;
            else {i.reserved.Remove(participation.loadID);i.reservedBy.Remove(participation.loadID);}
            i.credited+=n;
            int prior;i.byPawn.TryGetValue(pid,out prior);i.byPawn[pid]=prior+n;
            i.lastDeliveryTick=Find.TickManager.TicksGame;
            int exAt=i.ExcludedAt(pid);
            bool before=exAt>=0&&participation.startTick<=exAt;
            bool violation=(exAt>=0&&!before)||(exAt<0&&i.variant=="exclusive"&&!i.accepted.Contains(pid));
            if(before)i.finishedAfterExclusion++;
            if(violation)i.violations++;
            Record(i,new IntentDrop {kind="participation",pawn=pid,count=n,escape=escape,job=participation.loadID,source=source,startedBeforeExclusion=before,violation=violation});
            Emit(p,"haul-delivered","intent="+i.intentId+";count="+n+";delivered="+i.credited+";quota="+i.quota+(before?";startedBeforeExclusion":"")+(violation?";violation":""));
            if(escape>0) {
                i.overshoot+=escape;
                Emit(p,"quota-escape","intent="+i.intentId+";job="+participation.loadID+";count="+escape+";source="+source);
            }
            if(i.credited>=i.quota)Retire(i,"met");
        }
        public void Spawned(Zone_Stockpile z,Thing th) {
            var i=ForZone(z);
            if(i==null||th==null) return;
            if(th.def.defName==i.thingDef)i.arrivalsSinceCount+=th.stackCount;
            i.unattributed+=th.stackCount;
            Record(i,new IntentDrop {kind="unattributed",count=th.stackCount,source="spawn"});
            Emit(null,"intent-incidental","intent="+i.intentId+";count="+th.stackCount+";source=spawn");
        }
        public static int Count(HaulIntent i) {
            var map=Find.Maps.FirstOrDefault(m=>m.uniqueID==i.mapId);
            var zone=map==null?null:map.zoneManager.AllZones.FirstOrDefault(z=>z.ID==i.zoneId);
            if(zone==null) return 0;
            int n=0;
            foreach(var c in zone.cells)foreach(var t in c.GetThingList(map))if(t.def.defName==i.thingDef)n+=t.stackCount;
            return n;
        }
        // Net-change reconciliation: catches merges and anything no hook saw.
        public void ReconcileCounts(HaulIntent i) {
            int now=Count(i);
            if(i.zoneCount>=0) {
                int delta=now-i.zoneCount-i.arrivalsSinceCount;
                if(delta>0){i.unattributed+=delta;Record(i,new IntentDrop {kind="unattributed",count=delta,source="reconcile"});Emit(null,"intent-incidental","intent="+i.intentId+";count="+delta+";source=reconcile");}
                else if(delta<0){i.removed+=-delta;Record(i,new IntentDrop {kind="removed",count=-delta,source="reconcile"});Emit(null,"intent-incidental","intent="+i.intentId+";count="+delta+";source=reconcile-removed");}
            }
            i.zoneCount=now;i.arrivalsSinceCount=0;
        }
        public void Retire(HaulIntent i,string status) {
            if(!i.Open) return;
            ReconcileCounts(i);
            i.status=status;i.reserved.Clear();i.reservedBy.Clear();
            Emit(null,"intent-retired","intent="+i.intentId+";status="+status+";delivered="+i.credited+";quota="+i.quota);
        }
        public override void GameComponentTick() {
            if(intents.Count==0) return;
            int now=Find.TickManager.TicksGame;
            if(reconcileAfterLoad) {
                reconcileAfterLoad=false;
                // Reservations whose job is no longer some pawn's CurJob are dropped.
                var running=new HashSet<int>(Find.Maps.SelectMany(m=>m.mapPawns.AllPawnsSpawned).Where(p=>p.CurJob!=null).Select(p=>p.CurJob.loadID));
                foreach(var i in intents)foreach(var j in i.reserved.Keys.Where(k=>!running.Contains(k)).ToList()){i.reserved.Remove(j);i.reservedBy.Remove(j);}
            }
            foreach(var i in intents.Where(x=>x.Open).ToList()) {
                if(now>=i.untilTick){Retire(i,"expired");continue;}
                if(now%250==0)ReconcileCounts(i);
            }
        }

        // Operator/coordinator operations.
        public HaulIntent Accept(Request r) {
            var p=WorldState.FindActor(r.actor);
            if(p==null) throw new Exception("Unknown pawn");
            var i=ById(r.intentId);
            var pending=i!=null&&i.status=="pending"?i:null;
            if(i!=null&&pending==null) {
                if(!i.Open) throw new Exception("Intent is "+i.status);
                if(i.excluded.Contains(r.actor)) throw new Exception("Pawn is excluded; a change of mind is a new offer");
                if(!i.accepted.Contains(r.actor))i.accepted.Add(r.actor);
                return i;
            }
            var def=DefDatabase<ThingDef>.GetNamedSilentFail(r.thing);
            if(def==null||!def.EverHaulable) throw new Exception("Unknown haulable def");
            if(r.quota<1||r.quota>75) throw new Exception("Quota must be 1-75");
            if(r.maxTicks<600||r.maxTicks>60000) throw new Exception("maxTicks must be 600-60000");
            if(r.variant!="exclusive"&&r.variant!="attribution") throw new Exception("Unknown variant");
            if(r.w<1||r.h<1||r.w*r.h>64) throw new Exception("Area must be 1-64 cells");
            var map=p.Map;
            var zone=new Zone_Stockpile(StorageSettingsPreset.DefaultStockpile,map.zoneManager);
            map.zoneManager.RegisterZone(zone);
            for(int dx=0;dx<r.w;dx++)for(int dz=0;dz<r.h;dz++) {
                var c=new IntVec3(r.x+dx,0,r.z+dz);
                if(c.InBounds(map)&&map.zoneManager.ZoneAt(c)==null&&c.Standable(map)&&!c.Fogged(map))zone.AddCell(c);
            }
            if(zone.cells.Count==0){zone.Delete();throw new Exception("Candidate area has no usable cells");}
            zone.settings.filter.SetDisallowAll();
            zone.settings.filter.SetAllow(def,true);
            zone.settings.Priority=StoragePriority.Important;
            if(pending!=null&&pending.excluded.Contains(r.actor)){zone.Delete();throw new Exception("Pawn is excluded; a change of mind is a new offer");}
            i=pending??new HaulIntent {intentId=r.intentId};
            i.thingDef=def.defName;i.variant=r.variant;i.quota=r.quota;i.mapId=map.uniqueID;i.zoneId=zone.ID;i.status="open";
            i.createdTick=Find.TickManager.TicksGame;i.untilTick=Find.TickManager.TicksGame+r.maxTicks;
            i.accepted.Add(r.actor);
            if(pending==null)intents.Add(i);
            i.zoneCount=Count(i);
            Emit(p,"intent-opened","intent="+i.intentId+";zone="+zone.ID+";cells="+zone.cells.Count+";quota="+i.quota+";variant="+i.variant);
            return i;
        }
        public HaulIntent Exclude(Request r) {
            var i=ById(r.intentId);
            // Refusal before the first acceptance: recorded now, binding once the zone exists.
            if(i==null){i=new HaulIntent {intentId=r.intentId,status="pending"};intents.Add(i);}
            if(!i.excluded.Contains(r.actor)){i.excluded.Add(r.actor);i.excludedTicks.Add(Find.TickManager.TicksGame);}
            i.accepted.Remove(r.actor);
            var p=WorldState.FindActor(r.actor);
            if(p!=null&&i.Open) {
                var map=p.Map;
                Func<Job,bool> targets=j=>j!=null&&j.def==JobDefOf.HaulToCell&&ForCell(map,j.targetB.Cell)==i;
                // Queued jobs never hold reservations: removing them changes nothing in the ledger.
                p.jobs.jobQueue.RemoveAll(p,j=>targets(j));
                // Not carrying yet: end it (nothing to drop). Carrying: the trip finishes, flagged.
                if(targets(p.CurJob)&&!p.IsCarrying())p.jobs.EndCurrentJob(JobCondition.InterruptForced);
            }
            Emit(p,"intent-excluded","intent="+i.intentId+";reason="+(r.reason??""));
            return i;
        }
        public string Json() {
            return "["+String.Join(",",intents.Select(i=>JsonUtility.ToJson(new IntentView {
                intentId=i.intentId,thingDef=i.thingDef,variant=i.variant,status=i.status,zoneId=i.zoneId,quota=i.quota,
                delivered=i.credited,reserved=i.Reserved,remaining=i.Remaining,overshoot=i.overshoot,incidental=i.incidental,
                unattributed=i.unattributed,removed=i.removed,violations=i.violations,rejectedStarts=i.rejectedStarts,
                finishedAfterExclusion=i.finishedAfterExclusion,createdTick=i.createdTick,untilTick=i.untilTick,lastDeliveryTick=i.lastDeliveryTick,
                accepted=i.accepted.ToArray(),excluded=i.excluded.ToArray()
            }).TrimEnd('}')+",\"byPawn\":["+
                String.Join(",",i.byPawn.Select(kv=>JsonUtility.ToJson(new PawnCredit {pawn=kv.Key,count=kv.Value})).ToArray())+
                "],\"drops\":["+String.Join(",",i.drops.Select(d=>JsonUtility.ToJson(d)).ToArray())+"]}").ToArray())+"]";
        }

        // Lab-only commands for the scripted sub-runs.
        public string Lab(Request r) {
            var p=WorldState.FindActor(r.actor);
            if(r.op=="lab-fault-escape"){if(p==null)throw new Exception("Unknown pawn");faultSkipNext=true;faultPawn=r.actor;return "{\"fault\":\"armed\"}";}
            if(r.op=="lab-interrupt") {
                // Forced cancellation of the pawn's current job (cleanup drops are incidental).
                if(p==null) throw new Exception("Unknown pawn");
                var cur=p.CurJob;
                if(cur!=null)p.jobs.EndCurrentJob(JobCondition.InterruptForced);
                return "{\"ended\":"+(cur==null?"null":"\""+cur.def.defName+"\"")+",\"x\":"+p.Position.x+",\"z\":"+p.Position.z+"}";
            }
            if(r.op=="lab-queue-count") {
                if(p==null) throw new Exception("Unknown pawn");
                var q=p.jobs.jobQueue.Select(j=>j.job).Where(j=>j!=null&&j.def==JobDefOf.HaulToCell).ToList();
                return "{\"queued\":"+q.Count+",\"tagged\":"+q.Count(j=>ForCell(p.Map,j.targetB.Cell)!=null)+"}";
            }
            var i=ById(r.intentId);
            if(i==null) throw new Exception("Unknown intent");
            var map=Find.Maps.First(m=>m.uniqueID==i.mapId);
            var zone=map.zoneManager.AllZones.First(z=>z.ID==i.zoneId);
            var def=DefDatabase<ThingDef>.GetNamed(i.thingDef);
            if(r.op=="lab-haul-candidate") {
                if(p==null) throw new Exception("Unknown pawn");
                int before=i.Remaining;
                var thing=map.listerThings.ThingsOfDef(def).FirstOrDefault(t=>t.Spawned&&!(map.zoneManager.ZoneAt(t.Position)==zone));
                if(thing==null) throw new Exception("No loose stack");
                var job=HaulAIUtility.HaulToStorageJob(p,thing,false);
                bool made=job!=null;
                if(job!=null)JobMaker.ReturnToPool(job);
                return "{\"made\":"+(made?"true":"false")+",\"remainingBefore\":"+before+",\"remainingAfter\":"+i.Remaining+"}";
            }
            if(r.op=="lab-queue-haul"||r.op=="lab-carry") {
                if(p==null) throw new Exception("Unknown pawn");
                var loose=map.listerThings.ThingsOfDef(def).Where(t=>t.Spawned&&map.zoneManager.ZoneAt(t.Position)!=zone)
                    .OrderBy(t=>(t.Position-p.Position).LengthHorizontalSquared).FirstOrDefault();
                if(loose==null) throw new Exception("No loose stack");
                if(r.op=="lab-carry") {
                    // Pre-carried load for re-target cases: picked up outside any job.
                    int n=p.carryTracker.TryStartCarry(loose,Math.Max(1,Math.Min(r.count,loose.stackCount)),false);
                    return "{\"carried\":"+n+"}";
                }
                // A tagged haul queued (not started): bypasses the factory's admission on purpose.
                var queued=HaulAIUtility.HaulToCellStorageJob(p,loose,zone.cells.First(),false);
                if(queued==null)throw new Exception("No haul job");
                if(r.count>0)queued.count=Math.Min(queued.count,r.count);
                p.jobs.jobQueue.EnqueueLast(queued);
                return "{\"queuedJob\":"+queued.loadID+",\"count\":"+queued.count+"}";
            }
            if(r.op=="lab-zone-spawn") {
                var cell=zone.cells.Where(c=>c.GetFirstItem(map)==null).DefaultIfEmpty(IntVec3.Invalid).First();
                if(!cell.IsValid) throw new Exception("No empty zone cell");
                var t=ThingMaker.MakeThing(def);t.stackCount=Math.Max(1,Math.Min(r.count,def.stackLimit));
                GenSpawn.Spawn(t,cell,map);
                return "{\"spawned\":"+t.stackCount+"}";
            }
            if(r.op=="lab-zone-merge") {
                var stack=zone.cells.Select(c=>c.GetFirstThing(map,def)).FirstOrDefault(t=>t!=null&&t.stackCount<def.stackLimit);
                if(stack==null) throw new Exception("No partial stack in zone");
                int add=Math.Max(1,Math.Min(r.count,def.stackLimit-stack.stackCount));
                stack.stackCount+=add;
                return "{\"merged\":"+add+"}";
            }
            throw new Exception("Unsupported lab operation");
        }
    }
}
