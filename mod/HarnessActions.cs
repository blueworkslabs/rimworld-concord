using System;
using System.Collections.Generic;
using System.Linq;
using RimWorld;
using Verse;
using Verse.AI;

namespace Concord {
    // The harness's action half, v1 (docs/HARNESS.md): the player's own controls, minus draft. Each
    // command goes through the same native path the UI uses (designators, zone designators, bill
    // stack, work settings, timetable, forbid) and returns the game's acceptance or the game's own
    // refusal. An accepted command is not completed work; completion is read from later state.

    public class HarnessReceipt : IExposable {
        public int seq,tick;public string requestId,action,id,reason,source,detail;public bool ok;
        public void ExposeData(){
            Scribe_Values.Look(ref seq,"seq");Scribe_Values.Look(ref tick,"tick");Scribe_Values.Look(ref requestId,"requestId");Scribe_Values.Look(ref action,"action");
            Scribe_Values.Look(ref id,"id");Scribe_Values.Look(ref reason,"reason");Scribe_Values.Look(ref source,"source");Scribe_Values.Look(ref detail,"detail");Scribe_Values.Look(ref ok,"ok");
        }
        public void Write(Json j){j.Obj().I("seq",seq).I("tick",tick).S("requestId",requestId).S("action",action).B("ok",ok).S("id",id).S("reason",reason).S("source",source).S("detail",detail).End();}
        public string ToJson(){var j=new Json();Write(j);return j.ToString();}
    }
    /** Receipts by request ID (saved with the game): a repeated request returns its first receipt and
     *  never creates a second blueprint, bill or zone. */
    public class HarnessState : GameComponent {
        public List<HarnessReceipt> receipts=new List<HarnessReceipt>();public int seq;
        public HarnessState(Game game){}
        public static HarnessState Get(){return Current.Game==null?null:Current.Game.GetComponent<HarnessState>();}
        public override void ExposeData(){Scribe_Collections.Look(ref receipts,"concordHarnessReceipts",LookMode.Deep);Scribe_Values.Look(ref seq,"concordHarnessSeq");if(receipts==null)receipts=new List<HarnessReceipt>();}
        public HarnessReceipt Find(string requestId){return receipts.FirstOrDefault(r=>r.requestId==requestId);}
        public HarnessReceipt Add(HarnessReceipt r){r.seq=++seq;r.tick=Verse.Find.TickManager.TicksGame;receipts.Add(r);if(receipts.Count>512)receipts.RemoveAt(0);return r;}
        /** The last 64 receipts; `since` on the coordinator side selects the ones after a snapshot. */
        public void Write(Json j){j.Arr("receipts");foreach(var r in receipts.Skip(Math.Max(0,receipts.Count-64)))r.Write(j);j.EndArr();}
    }

    public class HarnessRefusal : Exception {public readonly string source;public HarnessRefusal(string reason,string source="game"):base(reason){this.source=source;}}

    public static class HarnessActions {
        static readonly string[] Kinds={"place_blueprint","designate","zone","bill","bill_edit","bill_delete","work_priority","schedule","forbid","allow_area"};
        static Map Map{get{return Verse.Find.CurrentMap;}}
        static Thing ThingById(int id){var t=Map.listerThings.AllThings.FirstOrDefault(x=>x.thingIDNumber==id);if(t==null||t.Position.Fogged(Map))throw new HarnessRefusal("no visible thing with that id","harness");return t;}
        static Pawn Colonist(int id){var p=Map.mapPawns.FreeColonistsSpawned.FirstOrDefault(x=>x.thingIDNumber==id);if(p==null)throw new HarnessRefusal("no colonist with that id","harness");return p;}
        static IntVec3 Cell(int x,int z){var c=new IntVec3(x,0,z);if(!c.InBounds(Map))throw new HarnessRefusal("cell out of bounds","harness");return c;}
        static void Game(AcceptanceReport r,string fallback){if(!r.Accepted)throw new HarnessRefusal(String.IsNullOrEmpty(r.Reason)?fallback:r.Reason.StripTags());}
        static List<IntVec3> Cells(string encoded){
            var list=new List<IntVec3>();if(String.IsNullOrEmpty(encoded))return list;
            foreach(var part in encoded.Split(';')){var xy=part.Split(',');if(xy.Length!=2)throw new HarnessRefusal("cells must be x,z;x,z","harness");list.Add(Cell(int.Parse(xy[0]),int.Parse(xy[1])));}
            if(list.Count>400)throw new HarnessRefusal("at most 400 cells per command","harness");return list;
        }

        /** One command; returns its receipt JSON. A known request ID returns the stored receipt. */
        public static string Act(WorldState w,Request r) {
            var state=HarnessState.Get();
            if(String.IsNullOrEmpty(r.requestId)||r.requestId.Length>80)throw new Exception("requestId required");
            if(!String.IsNullOrEmpty(r.epoch)&&r.epoch!=w.epoch)throw new Exception("Stale timeline");
            var prior=state.Find(r.requestId);if(prior!=null)return prior.ToJson();
            var receipt=new HarnessReceipt{requestId=r.requestId,action=r.action};
            try{
                if(Map==null)throw new HarnessRefusal("no map loaded","harness");
                if(!Kinds.Contains(r.action))throw new HarnessRefusal("unknown action (draft and direct job orders are not harness actions)","harness");
                receipt.id=Run(r,receipt);receipt.ok=true;
            }catch(HarnessRefusal e){receipt.ok=false;receipt.reason=e.Message;receipt.source=e.source;}
            catch(FormatException){receipt.ok=false;receipt.reason="malformed argument";receipt.source="harness";}
            return state.Add(receipt).ToJson();
        }
        static string Run(Request r,HarnessReceipt receipt) {
            switch(r.action){
            case "place_blueprint": {
                var def=DefDatabase<ThingDef>.GetNamedSilentFail(r.def);if(def==null||def.blueprintDef==null)throw new HarnessRefusal("not a buildable def","harness");
                var d=new Designator_Build(def);
                if(!d.Visible)throw new HarnessRefusal("not available to build (research or prerequisites)");
                if(def.MadeFromStuff){
                    var stuff=String.IsNullOrEmpty(r.stuff)?GenStuff.DefaultStuffFor(def):DefDatabase<ThingDef>.GetNamedSilentFail(r.stuff);
                    if(stuff==null||!stuff.stuffProps.CanMake(def))throw new HarnessRefusal("that material cannot make this");
                    HarmonyLib.Traverse.Create(d).Field("stuffDef").SetValue(stuff);
                }
                if(r.rot>=0)HarmonyLib.Traverse.Create(d).Field("placingRot").SetValue(new Rot4(r.rot));
                var c=Cell(r.x,r.z);Game(d.CanDesignateCell(c),"cannot place here");
                d.DesignateSingleCell(c);
                var bp=c.GetThingList(Map).FirstOrDefault(t=>(t is Blueprint||t is Frame||t.def==def)&&(t.def.entityDefToBuild==def||t.def==def));
                if(bp==null)throw new HarnessRefusal("the designator placed nothing");
                receipt.detail=bp.def.defName;return bp.thingIDNumber.ToString();
            }
            case "designate": {
                Designator d;
                switch(r.mode){
                    case "deconstruct":d=new Designator_Deconstruct();break;case "cancel":d=new Designator_Cancel();break;
                    case "mine":d=new Designator_Mine();break;case "harvest":d=new Designator_PlantsHarvest();break;case "cut":d=new Designator_PlantsCut();break;
                    case "hunt":d=new Designator_Hunt();break;case "haul":d=new Designator_Haul();break;
                    default:throw new HarnessRefusal("unknown designation kind","harness");
                }
                if(r.thingId>=0){var t=ThingById(r.thingId);Game(d.CanDesignateThing(t),"cannot designate that");d.DesignateThing(t);receipt.detail=r.mode;return t.thingIDNumber.ToString();}
                var c=Cell(r.x,r.z);Game(d.CanDesignateCell(c),"cannot designate that cell");d.DesignateSingleCell(c);receipt.detail=r.mode;return c.x+","+c.z;
            }
            case "zone": {
                var cells=Cells(r.cells);
                Zone zone;
                if(r.zoneId>=0){
                    zone=Map.zoneManager.AllZones.FirstOrDefault(z=>z.ID==r.zoneId);if(zone==null)throw new HarnessRefusal("no zone with that id","harness");
                    foreach(var c in cells){Game(Designator_ZoneAdd.IsZoneableCell(c,Map),"cell cannot be zoned");var other=Map.zoneManager.ZoneAt(c);if(other!=null&&other!=zone)throw new HarnessRefusal("cell belongs to another zone");if(other==null)zone.AddCell(c);}
                }else{
                    if(cells.Count==0)throw new HarnessRefusal("a new zone needs cells","harness");
                    Designator_ZoneAdd d=r.mode=="growing"?(Designator_ZoneAdd)new Designator_ZoneAdd_Growing():r.mode=="stockpile"?new Designator_ZoneAddStockpile_Resources():null;
                    if(d==null)throw new HarnessRefusal("zone kind must be stockpile or growing","harness");
                    foreach(var c in cells)Game(d.CanDesignateCell(c),"cell cannot be zoned");
                    var before=new HashSet<int>(Map.zoneManager.AllZones.Select(z=>z.ID));
                    d.DesignateMultiCell(cells);
                    zone=Map.zoneManager.AllZones.FirstOrDefault(z=>!before.Contains(z.ID));
                    if(zone==null)zone=Map.zoneManager.ZoneAt(cells[0]);if(zone==null)throw new HarnessRefusal("the zone designator created nothing");
                }
                if(!String.IsNullOrEmpty(r.label))zone.label=r.label;
                var sp=zone as Zone_Stockpile;
                if(sp!=null){
                    if(!String.IsNullOrEmpty(r.storage)){StoragePriority pr;if(!Enum.TryParse(r.storage,out pr))throw new HarnessRefusal("unknown storage priority","harness");sp.settings.Priority=pr;}
                    if(r.allow!=null&&r.allow.Length>0){sp.settings.filter.SetDisallowAll();foreach(var name in r.allow){var td=DefDatabase<ThingDef>.GetNamedSilentFail(name);if(td==null)throw new HarnessRefusal("unknown def "+name,"harness");sp.settings.filter.SetAllow(td,true);}}
                }
                var gz=zone as Zone_Growing;
                if(gz!=null&&!String.IsNullOrEmpty(r.def)){var plant=DefDatabase<ThingDef>.GetNamedSilentFail(r.def);if(plant==null||plant.plant==null)throw new HarnessRefusal("not a plant","harness");
                    if(!PlantUtility.CanSowOnGrower(plant,gz))throw new HarnessRefusal("cannot sow that here");gz.SetPlantDefToGrow(plant);}
                return zone.ID.ToString();
            }
            case "bill": {
                var bench=ThingById(r.thingId) as Building_WorkTable;if(bench==null||bench.Faction!=Faction.OfPlayer)throw new HarnessRefusal("not a colony workbench","harness");
                var recipe=DefDatabase<RecipeDef>.GetNamedSilentFail(r.recipe);if(recipe==null)throw new HarnessRefusal("unknown recipe","harness");
                if(!bench.def.AllRecipes.Contains(recipe))throw new HarnessRefusal("this bench cannot do that recipe");
                if(!recipe.AvailableNow)throw new HarnessRefusal("recipe not available (research)");
                var bill=recipe.MakeNewBill();bench.BillStack.AddBill(bill);Edit(bill,r);
                return bill.GetUniqueLoadID();
            }
            case "bill_edit": {var bill=BillById(r.target);Edit(bill,r);return bill.GetUniqueLoadID();}
            case "bill_delete": {var bill=BillById(r.target);bill.billStack.Delete(bill);return r.target;}
            case "work_priority": {
                var p=Colonist(r.thingId);var wt=DefDatabase<WorkTypeDef>.GetNamedSilentFail(r.work);if(wt==null)throw new HarnessRefusal("unknown work type","harness");
                if(r.priority<0||r.priority>4)throw new HarnessRefusal("priority must be 0-4","harness");
                if(r.priority>0&&p.WorkTypeIsDisabled(wt))throw new HarnessRefusal(p.LabelShort+" cannot do "+wt.labelShort);
                // Numbered priorities are a player setting; the harness turns it on when it sets one.
                if(r.priority>1&&!Verse.Find.PlaySettings.useWorkPriorities){Verse.Find.PlaySettings.useWorkPriorities=true;receipt.detail="manual priorities enabled";}
                p.workSettings.SetPriority(wt,r.priority);return p.thingIDNumber+":"+wt.defName+"="+p.workSettings.GetPriority(wt);
            }
            case "schedule": {
                var p=Colonist(r.thingId);if(r.hour<0||r.hour>23)throw new HarnessRefusal("hour must be 0-23","harness");
                var ta=DefDatabase<TimeAssignmentDef>.GetNamedSilentFail(r.mode);if(ta==null)throw new HarnessRefusal("unknown assignment","harness");
                p.timetable.SetAssignment(r.hour,ta);return p.thingIDNumber+":"+r.hour+"="+ta.defName;
            }
            case "forbid": {
                var t=ThingById(r.thingId);var comp=t.TryGetComp<CompForbiddable>();if(comp==null)throw new HarnessRefusal("that cannot be forbidden");
                t.SetForbidden(r.flag,false);return t.thingIDNumber+(r.flag?":forbidden":":allowed");
            }
            case "allow_area": {
                var p=Colonist(r.thingId);Area area=null;
                if(!String.IsNullOrEmpty(r.label)){area=Map.areaManager.AllAreas.FirstOrDefault(a=>a.Label==r.label&&a.AssignableAsAllowed());if(area==null)throw new HarnessRefusal("no assignable area with that name");}
                p.playerSettings.AreaRestrictionInPawnCurrentMap=area;return p.thingIDNumber+":"+(area==null?"unrestricted":area.Label);
            }
            }
            throw new HarnessRefusal("unknown action","harness");
        }
        static Bill_Production BillById(string loadId){
            foreach(var bench in Map.listerBuildings.allBuildingsColonist.OfType<Building_WorkTable>())foreach(var b in bench.BillStack.Bills)
                if(b.GetUniqueLoadID()==loadId){var bp=b as Bill_Production;if(bp==null)throw new HarnessRefusal("not a production bill","harness");return bp;}
            throw new HarnessRefusal("no bill with that id","harness");
        }
        static void Edit(Bill bill,Request r){
            var bp=bill as Bill_Production;if(bp==null)return;
            if(!String.IsNullOrEmpty(r.mode)){
                if(r.mode=="count"){bp.repeatMode=BillRepeatModeDefOf.RepeatCount;if(r.count<1)throw new HarnessRefusal("count must be at least 1","harness");bp.repeatCount=r.count;}
                else if(r.mode=="forever")bp.repeatMode=BillRepeatModeDefOf.Forever;
                else if(r.mode=="until"){bp.repeatMode=BillRepeatModeDefOf.TargetCount;if(r.count<1)throw new HarnessRefusal("count must be at least 1","harness");bp.targetCount=r.count;}
                else throw new HarnessRefusal("repeat mode must be count, forever or until","harness");
            }
            if(r.radius>0)bp.ingredientSearchRadius=r.radius;
            if(r.suspend==1)bp.suspended=true;else if(r.suspend==0)bp.suspended=false;
        }
    }
}
