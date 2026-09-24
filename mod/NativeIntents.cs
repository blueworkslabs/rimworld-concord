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
        public int zoneCount=-1,arrivalsSinceCount,peakHolders;
        // Migration (docs/MIGRATION_HAULING.md): hold mode, stockpile source, presentation,
        // stop reason, the after-retirement archive and the durable per-job trip budget.
        public string hold="strict",siteId,label,origLabel,stopReason;
        public bool createdZone,archiveOpen,presenting;
        public float origR,origG,origB,origA;
        public int ordinaryUnattributed,ordinaryRemoved;
        public Dictionary<string,int> ordinaryByPawn=new Dictionary<string,int>();
        public Dictionary<int,int> tripBudget=new Dictionary<int,int>();
        public ThingDef Def {get{return DefDatabase<ThingDef>.GetNamedSilentFail(thingDef);}}
        public bool Growing {get{return hold=="growing";}}
        public int Trip(Job job){int n;return job!=null&&tripBudget.TryGetValue(job.loadID,out n)?n:0;}
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
            Scribe_Values.Look(ref zoneCount,"zoneCount",-1);Scribe_Values.Look(ref arrivalsSinceCount,"arrivalsSinceCount");Scribe_Values.Look(ref peakHolders,"peakHolders");
            Scribe_Collections.Look(ref accepted,"accepted",LookMode.Value);
            Scribe_Collections.Look(ref excluded,"excluded",LookMode.Value);
            Scribe_Collections.Look(ref excludedTicks,"excludedTicks",LookMode.Value);
            Scribe_Collections.Look(ref reserved,"reserved",LookMode.Value,LookMode.Value);
            Scribe_Collections.Look(ref reservedBy,"reservedBy",LookMode.Value,LookMode.Value);
            Scribe_Collections.Look(ref byPawn,"byPawn",LookMode.Value,LookMode.Value);
            Scribe_Collections.Look(ref drops,"drops",LookMode.Deep);
            Scribe_Values.Look(ref hold,"hold","strict");Scribe_Values.Look(ref siteId,"siteId");Scribe_Values.Look(ref label,"label");
            Scribe_Values.Look(ref origLabel,"origLabel");Scribe_Values.Look(ref stopReason,"stopReason");
            Scribe_Values.Look(ref createdZone,"createdZone");Scribe_Values.Look(ref archiveOpen,"archiveOpen");Scribe_Values.Look(ref presenting,"presenting");
            Scribe_Values.Look(ref origR,"origR");Scribe_Values.Look(ref origG,"origG");Scribe_Values.Look(ref origB,"origB");Scribe_Values.Look(ref origA,"origA");
            Scribe_Values.Look(ref ordinaryUnattributed,"ordinaryUnattributed");Scribe_Values.Look(ref ordinaryRemoved,"ordinaryRemoved");
            Scribe_Collections.Look(ref ordinaryByPawn,"ordinaryByPawn",LookMode.Value,LookMode.Value);
            Scribe_Collections.Look(ref tripBudget,"tripBudget",LookMode.Value,LookMode.Value);
            if(Scribe.mode==LoadSaveMode.PostLoadInit) {
                if(ordinaryByPawn==null)ordinaryByPawn=new Dictionary<string,int>();
                if(tripBudget==null)tripBudget=new Dictionary<int,int>();
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
        public int violations,rejectedStarts,finishedAfterExclusion,createdTick,untilTick,lastDeliveryTick,peakHolders;
        public string hold,label,zoneLabel,siteId,stopReason;public bool archiveOpen;public int ordinaryUnattributed,ordinaryRemoved;
        public string[] accepted,excluded;
    }

    /** B6: in-game clock beside ticks ("Day 3, 14h (t2552)"), from the map's longitude. */
    public static class Clock {
        public static string At(int tick,Map map=null) {
            map=map??Find.CurrentMap;
            if(map==null) return "t"+tick;
            var ll=Find.WorldGrid.LongLatOf(map.Tile);
            int hour=GenDate.HourOfDay(GenDate.TickGameToAbs(tick),ll.x);
            return "Day "+(tick/GenDate.TicksPerDay+1)+", "+hour+"h (t"+tick+")";
        }
    }
    /** B6: the crew log's "show" button jumps to the tagged stockpile, or says it is gone. */
    public static class ShowZone {
        public static bool Available(string intentId,out Zone_Stockpile zone) {
            zone=null;var s=IntentState.Get();var i=s==null?null:s.ById(intentId);
            if(i==null) return false;
            zone=IntentState.ZoneOf(i);return true;
        }
        public static void Jump(Zone_Stockpile z) {
            if(z==null||z.cells.Count==0) return;
            float cx=(float)z.cells.Average(c=>c.x),cz=(float)z.cells.Average(c=>c.z);
            var cell=z.cells.OrderBy(c=>(c.x-cx)*(c.x-cx)+(c.z-cz)*(c.z-cz)).First();
            CameraJumper.TryJump(cell,z.Map);
        }
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
        // Every lookup is keyed on (map, zone, def): other items in a shared zone are ignored.
        public static HaulIntent ForZone(Zone z,ThingDef def) {
            var s=Get();
            if(s==null||z==null||def==null) return null;
            for(int k=0;k<s.intents.Count;k++){var i=s.intents[k];if(i.Open&&i.zoneId==z.ID&&i.mapId==z.Map.uniqueID&&i.thingDef==def.defName)return i;}
            return null;
        }
        public static HaulIntent ForCell(Map map,IntVec3 c,ThingDef def) {
            if(map==null||def==null||!c.IsValid||!c.InBounds(map)) return null;
            var s=Get();
            if(s==null||s.intents.Count==0) return null;
            return ForZone(map.zoneManager.ZoneAt(c) as Zone_Stockpile,def);
        }
        /** The retired intent whose archive still counts ordinary work for (map, zone, def). */
        public static HaulIntent ArchiveFor(Map map,IntVec3 c,ThingDef def) {
            if(map==null||def==null||!c.IsValid||!c.InBounds(map)) return null;
            var s=Get();var z=map.zoneManager.ZoneAt(c) as Zone_Stockpile;
            if(s==null||z==null) return null;
            for(int k=s.intents.Count-1;k>=0;k--){var i=s.intents[k];if(!i.Open&&i.archiveOpen&&i.zoneId==z.ID&&i.mapId==map.uniqueID&&i.thingDef==def.defName)return i;}
            return null;
        }
        public static Zone_Stockpile ZoneOf(HaulIntent i) {
            var map=Find.Maps.FirstOrDefault(m=>m.uniqueID==i.mapId);
            return map==null?null:map.zoneManager.AllZones.FirstOrDefault(z=>z.ID==i.zoneId) as Zone_Stockpile;
        }
        /** Free destination capacity for def in the target's slot group (or its linked storage
         * group), using the game's own good-cell and stack-space checks, minus own cargo. */
        public static int DestinationSpace(Pawn p,IntVec3 cell,Thing sample) {
            var map=p.Map;var sg=map.haulDestinationManager.SlotGroupAt(cell);
            if(sg==null||sample==null) return 0;
            ISlotGroup group=sg.StorageGroup;if(group==null)group=sg;
            int n=0;
            foreach(var c in group.CellsList)if(StoreUtility.IsGoodStoreCell(c,map,sample,p,p.Faction))n+=c.GetItemStackSpaceLeftFor(map,sample.def);
            var carried=p.carryTracker.CarriedThing;
            if(carried!=null&&carried.def==sample.def)n-=carried.stackCount;
            return Math.Max(0,n);
        }
        // Defence in depth: the ledger must never promise more than the quota.
        public void AssertLedger(HaulIntent i,Pawn p,string where) {
            if(i.credited+i.Reserved>i.quota&&!FaultFor(p))Emit(p,"intent-ledger-violation","intent="+i.intentId+";at="+where+";credited="+i.credited+";held="+i.Reserved+";quota="+i.quota);
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
            // Overlap evidence: how many pawns held in-flight quota at the same time.
            i.peakHolders=Math.Max(i.peakHolders,i.reservedBy.Where(kv=>i.reserved.ContainsKey(kv.Key)&&i.reserved[kv.Key]>0).Select(kv=>kv.Value).Distinct().Count());
        }
        public void Release(Job job) {
            if(job==null) return;
            foreach(var i in intents){i.reserved.Remove(job.loadID);i.reservedBy.Remove(job.loadID);i.tripBudget.Remove(job.loadID);}
        }
        public void ReleaseObsolete(Pawn p) {
            var id=p.GetUniqueLoadID();var cur=p.CurJob==null?-1:p.CurJob.loadID;
            foreach(var i in intents) {
                var stale=i.reservedBy.Where(kv=>kv.Value==id&&kv.Key!=cur).Select(kv=>kv.Key).ToList();
                foreach(var j in stale){i.reserved.Remove(j);i.reservedBy.Remove(j);i.tripBudget.Remove(j);}
            }
        }
        public HaulIntent Holding(Job job) {
            if(job==null) return null;
            return intents.FirstOrDefault(i=>i.reserved.ContainsKey(job.loadID));
        }

        // Called from the wrapped placedAction for every placement of a carried drop.
        public void Placed(Pawn p,Thing th,int n,Job participation,string source) {
            if(th==null||n<=0) return;
            var pid=p==null?"":p.GetUniqueLoadID();
            var i=ForCell(th.MapHeld,th.PositionHeld,th.def);
            if(i==null) {
                // After retirement: ordinary work, counted per pawn, never credit.
                var a=ArchiveFor(th.MapHeld,th.PositionHeld,th.def);
                if(a==null) return;
                a.arrivalsSinceCount+=n;
                if(p!=null){int o;a.ordinaryByPawn.TryGetValue(pid,out o);a.ordinaryByPawn[pid]=o+n;}else a.ordinaryUnattributed+=n;
                Record(a,new IntentDrop {kind="ordinary",pawn=pid,count=n,source=source});
                Emit(p,"intent-ordinary","intent="+a.intentId+";count="+n+";source="+source);
                return;
            }
            i.arrivalsSinceCount+=n;
            if(participation==null) {
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
            if(th==null) return;
            var i=ForZone(z,th.def);
            if(i==null) {
                var a=th.Spawned?ArchiveFor(th.Map,th.Position,th.def):null;
                if(a==null) return;
                a.arrivalsSinceCount+=th.stackCount;a.ordinaryUnattributed+=th.stackCount;
                Record(a,new IntentDrop {kind="ordinary",count=th.stackCount,source="spawn"});
                return;
            }
            i.arrivalsSinceCount+=th.stackCount;
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
            if(i.zoneCount>=0&&!i.Open) {
                // Archive: positive unexplained change is ordinary unattributed; negative is removal.
                int d=now-i.zoneCount-i.arrivalsSinceCount;
                if(d>0){i.ordinaryUnattributed+=d;Record(i,new IntentDrop {kind="ordinary",count=d,source="reconcile"});}
                else if(d<0){i.ordinaryRemoved+=-d;Record(i,new IntentDrop {kind="removed",count=-d,source="reconcile"});}
                i.zoneCount=now;i.arrivalsSinceCount=0;return;
            }
            if(i.zoneCount>=0) {
                int delta=now-i.zoneCount-i.arrivalsSinceCount;
                if(delta>0){i.unattributed+=delta;Record(i,new IntentDrop {kind="unattributed",count=delta,source="reconcile"});Emit(null,"intent-incidental","intent="+i.intentId+";count="+delta+";source=reconcile");}
                else if(delta<0){i.removed+=-delta;Record(i,new IntentDrop {kind="removed",count=-delta,source="reconcile"});Emit(null,"intent-incidental","intent="+i.intentId+";count="+delta+";source=reconcile-removed");}
            }
            i.zoneCount=now;i.arrivalsSinceCount=0;
        }
        public void Retire(HaulIntent i,string status,string reason=null) {
            if(!i.Open) return;
            var zone=ZoneOf(i);
            if(zone!=null)ReconcileCounts(i);
            i.status=status;i.stopReason=reason;i.reserved.Clear();i.reservedBy.Clear();i.tripBudget.Clear();
            // The archive keeps counting ordinary work here until the zone goes or is re-tagged.
            i.archiveOpen=zone!=null;i.zoneCount=zone!=null?Count(i):-1;i.arrivalsSinceCount=0;
            Unpresent(i,zone);
            Emit(null,"intent-retired","intent="+i.intentId+";status="+status+";delivered="+i.credited+";quota="+i.quota+(reason!=null?";reason="+reason:""));
        }
        // Presentation (B6): readable label and distinct colour while open; restored when the
        // last open tag on the zone retires. Material refreshed and zone mesh dirtied.
        static readonly System.Reflection.FieldInfo zoneMaterial=HarmonyLib.AccessTools.Field(typeof(Zone),"materialInt");
        static void Redraw(Zone z){zoneMaterial.SetValue(z,null);foreach(var c in z.cells)z.Map.mapDrawer.MapMeshDirty(c,MapMeshFlagDefOf.Zone);}
        public void Present(HaulIntent i,Zone_Stockpile z) {
            var holder=intents.FirstOrDefault(x=>x!=i&&x.Open&&x.presenting&&x.zoneId==z.ID&&x.mapId==i.mapId);
            if(holder==null){i.presenting=true;i.origLabel=z.label;i.origR=z.color.r;i.origG=z.color.g;i.origB=z.color.b;i.origA=z.color.a;}
            var defs=intents.Where(x=>x.Open&&x.zoneId==z.ID&&x.mapId==i.mapId).Select(x=>x.Def==null?x.thingDef:x.Def.label).Distinct();
            z.label="Shared: "+(i.label??z.label)+" ("+String.Join(", ",defs.ToArray())+")";
            z.color=new Color(0.95f,0.6f,0.15f,holder!=null?holder.origA:i.origA);Redraw(z);
        }
        void Unpresent(HaulIntent i,Zone_Stockpile z) {
            if(z==null||!i.presenting) return;
            i.presenting=false;
            var next=intents.FirstOrDefault(x=>x!=i&&x.Open&&x.zoneId==z.ID&&x.mapId==i.mapId);
            if(next!=null){next.presenting=true;next.origLabel=i.origLabel;next.origR=i.origR;next.origG=i.origG;next.origB=i.origB;next.origA=i.origA;Present(next,z);return;}
            z.label=i.origLabel;z.color=new Color(i.origR,i.origG,i.origB,i.origA);Redraw(z);
        }
        // Lab-only: draft this pawn the moment it stands in a tagged zone carrying on a tagged
        // haul. Drafting is the game's own interruption; only its timing is chosen here.
        public string draftWhen;
        public override void GameComponentTick() {
            if(draftWhen!=null) {
                var dp=WorldState.FindActor(draftWhen);
                if(dp!=null&&dp.IsCarrying()&&IntentHooks.TaggedHaul(dp.CurJob)&&ForCell(dp.Map,dp.Position,dp.carryTracker.CarriedThing.def)!=null&&dp.drafter!=null) {
                    draftWhen=null;int jobId=dp.CurJob.loadID;dp.drafter.Drafted=true;
                    Emit(dp,"lab-drafted","job="+jobId+";x="+dp.Position.x+";z="+dp.Position.z);
                }
            }
            if(intents.Count==0) return;
            int now=Find.TickManager.TicksGame;
            if(reconcileAfterLoad) {
                reconcileAfterLoad=false;
                // Reservations whose job is no longer some pawn's CurJob are dropped.
                var running=new HashSet<int>(Find.Maps.SelectMany(m=>m.mapPawns.AllPawnsSpawned).Where(p=>p.CurJob!=null).Select(p=>p.CurJob.loadID));
                foreach(var i in intents)foreach(var j in i.reserved.Keys.Concat(i.tripBudget.Keys).Where(k=>!running.Contains(k)).Distinct().ToList()){i.reserved.Remove(j);i.reservedBy.Remove(j);i.tripBudget.Remove(j);}
            }
            foreach(var i in intents.Where(x=>x.Open).ToList()) {
                // Zone edits stop the agreement with a plain reason; nobody is blamed.
                var z=ZoneOf(i);
                if(z==null){Retire(i,"stopped","zone removed");continue;}
                if(i.Def!=null&&!z.GetStoreSettings().AllowedToAccept(i.Def)){Retire(i,"stopped","zone no longer accepts "+i.Def.label);continue;}
                if(now>=i.untilTick){Retire(i,"expired");continue;}
                if(now%250==0)ReconcileCounts(i);
            }
            if(now%250==0)foreach(var a in intents.Where(x=>!x.Open&&x.archiveOpen)) {
                if(ZoneOf(a)==null){a.archiveOpen=false;continue;}
                ReconcileCounts(a);
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
            if(!String.IsNullOrEmpty(r.hold)&&r.hold!="strict"&&r.hold!="growing") throw new Exception("Unknown hold mode");
            if(pending!=null&&pending.excluded.Contains(r.actor)) throw new Exception("Pawn is excluded; a change of mind is a new offer");
            var map=p.Map;Zone_Stockpile zone;bool created=false;
            if(r.zoneId>=0) {
                // Existing colony stockpile: settings and stock untouched; counted from now on.
                zone=map.zoneManager.AllZones.FirstOrDefault(z=>z.ID==r.zoneId) as Zone_Stockpile;
                if(zone==null) throw new Exception("Unknown stockpile");
                if(!zone.GetStoreSettings().AllowedToAccept(def)) throw new Exception("Stockpile does not accept "+def.label);
                if(ForZone(zone,def)!=null) throw new Exception("An open agreement already covers this stockpile and item");
            } else {
                if(r.w<1||r.h<1||r.w*r.h>64) throw new Exception("Area must be 1-64 cells");
                zone=new Zone_Stockpile(StorageSettingsPreset.DefaultStockpile,map.zoneManager);
                map.zoneManager.RegisterZone(zone);created=true;
                for(int dx=0;dx<r.w;dx++)for(int dz=0;dz<r.h;dz++) {
                    var c=new IntVec3(r.x+dx,0,r.z+dz);
                    if(c.InBounds(map)&&map.zoneManager.ZoneAt(c)==null&&c.Standable(map)&&!c.Fogged(map))zone.AddCell(c);
                }
                if(zone.cells.Count==0){zone.Delete();throw new Exception("Candidate area has no usable cells");}
                zone.settings.filter.SetDisallowAll();
                zone.settings.filter.SetAllow(def,true);
                zone.settings.Priority=StoragePriority.Important;
                if(!String.IsNullOrEmpty(r.label))zone.label=r.label;
            }
            // Re-tagging the same (zone, def) closes the previous archive: a new generation.
            foreach(var old in intents.Where(x=>!x.Open&&x.archiveOpen&&x.zoneId==zone.ID&&x.mapId==map.uniqueID&&x.thingDef==def.defName))old.archiveOpen=false;
            i=pending??new HaulIntent {intentId=r.intentId};
            i.thingDef=def.defName;i.variant=r.variant;i.quota=r.quota;i.mapId=map.uniqueID;i.zoneId=zone.ID;i.status="open";
            i.hold=String.IsNullOrEmpty(r.hold)?"strict":r.hold;i.siteId=r.siteId;i.label=String.IsNullOrEmpty(r.label)?zone.label:r.label;i.createdZone=created;
            i.createdTick=Find.TickManager.TicksGame;i.untilTick=Find.TickManager.TicksGame+r.maxTicks;
            i.accepted.Add(r.actor);
            if(pending==null)intents.Add(i);
            i.zoneCount=Count(i);
            Present(i,zone);
            Emit(p,"intent-opened","intent="+i.intentId+";zone="+zone.ID+";cells="+zone.cells.Count+";quota="+i.quota+";variant="+i.variant+";hold="+i.hold+";def="+i.thingDef);
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
                Func<Job,bool> targets=j=>j!=null&&j.def==JobDefOf.HaulToCell&&ForCell(map,j.targetB.Cell,j.targetA.Thing!=null?j.targetA.Thing.def:i.Def)==i;
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
                finishedAfterExclusion=i.finishedAfterExclusion,createdTick=i.createdTick,untilTick=i.untilTick,lastDeliveryTick=i.lastDeliveryTick,peakHolders=i.peakHolders,
                hold=i.hold,label=i.label,zoneLabel=ZoneOf(i)==null?null:ZoneOf(i).label,siteId=i.siteId,stopReason=i.stopReason,archiveOpen=i.archiveOpen,
                ordinaryUnattributed=i.ordinaryUnattributed,ordinaryRemoved=i.ordinaryRemoved,
                accepted=i.accepted.ToArray(),excluded=i.excluded.ToArray()
            }).TrimEnd('}')+",\"ordinaryByPawn\":["+
                String.Join(",",i.ordinaryByPawn.Select(kv=>JsonUtility.ToJson(new PawnCredit {pawn=kv.Key,count=kv.Value})).ToArray())+"],\"byPawn\":["+
                String.Join(",",i.byPawn.Select(kv=>JsonUtility.ToJson(new PawnCredit {pawn=kv.Key,count=kv.Value})).ToArray())+
                "],\"drops\":["+String.Join(",",i.drops.Select(d=>JsonUtility.ToJson(d)).ToArray())+"]}").ToArray())+"]";
        }

        // Lab-only commands for the scripted sub-runs.
        public string Lab(Request r) {
            var p=WorldState.FindActor(r.actor);
            if(r.op=="lab-draft-when"){if(p==null||p.drafter==null)throw new Exception("Unknown or undraftable pawn");draftWhen=r.actor;return "{\"armed\":true}";}
            if(r.op=="lab-undraft"){if(p==null||p.drafter==null)throw new Exception("Unknown or undraftable pawn");draftWhen=null;p.drafter.Drafted=false;return "{\"drafted\":false}";}
            if(r.op=="lab-speed"){if(r.count<0||r.count>4)throw new Exception("Speed must be 0-4");Find.TickManager.CurTimeSpeed=(TimeSpeed)r.count;return "{\"speed\":"+(int)Find.TickManager.CurTimeSpeed+",\"tick\":"+Find.TickManager.TicksGame+"}";}
            if(r.op=="lab-patch-cost"){
                // 0 reset and stop timing, 1 reset and time every patch call, 2 read.
                if(r.count==0||r.count==1){PatchCost.Reset();PatchCost.timing=r.count==1;}
                return PatchCost.Json();
            }
            if(r.op=="lab-patches"){
                // 0 all patches off (vanilla), 1 all on, 2 all on except Job.SetTarget. Measurement only.
                var h=Bootstrap.harmony;if(h==null)throw new Exception("Harmony unavailable");
                h.UnpatchAll(h.Id);
                if(r.count>=1)h.PatchAll(typeof(Bootstrap).Assembly);
                if(r.count==2)h.Unpatch(HarmonyLib.AccessTools.Method(typeof(Job),nameof(Job.SetTarget)),HarmonyLib.HarmonyPatchType.All,h.Id);
                return "{\"mode\":"+r.count+",\"patchedMethods\":"+h.GetPatchedMethods().Count()+"}";
            }
            if(r.op=="lab-bench-settarget") return SetTargetBenchmark.Measure(Math.Max(1000,Math.Min(r.count,200000)));
            if(r.op=="lab-work-options") return WorkOptions.Measure(Math.Max(1,Math.Min(r.count,10)));
            if(r.op=="lab-fault-escape"){if(p==null)throw new Exception("Unknown pawn");faultSkipNext=true;faultPawn=r.actor;return "{\"fault\":\"armed\"}";}
            if(r.op=="lab-plain-zone") {
                // Matched ordered-job half: the same area as an ordinary, untagged wood stockpile.
                if(p==null) throw new Exception("Unknown pawn");
                var pmap=p.Map;var wood=DefDatabase<ThingDef>.GetNamed("WoodLog");
                var plain=new Zone_Stockpile(StorageSettingsPreset.DefaultStockpile,pmap.zoneManager);
                pmap.zoneManager.RegisterZone(plain);
                for(int dx=0;dx<r.w;dx++)for(int dz=0;dz<r.h;dz++){var c=new IntVec3(r.x+dx,0,r.z+dz);if(c.InBounds(pmap)&&pmap.zoneManager.ZoneAt(c)==null&&c.Standable(pmap)&&!c.Fogged(pmap))plain.AddCell(c);}
                if(plain.cells.Count==0){plain.Delete();throw new Exception("Candidate area has no usable cells");}
                plain.settings.filter.SetDisallowAll();plain.settings.filter.SetAllow(wood,true);plain.settings.Priority=StoragePriority.Important;
                return "{\"zone\":"+plain.ID+",\"cells\":"+plain.cells.Count+"}";
            }
            if(r.op=="lab-work-priority") {
                // Matched ordered-job half: ordered jobs only, as the ordered model always ran.
                if(p==null) throw new Exception("Unknown pawn");
                if(r.count<0||r.count>4) throw new Exception("Priority must be 0-4");
                p.workSettings.SetPriority(WorkTypeDefOf.Hauling,r.count);
                return "{\"hauling\":"+p.workSettings.GetPriority(WorkTypeDefOf.Hauling)+"}";
            }
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
                return "{\"queued\":"+q.Count+",\"tagged\":"+q.Count(j=>j.targetA.Thing!=null&&ForCell(p.Map,j.targetB.Cell,j.targetA.Thing.def)!=null)+"}";
            }
            var i=ById(r.intentId);
            if(i==null) throw new Exception("Unknown intent");
            var map=Find.Maps.First(m=>m.uniqueID==i.mapId);
            var zone=(Zone_Stockpile)map.zoneManager.AllZones.First(z=>z.ID==i.zoneId);
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
                if(r.op=="lab-queue-haul"&&r.reason=="carried")loose=p.carryTracker.CarriedThing;
                if(loose==null) throw new Exception("No haul source");
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
            if(r.op=="lab-stack-set") {
                // Grow or shrink a source stack while a pawn walks to it (pickup-bound checks).
                var t=map.listerThings.AllThings.FirstOrDefault(x=>x.GetUniqueLoadID()==r.thing);
                if(t==null||!t.Spawned) throw new Exception("Unknown stack");
                t.stackCount=Math.Max(1,Math.Min(r.count,t.def.stackLimit));
                return "{\"stackCount\":"+t.stackCount+"}";
            }
            if(r.op=="lab-zone-disallow") {zone.settings.filter.SetAllow(def,false);return "{\"allows\":false}";}
            if(r.op=="lab-zone-delete") {zone.Delete();return "{\"deleted\":true}";}
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
namespace Concord {
    // Measurement-only WoodLog/HaulGeneral subset. Generic HasJobOnThing/Cell can
    // call JobOnThing/Cell and allocate jobs on 4871; never invoke those here.
    public static class WorkOptions {
        public static string Measure(int top) {
            var sw=System.Diagnostics.Stopwatch.StartNew();var pawnParts=new List<string>();
            Rand.PushState();
            try {foreach(var p in Find.CurrentMap.mapPawns.FreeColonistsSpawned) {
                var pw=System.Diagnostics.Stopwatch.StartNew();int found=0;bool eligible=false;
                foreach(var wg in p.workSettings.WorkGiversInOrderNormal) {
                    if(wg.GetType()!=typeof(WorkGiver_HaulGeneral))continue;
                    if(p.WorkTagIsDisabled(wg.def.workTags)||p.WorkTypeIsDisabled(wg.def.workType)||wg.MissingRequiredCapacity(p)!=null)continue;
                    eligible=true;var scanner=(WorkGiver_Scanner)wg;
                    foreach(var t in scanner.PotentialWorkThingsGlobal(p)) {
                        if(found>=top)break;
                        if(t.def.defName!="WoodLog"||t.IsForbidden(p)||!HaulAIUtility.PawnCanAutomaticallyHaulFast(p,t,false))continue;
                        IntVec3 cell;IHaulDestination dest;
                        if(StoreUtility.TryFindBestBetterStorageFor(t,p,p.Map,StoreUtility.CurrentStoragePriorityOf(t),p.Faction,out cell,out dest)&&dest is ISlotGroupParent)found++;
                    }
                }
                pawnParts.Add("{\"pawn\":\""+p.GetUniqueLoadID()+"\",\"eligible\":"+(eligible?"true":"false")+",\"candidates\":"+found+",\"micros\":"+(pw.Elapsed.TotalMilliseconds*1000).ToString("0",System.Globalization.CultureInfo.InvariantCulture)+"}");
            }} finally {Rand.PopState();}
            return "{\"scope\":\"WoodLog HaulGeneral slot-storage predicate subset; not a full work menu\",\"top\":"+top+",\"totalMicros\":"+(sw.Elapsed.TotalMilliseconds*1000).ToString("0",System.Globalization.CultureInfo.InvariantCulture)+",\"pawns\":["+String.Join(",",pawnParts.ToArray())+"]}";
        }
    }
}

namespace Concord {
    // Isolated incremental dispatch+handler benchmark for two common, detached job paths.
    // Paused game only. Never makes a job through JobMaker, starts one, or targets a live job.
    public static class SetTargetBenchmark {
        public static string Measure(int iterations) {
            if(!Find.TickManager.Paused)throw new Exception("Benchmark requires paused game");
            var h=Bootstrap.harmony;if(h==null)throw new Exception("Harmony unavailable");
            var method=HarmonyLib.AccessTools.Method(typeof(Job),nameof(Job.SetTarget));
            var info=HarmonyLib.Harmony.GetPatchInfo(method);bool previousEnabled=info!=null&&info.Owners.Contains(h.Id);
            var samples=new List<string>();bool previousTiming=PatchCost.timing;PatchCost.timing=false;
            Action<bool> mode=enabled=>{h.Unpatch(method,HarmonyLib.HarmonyPatchType.All,h.Id);if(enabled)h.CreateClassProcessor(typeof(Patch2_SetTarget)).Patch();};
            try {
                foreach(var def in new[]{JobDefOf.Wait,JobDefOf.HaulToCell}) {
                    var job=new Job{def=def};var target=new LocalTargetInfo(new IntVec3(0,0,0));
                    for(int rep=0;rep<5;rep++)foreach(bool enabled in rep%2==0?new[]{true,false}:new[]{false,true}) {
                        mode(enabled);for(int j=0;j<10000;j++)job.SetTarget(TargetIndex.B,target);
                        long callsBefore=PatchCost.calls[2],t0=System.Diagnostics.Stopwatch.GetTimestamp();
                        for(int j=0;j<iterations;j++)job.SetTarget(TargetIndex.B,target);
                        double micros=(System.Diagnostics.Stopwatch.GetTimestamp()-t0)*1e6/System.Diagnostics.Stopwatch.Frequency;
                        long hookCalls=PatchCost.calls[2]-callsBefore;
                        if(hookCalls!=(enabled?iterations:0))throw new Exception("SetTarget benchmark dispatch verification failed");
                        samples.Add("{\"jobDef\":\""+def.defName+"\",\"enabled\":"+(enabled?"true":"false")+",\"round\":"+rep+",\"calls\":"+iterations+",\"verifiedHookCalls\":"+hookCalls+",\"micros\":"+micros.ToString("0.000",System.Globalization.CultureInfo.InvariantCulture)+"}");
                    }
                }
            } finally {try{mode(previousEnabled);}finally{PatchCost.timing=previousTiming;}}
            return "{\"scope\":\"detached Wait and non-current HaulToCell SetTarget(B); loop included in both arms, dispatch and production counters included, timing hooks off; not current-job retarget or population-wide cost\",\"samples\":["+String.Join(",",samples.ToArray())+"]}";
        }
    }
}
