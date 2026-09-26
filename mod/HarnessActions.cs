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
        public int seq,tick,mapId=-1;public string requestId,action,id,reason,source,detail,narration,narrated;public bool ok;
        /** Not saved: what the native message points at. */
        public Thing look;
        public void ExposeData(){
            Scribe_Values.Look(ref narration,"narration");Scribe_Values.Look(ref narrated,"narrated");Scribe_Values.Look(ref mapId,"mapId",-1);
            Scribe_Values.Look(ref seq,"seq");Scribe_Values.Look(ref tick,"tick");Scribe_Values.Look(ref requestId,"requestId");Scribe_Values.Look(ref action,"action");
            Scribe_Values.Look(ref id,"id");Scribe_Values.Look(ref reason,"reason");Scribe_Values.Look(ref source,"source");Scribe_Values.Look(ref detail,"detail");Scribe_Values.Look(ref ok,"ok");
        }
        public void Write(Json j){j.Obj().I("seq",seq).I("tick",tick).S("requestId",requestId).S("action",action).B("ok",ok).S("id",id).S("reason",reason).S("source",source).S("detail",detail).S("narration",narration).S("narrated",narrated).End();}
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
        public HarnessReceipt Add(HarnessReceipt r){r.seq=++seq;r.tick=Verse.Find.TickManager.TicksGame;receipts.Add(r);return r;}
        /** The last 64 receipts; `since` on the coordinator side selects the ones after a snapshot. */
        public void Write(Json j){j.Arr("receipts");foreach(var r in receipts.Skip(Math.Max(0,receipts.Count-64)))r.Write(j);j.EndArr();}
    }

    public class HarnessRefusal : Exception {public readonly string source;public HarnessRefusal(string reason,string source="harness"):base(reason){this.source=source;}}

    public static class HarnessActions {
        static readonly string[] Kinds={"place_blueprint","designate","zone","bill","bill_edit","bill_delete","work_priority","schedule","forbid","allow_area"};
        static Map Map{get{return Verse.Find.CurrentMap;}}
        static Thing ThingById(int id){var t=Map.listerThings.AllThings.FirstOrDefault(x=>x.thingIDNumber==id);if(t==null||t.Position.Fogged(Map)||(t is Pawn&&((Pawn)t).IsHiddenFromPlayer()))throw new HarnessRefusal("no visible thing with that id","harness");return t;}
        static Pawn Colonist(int id){var p=Map.mapPawns.FreeColonistsSpawned.FirstOrDefault(x=>x.thingIDNumber==id);if(p==null)throw new HarnessRefusal("no colonist with that id","harness");return p;}
        static IntVec3 Cell(int x,int z){var c=new IntVec3(x,0,z);if(!c.InBounds(Map))throw new HarnessRefusal("cell out of bounds","harness");return c;}
        static void Game(AcceptanceReport r,string fallback){if(!r.Accepted)throw new HarnessRefusal(String.IsNullOrEmpty(r.Reason)?fallback:r.Reason.StripTags(),String.IsNullOrEmpty(r.Reason)?"harness":"game");}
        static List<IntVec3> Cells(string encoded){
            var list=new List<IntVec3>();if(String.IsNullOrEmpty(encoded))return list;
            foreach(var part in encoded.Split(';')){var xy=part.Split(',');if(xy.Length!=2)throw new HarnessRefusal("cells must be x,z;x,z","harness");list.Add(Cell(int.Parse(xy[0]),int.Parse(xy[1])));}
            if(list.Count>400)throw new HarnessRefusal("at most 400 cells per command","harness");return list;
        }

        /** The native build designator configured for the harness: omitted rotation stays North,
         *  omitted material uses GenStuff.DefaultStuffFor (not the UI's resource-count selection).
         *  Shared by action and query; later game changes can invalidate a query. */
        static Designator_Build BuildDesignator(Request r,out ThingDef def,out ThingDef stuffUsed){
            stuffUsed=null;
            def=DefDatabase<ThingDef>.GetNamedSilentFail(r.def);if(def==null||def.blueprintDef==null)throw new HarnessRefusal("not a buildable def","harness");
            var d=new Designator_Build(def);
            if(!d.Visible)throw new HarnessRefusal("not available to build (research or prerequisites)");
            if(def.MadeFromStuff){
                var stuff=String.IsNullOrEmpty(r.stuff)?GenStuff.DefaultStuffFor(def):DefDatabase<ThingDef>.GetNamedSilentFail(r.stuff);
                if(stuff==null||stuff.stuffProps==null||!stuff.stuffProps.CanMake(def))throw new HarnessRefusal("that material cannot make this");
                HarmonyLib.Traverse.Create(d).Field("stuffDef").SetValue(stuff);stuffUsed=stuff;
            }
            if(r.rot>=0)HarmonyLib.Traverse.Create(d).Field("placingRot").SetValue(new Rot4(r.rot));
            return d;
        }

        // Native placement only checks fog at the anchor before inspecting the whole footprint.
        // Do not let multi-cell queries/actions probe hidden terrain or occupants at its edges.
        static bool FootprintHidden(Designator_Build d,ThingDef def,IntVec3 c){
            var rot=(Rot4)HarmonyLib.Traverse.Create(d).Field("placingRot").GetValue();
            return GenAdj.OccupiedRect(c,rot,def.size).Any(n=>n.InBounds(Map)&&n.Fogged(Map));
        }

        /** Read-only placement query (docs/HARNESS.md): can this def go at this cell, and if not, the
         *  nearest cells where it can. Every answer is the designator's own CanDesignateCell, the check the
         *  UI runs under the mouse; nothing is placed and no receipt is stored. Fogged cells are never
         *  offered; hidden footprints receive an explicit harness refusal before native inspection. */
        public static string Placement(Request r){
            if(Map==null)throw new Exception("No map loaded");
            int radius=r.radius<0?12:Math.Min(Math.Max(r.radius,1),30),limit=r.count<=0?5:Math.Min(r.count,20);
            var j=new Json();j.Obj().S("def",r.def).S("stuff",r.stuff).I("x",r.x).I("z",r.z);
            try{
                ThingDef def,stuffUsed;var d=BuildDesignator(r,out def,out stuffUsed);
                var rot=(Rot4)HarmonyLib.Traverse.Create(d).Field("placingRot").GetValue();
                j.I("rot",rot.AsInt).I("size_x",def.size.x).I("size_z",def.size.z);
                var c=Cell(r.x,r.z);bool hidden=FootprintHidden(d,def,c);
                var here=hidden?new AcceptanceReport("placement footprint intersects undiscovered cells"):d.CanDesignateCell(c);
                j.B("ok",here.Accepted);
                if(!here.Accepted){j.S("reason",String.IsNullOrEmpty(here.Reason)?"cannot place here":here.Reason.StripTags()).S("source",hidden||String.IsNullOrEmpty(here.Reason)?"harness":"game");}
                j.I("searchedRadius",radius).Arr("nearest");int found=0;
                foreach(var n in GenRadial.RadialCellsAround(c,radius,false)){
                    if(found>=limit)break;
                    if(!n.InBounds(Map)||FootprintHidden(d,def,n))continue;
                    if(d.CanDesignateCell(n).Accepted){j.Obj().I("x",n.x).I("z",n.z).I("distance",(long)Math.Round(n.DistanceTo(c))).End();found++;}
                }
                j.EndArr();
            }catch(HarnessRefusal e){j.B("ok",false).S("reason",e.Message).S("source",e.source).Arr("nearest").EndArr();}
            return j.End().ToString();
        }

        /** One command; returns its receipt JSON. A known request ID returns the stored receipt. */
        public static string Act(WorldState w,Request r) {
            var state=HarnessState.Get();
            if(String.IsNullOrEmpty(r.requestId)||r.requestId.Length>80)throw new Exception("requestId required");
            if(String.IsNullOrEmpty(r.world)||r.world!=w.world||String.IsNullOrEmpty(r.epoch)||r.epoch!=w.epoch||Map==null||r.mapId!=Map.uniqueID)
                return new HarnessReceipt{requestId=r.requestId,action=r.action,tick=Verse.Find.TickManager.TicksGame,ok=false,reason="Stale or missing world/load/map identity",source="harness"}.ToJson();
            var prior=state.Find(r.requestId);if(prior!=null)return prior.ToJson();
            var receipt=new HarnessReceipt{requestId=r.requestId,action=r.action};
            try{
                if(Map==null)throw new HarnessRefusal("no map loaded","harness");
                if(!Kinds.Contains(r.action))throw new HarnessRefusal("unknown action (draft and direct job orders are not harness actions)","harness");
                receipt.mapId=Map.uniqueID;receipt.id=Run(r,receipt);receipt.ok=true;
            }catch(HarnessRefusal e){receipt.ok=false;receipt.reason=e.Message;receipt.source=e.source;receipt.narration=Phrase.Refused(HarnessNarration.Attempt(r),e.Message,e.source);}
            catch(FormatException){receipt.ok=false;receipt.reason="malformed argument";receipt.source="harness";receipt.narration=Phrase.Refused(HarnessNarration.Attempt(r),"malformed argument","harness");}
            catch(Exception e){receipt.ok=false;receipt.reason="Unexpected native failure: "+e.GetType().Name;receipt.source="harness";receipt.detail="Outcome uncertain; inspect state before issuing a new request.";receipt.narration=Phrase.Uncertain(HarnessNarration.Attempt(r));}
            // After the game has answered, once per request ID: a repeated ID returned above.
            state.Add(receipt);HarnessNarration.Show(receipt,receipt.look);receipt.look=null;
            return receipt.ToJson();
        }
        static string Run(Request r,HarnessReceipt receipt) {
            switch(r.action){
            case "place_blueprint": {
                ThingDef def,stuff;var d=BuildDesignator(r,out def,out stuff);
                var c=Cell(r.x,r.z);if(FootprintHidden(d,def,c))throw new HarnessRefusal("placement footprint intersects undiscovered cells");Game(d.CanDesignateCell(c),"cannot place here");
                d.DesignateSingleCell(c);
                var bp=c.GetThingList(Map).FirstOrDefault(t=>(t is Blueprint||t is Frame||t.def==def)&&(t.def.entityDefToBuild==def||t.def==def));
                if(bp==null)throw new HarnessRefusal("the designator placed nothing");
                receipt.detail=bp.def.defName;receipt.look=bp;
                var what=GenLabel.ThingLabel(def,stuff);
                receipt.narration=Phrase.Core("placed "+(bp is Blueprint?Phrase.A(what+" blueprint"):bp is Frame?Phrase.A(what+" frame"):Phrase.A(what))+" "+HarnessNarration.Where(c,bp));
                return bp.thingIDNumber.ToString();
            }
            case "designate": {
                Designator d;
                switch(r.mode){
                    case "deconstruct":d=new Designator_Deconstruct();break;case "cancel":d=new Designator_Cancel();break;
                    case "mine":d=new Designator_Mine();break;case "harvest":d=new Designator_PlantsHarvest();break;case "cut":d=new Designator_PlantsCut();break;
                    case "hunt":d=new Designator_Hunt();break;case "haul":d=new Designator_Haul();break;
                    default:throw new HarnessRefusal("unknown designation kind","harness");
                }
                var target=r.thingId>=0?ThingById(r.thingId):null;
                var c=target!=null?target.Position:Cell(r.x,r.z);
                if(target!=null)Game(d.CanDesignateThing(target),"cannot designate that");
                else Game(d.CanDesignateCell(c),"cannot designate that cell");
                // Mining a fogged cell is a native player control. Do not inspect/name hidden contents.
                bool visible=!c.Fogged(Map);
                var affected=target!=null?new List<Thing>{target}:visible?c.GetThingList(Map).Where(t=>d.CanDesignateThing(t).Accepted).ToList():new List<Thing>();
                var labels=affected.Select(t=>t.LabelShort).ToList();
                var before=DesignationScope(affected,c).Where(x=>x.def.designateCancelable).ToList();
                var carriers=affected.Where(t=>t is Blueprint||t is Frame).ToList();
                if(target!=null)d.DesignateThing(target);else d.DesignateSingleCell(c);
                receipt.detail=r.mode;receipt.look=target!=null&&target.Spawned?target:null;
                if(!visible){receipt.narration=Phrase.Core("issued "+Phrase.A(r.mode+" order")+" at an undiscovered location; contents not inspected");}
                else if(r.mode=="cancel"){
                    var after=DesignationScope(affected,c).ToList();int removed=before.Count(x=>!after.Contains(x)),cancelled=carriers.Count(t=>t.Destroyed);
                    receipt.narration=Phrase.Core("cancelled "+removed+" recorded orders and "+cancelled+" blueprints or frames "+HarnessNarration.Where(c));
                    receipt.detail+="; removed orders: "+removed+"; cancelled blueprints/frames: "+cancelled;
                }else{
                    var def=DesignationKind(r.mode);
                    bool present=r.mode=="mine"?Map.designationManager.DesignationAt(c,def)!=null:affected.Any(t=>Map.designationManager.DesignationOn(t,def)!=null);
                    var confirmed=r.mode=="mine"?new List<string>():affected.Select((t,i)=>new{thing=t,label=labels[i]}).Where(x=>Map.designationManager.DesignationOn(x.thing,def)!=null).Select(x=>x.label).ToList();
                    var destroyed=affected.Select((t,i)=>new{thing=t,label=labels[i]}).Where(x=>x.thing.Destroyed).Select(x=>x.label).ToList();
                    var named=r.mode=="mine"?labels:confirmed;var label=named.Count>0?Phrase.List(named):"ground";
                    if(r.mode=="deconstruct"&&destroyed.Count>0)receipt.narration=Phrase.Core("deconstructed the "+Phrase.List(destroyed)+(confirmed.Count>0?"; marked the "+Phrase.List(confirmed)+" for deconstruction":"")+" "+HarnessNarration.Where(c));
                    else if(present)receipt.narration=Phrase.Core(Phrase.DesignationVerb(r.mode,label)+" "+HarnessNarration.Where(c));
                    else{receipt.detail+="; no matching designation present after accept";receipt.narration=Phrase.Core("gave "+Phrase.A(r.mode+" order")+", but the game recorded no matching order");}
                }
                return target!=null?target.thingIDNumber.ToString():c.x+","+c.z;
            }
            case "zone": return ZoneAction(r,receipt);
            case "bill": {
                var bench=ThingById(r.thingId) as Building_WorkTable;if(bench==null||bench.Faction!=Faction.OfPlayer)throw new HarnessRefusal("not a colony workbench","harness");
                var recipe=DefDatabase<RecipeDef>.GetNamedSilentFail(r.recipe);if(recipe==null)throw new HarnessRefusal("unknown recipe","harness");
                if(!bench.def.AllRecipes.Contains(recipe))throw new HarnessRefusal("this bench cannot do that recipe");
                if(!recipe.AvailableNow)throw new HarnessRefusal("recipe not available (research)");
                if(bench.BillStack.Count>=15)throw new HarnessRefusal("bill stack is full (native limit 15)");
                var bill=recipe.MakeNewBill();Edit(bill,r);bench.BillStack.AddBill(bill);
                receipt.look=bench;receipt.narration=Phrase.Core("added a bill at the "+bench.LabelShort+": "+BillText((Bill_Production)bill));
                return bill.GetUniqueLoadID();
            }
            case "bill_edit": {var bill=BillById(r.target);Edit(bill,r);var bench=bill.billStack.billGiver as Thing;receipt.look=bench;
                receipt.narration=Phrase.Core("changed the bill at the "+(bench!=null?bench.LabelShort:"workbench")+": now "+BillText(bill));return bill.GetUniqueLoadID();}
            case "bill_delete": {var bill=BillById(r.target);var bench=bill.billStack.billGiver as Thing;var label=bill.recipe.label;bill.billStack.Delete(bill);receipt.look=bench;
                receipt.narration=Phrase.Core("removed the "+label+" bill at the "+(bench!=null?bench.LabelShort:"workbench"));return r.target;}
            case "work_priority": {
                var p=Colonist(r.thingId);var wt=DefDatabase<WorkTypeDef>.GetNamedSilentFail(r.work);if(wt==null)throw new HarnessRefusal("unknown work type","harness");
                if(r.priority<0||r.priority>4)throw new HarnessRefusal("priority must be 0-4","harness");
                if(r.priority>0&&p.WorkTypeIsDisabled(wt))throw new HarnessRefusal(p.LabelShort+" cannot do "+wt.labelShort);
                // Numbered priorities are a player setting; the harness turns it on when it sets one.
                if(r.priority>1&&!Verse.Find.PlaySettings.useWorkPriorities){Verse.Find.PlaySettings.useWorkPriorities=true;receipt.detail="manual priorities enabled";}
                p.workSettings.SetPriority(wt,r.priority);var now=p.workSettings.GetPriority(wt);var work=(wt.gerundLabel??wt.labelShort??wt.defName).ToLowerInvariant();receipt.look=p;
                receipt.narration=Phrase.Core((now==0?"took "+p.LabelShort+" off "+work:"set "+p.LabelShort+"'s "+work+" priority to "+now)+(receipt.detail!=null?" (numbered priorities turned on)":""));
                return p.thingIDNumber+":"+wt.defName+"="+now;
            }
            case "schedule": {
                var p=Colonist(r.thingId);if(r.hour<0||r.hour>23)throw new HarnessRefusal("hour must be 0-23","harness");
                var ta=DefDatabase<TimeAssignmentDef>.GetNamedSilentFail(r.mode);if(ta==null)throw new HarnessRefusal("unknown assignment","harness");
                p.timetable.SetAssignment(r.hour,ta);var now=p.timetable.GetAssignment(r.hour);receipt.look=p;
                receipt.narration=Phrase.Core("set "+p.LabelShort+"'s schedule at "+r.hour+"h to "+now.label);
                return p.thingIDNumber+":"+r.hour+"="+now.defName;
            }
            case "forbid": {
                var t=ThingById(r.thingId);var comp=t.TryGetComp<CompForbiddable>();if(comp==null)throw new HarnessRefusal("that cannot be forbidden");
                bool before=t.IsForbidden(Faction.OfPlayer);t.SetForbidden(r.flag,false);bool after=t.IsForbidden(Faction.OfPlayer);receipt.look=t;
                if(after!=r.flag)throw new InvalidOperationException("forbid state did not change");
                if(before==after)receipt.detail="no change";
                receipt.narration=Phrase.Core((after?"forbade the "+t.LabelShort:"allowed the "+t.LabelShort+" to be used")+(before==after?" (no change: it already was)":" "+HarnessNarration.Where(t.Position,t)));
                return t.thingIDNumber+(after?":forbidden":":allowed");
            }
            case "allow_area": {
                var p=Colonist(r.thingId);Area area=null;
                if(!String.IsNullOrEmpty(r.label)){area=Map.areaManager.AllAreas.FirstOrDefault(a=>a.Label==r.label&&a.AssignableAsAllowed());if(area==null)throw new HarnessRefusal("no assignable area with that name");}
                p.playerSettings.AreaRestrictionInPawnCurrentMap=area;var set=p.playerSettings.AreaRestrictionInPawnCurrentMap;receipt.look=p;
                receipt.narration=Phrase.Core(set==null?"lifted "+p.LabelShort+"'s area restriction":"restricted "+p.LabelShort+" to the "+set.Label+" area");
                return p.thingIDNumber+":"+(set==null?"unrestricted":set.Label);
            }
            }
            throw new HarnessRefusal("unknown action","harness");
        }
        static IEnumerable<Designation> DesignationScope(List<Thing> things,IntVec3 cell){
            return Map.designationManager.AllDesignationsAt(cell).Concat(things.SelectMany(t=>Map.designationManager.AllDesignationsOn(t))).Distinct();
        }
        static DesignationDef DesignationKind(string mode){
            switch(mode){case "mine":return DesignationDefOf.Mine;case "deconstruct":return DesignationDefOf.Deconstruct;
            case "harvest":return DesignationDefOf.HarvestPlant;case "cut":return DesignationDefOf.CutPlant;
            case "hunt":return DesignationDefOf.Hunt;case "haul":return DesignationDefOf.Haul;default:throw new InvalidOperationException("unknown designation");}
        }
        // Native zone designators read global selection. Scope it to this command, then restore it.
        static string ZoneAction(Request r,HarnessReceipt receipt){
            var cells=Cells(r.cells).Distinct().ToList();
            var zone=r.zoneId<0?null:Map.zoneManager.AllZones.FirstOrDefault(z=>z.ID==r.zoneId);
            if(r.zoneId>=0&&zone==null)throw new HarnessRefusal("no zone with that id");
            bool growing=zone is Zone_Growing||(zone==null&&r.mode=="growing");
            if(zone!=null&&!(zone is Zone_Growing)&&!(zone is Zone_Stockpile))throw new HarnessRefusal("unsupported zone kind");
            if(zone==null&&r.mode!="growing"&&r.mode!="stockpile")throw new HarnessRefusal("zone kind must be stockpile or growing");
            if(zone!=null&&!String.IsNullOrEmpty(r.mode)&&r.mode!=(growing?"growing":"stockpile"))throw new HarnessRefusal("zone kind cannot be changed");
            if(zone==null&&cells.Count==0)throw new HarnessRefusal("a new zone needs cells");
            if(growing&&(!String.IsNullOrEmpty(r.storage)||r.hasAllow))throw new HarnessRefusal("storage settings need a stockpile");
            if(!growing&&!String.IsNullOrEmpty(r.def))throw new HarnessRefusal("plant setting needs a growing zone");
            StoragePriority priority=StoragePriority.Normal;
            if(!String.IsNullOrEmpty(r.storage)&&(!Enum.TryParse(r.storage,out priority)||!Enum.IsDefined(typeof(StoragePriority),priority)))throw new HarnessRefusal("unknown storage priority");
            var allowed=new List<ThingDef>();
            if(r.hasAllow)foreach(var name in r.allow??new string[0]){var td=DefDatabase<ThingDef>.GetNamedSilentFail(name);if(td==null)throw new HarnessRefusal("unknown def "+name);allowed.Add(td);}
            var allCells=new HashSet<IntVec3>(zone==null?cells:zone.Cells.Concat(cells));
            if(cells.Count>0){ // Each added cell must connect to this zone, not create an unreported one.
                var remaining=new HashSet<IntVec3>(cells);var queue=new Queue<IntVec3>();
                if(zone==null){queue.Enqueue(cells[0]);remaining.Remove(cells[0]);}
                else foreach(var c in zone.Cells){queue.Enqueue(c);remaining.Remove(c);}
                while(queue.Count>0){var c=queue.Dequeue();foreach(var dir in GenAdj.CardinalDirections){var n=c+dir;if(remaining.Remove(n))queue.Enqueue(n);}}
                if(remaining.Count>0)throw new HarnessRefusal("added zone cells must connect to the requested zone");
            }
            ThingDef plant=null;
            if(growing&&!String.IsNullOrEmpty(r.def)){
                plant=DefDatabase<ThingDef>.GetNamedSilentFail(r.def);
                if(plant==null||plant.plant==null||plant.plant.sowTags==null||!plant.plant.sowTags.Contains("Ground"))throw new HarnessRefusal("not a ground-sowable plant");
                if(!Command_SetPlantToGrow.IsPlantAvailable(plant,Map))throw new HarnessRefusal("plant unavailable in the native menu");
                // Same PollutionUtility.CanPlantAt conditions, over the prospective zone cells.
                if(plant.plant.RequiresNoPollution&&!allCells.Any(c=>!c.IsPolluted(Map))||plant.plant.RequiresPollution&&!allCells.Any(c=>c.IsPolluted(Map)))throw new HarnessRefusal("plant pollution requirements not met");
            }
            var selector=Verse.Find.Selector;var selected=selector.SelectedObjectsListForReading.ToList();
            try{
                selector.ClearSelection();if(zone!=null)selector.Select(zone,false,false);
                Designator_ZoneAdd d=growing?(Designator_ZoneAdd)new Designator_ZoneAdd_Growing():new Designator_ZoneAddStockpile_Resources();
                foreach(var c in cells){var other=Map.zoneManager.ZoneAt(c);if(other!=null&&other!=zone)throw new HarnessRefusal("cell belongs to another zone");if(other==null)Game(d.CanDesignateCell(c),"cell cannot be zoned");}
                // Everything above is validation. Apply native cell edits only after it all passes.
                var before=new HashSet<int>(Map.zoneManager.AllZones.Select(z=>z.ID));bool created=zone==null;int cellsBefore=zone==null?0:zone.Cells.Count;
                if(cells.Count>0)d.DesignateMultiCell(cells);
                if(zone==null)zone=Map.zoneManager.AllZones.Single(z=>!before.Contains(z.ID));
                if((zone is Zone_Growing)!=growing)throw new InvalidOperationException("native zone kind mismatch");
                if(!String.IsNullOrEmpty(r.label))zone.label=r.label;
                var sp=zone as Zone_Stockpile;
                if(sp!=null){if(!String.IsNullOrEmpty(r.storage))sp.settings.Priority=priority;if(r.hasAllow){sp.settings.filter.SetDisallowAll();foreach(var td in allowed)sp.settings.filter.SetAllow(td,true);}}
                if(plant!=null)((Zone_Growing)zone).SetPlantDefToGrow(plant);
                receipt.narration=Phrase.Core(ZoneText(zone,created,cellsBefore,cells.Count>0?cells[0]:zone.Position,r.hasAllow?allowed:null,!String.IsNullOrEmpty(r.storage)));
                return zone.ID.ToString();
            }finally{selector.ClearSelection();foreach(var obj in selected)selector.Select(obj,false,false);}
        }
        /** The zone as the game now holds it: size, filter and priority read back, not the request. */
        static string ZoneText(Zone zone,bool created,int cellsBefore,IntVec3 anchor,List<ThingDef> allowed,bool prioritySet){
            var sp=zone as Zone_Stockpile;var grow=zone as Zone_Growing;int n=zone.Cells.Count;
            string kind=grow!=null?"growing zone":"stockpile";
            string text=created?"laid out "+Phrase.A(kind)+" of "+n+" cells "+HarnessNarration.Where(anchor)+" ("+zone.label+")"
                :n!=cellsBefore?"extended the "+zone.label+" by "+(n-cellsBefore)+" cells ("+n+" in all)":"updated the "+zone.label;
            if(sp!=null&&allowed!=null){var shown=allowed.Where(td=>sp.settings.filter.Allows(td)).Select(td=>td.label).ToList();text+=shown.Count==0?", allowing nothing":", allowing only "+Phrase.List(shown);}
            if(sp!=null&&prioritySet)text+=", at "+sp.settings.Priority.Label()+" priority";
            if(grow!=null&&grow.GetPlantDefToGrow()!=null)text+=", to grow "+grow.GetPlantDefToGrow().label;
            return text;
        }
        static string BillText(Bill_Production b){
            var mode=b.repeatMode==BillRepeatModeDefOf.RepeatCount?"count":b.repeatMode==BillRepeatModeDefOf.TargetCount?"until":"forever";
            return b.recipe.label+", "+Phrase.Repeat(mode,b.repeatCount,b.targetCount)+(b.suspended?" (suspended)":"");
        }
        static Bill_Production BillById(string loadId){
            foreach(var bench in Map.listerBuildings.allBuildingsColonist.OfType<Building_WorkTable>())foreach(var b in bench.BillStack.Bills)
                if(b.GetUniqueLoadID()==loadId){var bp=b as Bill_Production;if(bp==null)throw new HarnessRefusal("not a production bill","harness");return bp;}
            throw new HarnessRefusal("no bill with that id","harness");
        }
        static void Edit(Bill bill,Request r){
            var bp=bill as Bill_Production;if(bp==null)throw new HarnessRefusal("not a production bill","harness");
            var mode=String.IsNullOrEmpty(r.mode)?bp.repeatMode:r.mode=="count"?BillRepeatModeDefOf.RepeatCount:r.mode=="forever"?BillRepeatModeDefOf.Forever:r.mode=="until"?BillRepeatModeDefOf.TargetCount:null;
            if(mode==null)throw new HarnessRefusal("repeat mode must be count, forever or until","harness");
            if(r.count!=-1&&(r.count<1||r.count>999))throw new HarnessRefusal("count must be 1-999","harness");
            if(r.count>=1&&mode==BillRepeatModeDefOf.Forever)throw new HarnessRefusal("a forever bill has no count","harness");
            if(r.radius!=-1&&(r.radius<1||r.radius>999))throw new HarnessRefusal("radius must be 1-999","harness");
            if(r.suspend<-1||r.suspend>1)throw new HarnessRefusal("invalid suspend value","harness");
            // Validate all fields first; edits with no count preserve the native stored count.
            bp.repeatMode=mode;
            if(r.count>=1){if(mode==BillRepeatModeDefOf.RepeatCount)bp.repeatCount=r.count;else bp.targetCount=r.count;}
            if(r.radius>0)bp.ingredientSearchRadius=r.radius;
            if(r.suspend==1)bp.suspended=true;else if(r.suspend==0)bp.suspended=false;
        }
    }
}
