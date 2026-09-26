using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using RimWorld;
using UnityEngine;
using Verse;
using Verse.AI;

namespace Concord {
    // The harness's perception half (docs/HARNESS.md): one coherent, read-only snapshot of what the
    // player can see, built on the game thread when the bridge asks for it. No patches, no per-tick
    // work. Fogged cells, hidden storyteller plans and unrevealed map contents are excluded. The
    // `since` diff and `look` queries are computed from snapshots on the coordinator side.

    /** Minimal JSON writer: Unity's serializer omits nested arrays of custom objects in this build. */
    public class Json {
        private readonly StringBuilder sb=new StringBuilder(1<<16);private bool first=true;
        private static readonly CultureInfo inv=CultureInfo.InvariantCulture;
        private void Sep(){if(!first)sb.Append(',');first=false;}
        public static string Str(string s){
            if(s==null)return "null";var b=new StringBuilder(s.Length+2);b.Append('"');
            foreach(var ch in s){
                switch(ch){case '"':b.Append("\\\"");break;case '\\':b.Append("\\\\");break;case '\n':b.Append("\\n");break;case '\r':b.Append("\\r");break;case '\t':b.Append("\\t");break;
                    default:if(ch<0x20)b.Append("\\u").Append(((int)ch).ToString("x4"));else b.Append(ch);break;}
            }
            return b.Append('"').ToString();
        }
        private Json Key(string k){Sep();sb.Append(Str(k)).Append(':');return this;}
        public Json Obj(){Sep();sb.Append('{');first=true;return this;}
        public Json Obj(string k){Key(k);sb.Append('{');first=true;return this;}
        public Json End(){sb.Append('}');first=false;return this;}
        public Json Arr(string k){Key(k);sb.Append('[');first=true;return this;}
        public Json EndArr(){sb.Append(']');first=false;return this;}
        public Json S(string k,string v){Key(k);sb.Append(Str(v));return this;}
        public Json I(string k,long v){Key(k);sb.Append(v.ToString(inv));return this;}
        public Json F(string k,float v){Key(k);sb.Append(float.IsNaN(v)||float.IsInfinity(v)?"null":Math.Round(v,4).ToString("0.####",inv));return this;}
        public Json B(string k,bool v){Key(k);sb.Append(v?"true":"false");return this;}
        public Json Val(string v){Sep();sb.Append(Str(v));return this;}
        public Json Val(long v){Sep();sb.Append(v.ToString(inv));return this;}
        public Json Raw(string k,string raw){Key(k);sb.Append(raw);return this;}
        public override string ToString(){return sb.ToString();}
    }

    public static class Perception {
        public static int snapshotSeq;
        private static string Label(Def d){return d==null?null:d.label;}
        private static bool Visible(Thing t,Map map){return t.Spawned&&t.Map==map&&!t.Position.Fogged(map);}

        /** The whole player's picture for the current map. */
        public static string Snapshot(WorldState w) {
            var map=Find.CurrentMap;var j=new Json();
            j.Obj();
            j.Obj("meta").S("world",w.world).S("epoch",w.epoch).I("mapId",map.uniqueID).I("tick",Find.TickManager.TicksGame)
                .I("snapshotId",++snapshotSeq).S("format","concord-perception-v1").End();
            Time(j,map);Weather(j,map);Alerts(j,map);Letters(j);Resources(j,map);Things(j,map);Zones(j,map);Bills(j,map);
            Designations(j,map);Research(j);Pawns(j,map);Threats(j,map);
            var hs=HarnessState.Get();if(hs!=null)hs.Write(j);else j.Arr("receipts").EndArr();
            // Sections this build does not export yet, stated rather than silently absent.
            j.Arr("omitted").Val("messages (transient top-left messages)").Val("home area cells").Val("weather forecast (not player-visible)").EndArr();
            j.End();
            return j.ToString();
        }
        private static void Time(Json j,Map map){
            long abs=Find.TickManager.TicksAbs;var ll=Find.WorldGrid.LongLatOf(map.Tile);
            j.Obj("time").I("tick",Find.TickManager.TicksGame).I("hour",GenDate.HourOfDay(abs,ll.x)).I("dayOfSeason",GenDate.DayOfSeason(abs,ll.x))
                .S("quadrum",GenDate.Quadrum(abs,ll.x).ToString()).S("season",GenDate.Season(abs,ll).ToString()).I("year",GenDate.Year(abs,ll.x))
                .I("daysPassed",GenDate.DaysPassed).S("speed",Find.TickManager.CurTimeSpeed.ToString()).B("paused",Find.TickManager.Paused)
                .S("clock",Clock.At(Find.TickManager.TicksGame,map)).End();
        }
        private static void Weather(Json j,Map map){
            var cur=map.weatherManager.curWeather;
            j.Obj("weather").S("def",cur==null?null:cur.defName).S("label",Label(cur)).F("outdoorTemp",map.mapTemperature.OutdoorTemp).End();
        }
        /** The player's alert list, evaluated now. The readout fills its active list gradually over UI
         *  frames (24 slices) and not before tick 600, so reading that list right after a load shows
         *  nothing. Every registered alert's report is computed at snapshot time instead (the same
         *  GetReport the readout calls; no Recalculate, though getters may refresh local caches), plus any quest,
         *  precept or scenario alert already in the active list. */
        private static void Alerts(Json j,Map map){
            j.Arr("alerts");
            var ui=Find.UIRoot as UIRoot_Play;
            if(ui!=null&&(Find.Storyteller==null||!Find.Storyteller.def.disableAlerts)){
                var t=HarmonyLib.Traverse.Create(ui.alerts);
                var all=t.Field("AllAlerts").GetValue<List<Alert>>()??new List<Alert>();
                var active=t.Field("activeAlerts").GetValue<List<Alert>>()??new List<Alert>();
                var seen=new HashSet<Alert>();
                foreach(var a in all.Concat(active).ToList()){
                    if(a==null||!seen.Add(a))continue;
                    AlertReport rep;try{rep=a.GetReport();}catch{continue;}
                    if(!rep.active)continue;
                    string label;try{label=a.GetLabel();}catch{continue;}
                    j.Obj().S("label",label).S("priority",a.Priority.ToString()).S("type",a.GetType().Name);
                    j.Arr("targets");try{foreach(var c in rep.AllCulprits){if(c.HasThing&&c.Thing.Spawned&&!c.Thing.Position.Fogged(c.Thing.Map))j.Val(c.Thing.thingIDNumber);}}catch{}j.EndArr();
                    j.End();
                }
            }
            j.EndArr();
        }
        private static void Letters(Json j){
            j.Arr("letters");
            foreach(var l in Find.LetterStack.LettersListForReading.ToList()){
                var cl=l as ChoiceLetter;
                j.Obj().S("label",l.Label.ToString()).S("def",l.def==null?null:l.def.defName).I("tick",l.arrivalTick).S("text",cl==null?null:cl.Text.ToString());
                j.Arr("targets");if(l.lookTargets!=null)foreach(var t in l.lookTargets.targets)if(t.HasThing)j.Val(t.Thing.thingIDNumber);j.EndArr();
                j.End();
            }
            j.EndArr();
        }
        private static void Resources(Json j,Map map){
            j.Arr("resources");
            foreach(var kv in map.resourceCounter.AllCountedAmounts.Where(kv=>kv.Value>0).OrderBy(kv=>kv.Key.defName))
                j.Obj().S("def",kv.Key.defName).S("label",kv.Key.label).S("category",kv.Key.FirstThingCategory==null?null:kv.Key.FirstThingCategory.defName).I("count",kv.Value).End();
            j.EndArr();
        }
        public static string Kind(Thing t){
            if(t is Blueprint)return "blueprint";if(t is Frame)return "frame";if(t is Pawn)return "pawn";
            if(t is Plant)return "plant";if(t is Filth)return "filth";if(t is Corpse)return "corpse";
            if(t.def.category==ThingCategory.Building)return "building";if(t.def.category==ThingCategory.Item)return "item";
            return t.def.category.ToString().ToLowerInvariant();
        }
        private static void Things(Json j,Map map){
            j.Obj("map").I("width",map.Size.x).I("height",map.Size.z).S("biome",map.Biome==null?null:map.Biome.defName);
            j.Arr("things");
            foreach(var t in map.listerThings.AllThings.ToList()){
                if(t is Pawn||t is Mote||!Visible(t,map)||t.def.category==ThingCategory.Ethereal&&!(t is Blueprint))continue;
                if(t.def.category==ThingCategory.Projectile||t.def.category==ThingCategory.Gas||t.def.category==ThingCategory.Attachment)continue;
                j.Obj().I("id",t.thingIDNumber).S("kind",Kind(t)).S("def",t.def.defName).S("label",t.LabelNoCount).I("x",t.Position.x).I("z",t.Position.z)
                    .I("rot",t.Rotation.AsInt).I("stack",t.stackCount).B("forbidden",t.IsForbidden(Faction.OfPlayer)).S("faction",t.Faction==null?null:(t.Faction.IsPlayer?"player":t.Faction.GetUniqueLoadID()));
                QualityCategory q;if(t.TryGetQuality(out q))j.S("quality",q.ToString());
                if(t.def.useHitPoints)j.I("hp",t.HitPoints).I("maxHp",t.MaxHitPoints);
                var bp=t as Blueprint;if(bp!=null)j.S("builds",bp.def.entityDefToBuild==null?null:bp.def.entityDefToBuild.defName);
                var fr=t as Frame;if(fr!=null){j.S("builds",fr.def.entityDefToBuild==null?null:fr.def.entityDefToBuild.defName).F("workDone",fr.workDone).F("workToBuild",fr.WorkToBuild);
                    j.Arr("held");foreach(var h in fr.resourceContainer)j.Obj().S("def",h.def.defName).I("count",h.stackCount).End();j.EndArr();}
                var bed=t as Building_Bed;if(bed!=null)j.B("bed",true).B("medical",bed.Medical).I("owners",bed.OwnersForReading.Count).I("slots",bed.SleepingSlotsCount).B("prisoner",bed.ForPrisoners).B("slave",bed.ForSlaves);
                var bench=t as Building_WorkTable;if(bench!=null)j.B("workbench",true);
                var pl=t as Plant;if(pl!=null)j.F("growth",pl.Growth).B("harvestable",pl.HarvestableNow);
                if(t.def.category==ThingCategory.Item){var room=t.Position.GetRoom(map);j.B("roofed",t.Position.Roofed(map)).B("outdoors",room==null||room.PsychologicallyOutdoors);}
                if(t.def.IsNutritionGivingIngestible)j.F("nutrition",t.GetStatValue(StatDefOf.Nutrition));
                j.End();
            }
            j.EndArr().End();
        }
        private static void Zones(Json j,Map map){
            j.Arr("zones");
            foreach(var z in map.zoneManager.AllZones.ToList()){
                j.Obj().I("id",z.ID).S("label",z.label).S("kind",z is Zone_Stockpile?"stockpile":z is Zone_Growing?"growing":z.GetType().Name);
                j.Arr("cells");foreach(var c in z.cells){j.Obj().I("x",c.x).I("z",c.z).End();}j.EndArr();
                var sp=z as Zone_Stockpile;
                if(sp!=null){
                    j.S("priority",sp.settings.Priority.ToString());
                    j.Arr("allowed");foreach(var d in sp.settings.filter.AllowedThingDefs.OrderBy(d=>d.defName))j.Val(d.defName);j.EndArr();
                    j.Arr("contents");foreach(var g in sp.GetSlotGroup().HeldThings.GroupBy(t=>t.def).OrderBy(g=>g.Key.defName))j.Obj().S("def",g.Key.defName).I("count",g.Sum(t=>t.stackCount)).End();j.EndArr();
                }
                var gz=z as Zone_Growing;if(gz!=null){var pd=gz.GetPlantDefToGrow();j.S("plant",pd==null?null:pd.defName).B("allowSow",gz.allowSow);}
                j.End();
            }
            j.EndArr();
        }
        private static void Bills(Json j,Map map){
            j.Arr("bills");
            foreach(var bench in map.listerBuildings.allBuildingsColonist.OfType<Building_WorkTable>().ToList()){
                j.Obj().I("bench",bench.thingIDNumber).S("benchDef",bench.def.defName).I("x",bench.Position.x).I("z",bench.Position.z);
                j.Arr("bills");
                foreach(var b in bench.BillStack.Bills){
                    j.Obj().S("loadId",b.GetUniqueLoadID()).S("recipe",b.recipe==null?null:b.recipe.defName).B("suspended",b.suspended).F("ingredientRadius",b.ingredientSearchRadius);
                    var restricted=HarmonyLib.Traverse.Create(b).Field("pawnRestriction").GetValue<Pawn>();j.I("restrictedTo",restricted==null?-1:restricted.thingIDNumber).B("slavesOnly",b.SlavesOnly).B("mechsOnly",b.MechsOnly).B("nonMechsOnly",b.NonMechsOnly);
                    j.Obj("skillRange").I("min",b.allowedSkillRange.min).I("max",b.allowedSkillRange.max).End();
                    var bp=b as Bill_Production;
                    if(bp!=null)j.S("repeatMode",bp.repeatMode==null?null:bp.repeatMode.defName).I("repeatCount",bp.repeatCount).I("targetCount",bp.targetCount).B("paused",bp.paused);
                    j.End();
                }
                j.EndArr().End();
            }
            j.EndArr();
        }
        private static void Designations(Json j,Map map){
            j.Arr("designations");
            foreach(var d in map.designationManager.AllDesignations.ToList()){
                j.Obj().S("def",d.def.defName);
                if(d.target.HasThing)j.I("thing",d.target.Thing.thingIDNumber);else j.I("x",d.target.Cell.x).I("z",d.target.Cell.z);
                j.End();
            }
            j.EndArr();
        }
        private static void Research(Json j){
            var p=Find.ResearchManager.GetProject();
            j.Obj("research").S("project",p==null?null:p.defName).S("label",Label(p)).F("progress",p==null?0f:p.ProgressPercent).End();
        }
        private static void Pawns(Json j,Map map){
            j.Arr("pawns");
            var thoughts=new List<Thought>();
            foreach(var p in map.mapPawns.FreeColonistsSpawned.ToList()){
                j.Obj().I("id",p.thingIDNumber).S("loadId",p.GetUniqueLoadID()).S("name",p.LabelShort).I("x",p.Position.x).I("z",p.Position.z)
                    .B("drafted",p.Drafted).B("downed",p.Downed);
                var job=p.CurJob;
                j.Obj("job").S("def",job==null?null:job.def.defName).S("report",job==null?null:p.jobs.curDriver==null?null:p.jobs.curDriver.GetReport());
                if(job!=null&&job.targetA.HasThing)j.I("target",job.targetA.Thing.thingIDNumber);
                j.End();
                j.Obj("health").F("summary",p.health.summaryHealth.SummaryHealthPercent);
                j.Arr("hediffs");foreach(var h in p.health.hediffSet.hediffs.Where(h=>h.Visible))j.Obj().S("label",h.LabelCap).S("part",h.Part==null?null:h.Part.LabelCap).F("severity",h.Severity).F("bleeding",h.BleedRate).End();j.EndArr();
                j.End();
                j.Arr("needs");if(p.needs!=null)foreach(var n in p.needs.AllNeeds)j.Obj().S("def",n.def.defName).S("label",n.LabelCap).F("level",n.CurLevelPercentage).End();j.EndArr();
                j.Obj("mood");
                if(p.needs!=null&&p.needs.mood!=null){
                    j.F("level",p.needs.mood.CurLevelPercentage);thoughts.Clear();p.needs.mood.thoughts.GetDistinctMoodThoughtGroups(thoughts);
                    j.Arr("thoughts");foreach(var t in thoughts)j.Obj().S("label",t.LabelCap).F("mood",p.needs.mood.thoughts.MoodOffsetOfGroup(t)).End();j.EndArr();
                }
                j.End();
                j.Arr("traits");if(p.story!=null)foreach(var t in p.story.traits.allTraits)j.Val(t.LabelCap);j.EndArr();
                j.Arr("skills");if(p.skills!=null)foreach(var s in p.skills.skills)j.Obj().S("def",s.def.defName).I("level",s.Level).S("passion",s.passion.ToString()).B("disabled",s.TotallyDisabled).End();j.EndArr();
                j.Arr("work");foreach(var wt in DefDatabase<WorkTypeDef>.AllDefsListForReading)j.Obj().S("def",wt.defName).I("priority",p.workSettings==null||!p.workSettings.EverWork?0:p.workSettings.GetPriority(wt)).B("disabled",p.WorkTypeIsDisabled(wt)).End();j.EndArr();
                j.Arr("schedule");if(p.timetable!=null)for(int h=0;h<24;h++)j.Val(p.timetable.GetAssignment(h).defName);j.EndArr();
                var carried=p.carryTracker==null?null:p.carryTracker.CarriedThing;
                if(carried!=null)j.Obj("carrying").I("id",carried.thingIDNumber).S("def",carried.def.defName).I("count",carried.stackCount).End();
                j.Arr("inventory");if(p.inventory!=null)foreach(var t in p.inventory.innerContainer)j.Obj().I("id",t.thingIDNumber).S("def",t.def.defName).I("count",t.stackCount).End();j.EndArr();
                if(p.records!=null)j.Obj("records").F("mealsCooked",p.records.GetValue(RecordDefOf.MealsCooked)).F("thingsConstructed",p.records.GetValue(RecordDefOf.ThingsConstructed)).End();
                var bed=p.ownership==null?null:p.ownership.OwnedBed;j.I("bed",bed==null?-1:bed.thingIDNumber);
                var currentBed=p.CurrentBed();j.I("currentBed",currentBed==null?-1:currentBed.thingIDNumber).B("asleep",currentBed!=null&&p.jobs!=null&&p.jobs.curDriver!=null&&p.jobs.curDriver.asleep);
                j.End();
            }
            j.EndArr();
        }
        private static void Threats(Json j,Map map){
            j.Arr("threats");
            foreach(var p in map.mapPawns.AllPawnsSpawned.ToList()){
                if(p.Faction==Faction.OfPlayer||p.Position.Fogged(map)||p.IsHiddenFromPlayer())continue;
                bool hostile=p.HostileTo(Faction.OfPlayer);bool manhunter=p.InMentalState&&p.MentalStateDef!=null&&p.MentalStateDef.IsAggro;
                bool predator=p.RaceProps!=null&&p.RaceProps.predator;
                if(!hostile&&!manhunter&&!predator)continue;
                j.Obj().I("id",p.thingIDNumber).S("def",p.def.defName).S("label",p.LabelShort).I("x",p.Position.x).I("z",p.Position.z)
                    .B("hostile",hostile).B("manhunter",manhunter).B("predator",predator).B("downed",p.Downed).End();
            }
            j.EndArr();
        }
    }
}
