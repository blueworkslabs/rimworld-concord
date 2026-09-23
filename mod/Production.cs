using System;
using System.Collections.Generic;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;
using Verse.AI;
namespace Concord {
 [Serializable] public class BuildOption {public string kind="build",thing;public int x,z,maxTicks=3600;}
 [Serializable] public class CookOption {public string kind="cook",thing,target;public int x,z,count,meals,maxTicks=7200;}
 [Serializable] public class ProductionSupply {public string thing,label;public int count;}
 public static class Production {
  public static ThingDef Campfire {get{return DefDatabase<ThingDef>.GetNamed("Campfire");}}
  public static RecipeDef Recipe {get{return DefDatabase<RecipeDef>.GetNamed("CookMealSimple");}}
  public static bool Ready(Pawn p,string kind){return Hauling.Ready(p)&&!p.WorkTypeIsDisabled(kind=="build"?WorkTypeDefOf.Construction:DefDatabase<WorkTypeDef>.GetNamed("Cooking"));}
  public static ActionRecord Record(Pawn p,Job j){return Current.Game.GetComponent<WorldState>().actions.FirstOrDefault(a=>a.actor==p.GetUniqueLoadID()&&a.jobId==j.loadID);}
  public static bool Active(Pawn p,Job j){var a=Record(p,j);return a!=null&&a.status=="started"&&Ready(p,a.kind)&&Find.TickManager.TicksGame<a.untilTick;}
  public static Thing FindThing(Map map,string id){return map.listerThings.AllThings.FirstOrDefault(t=>t.GetUniqueLoadID()==id);}
  public static bool Visible(Pawn p,IntVec3 c){return c.InBounds(p.Map)&&!c.Fogged(p.Map)&&c.InHorDistOf(p.Position,12)&&GenSight.LineOfSight(p.Position,c,p.Map);}
  private static bool Source(Pawn p,Thing t,int n){return t!=null&&t.Spawned&&t.Map==p.Map&&!t.IsForbidden(p)&&Visible(p,t.Position)&&t.stackCount>=n&&p.CanReserve(t,1,n)&&p.CanReach(t,PathEndMode.ClosestTouch,Danger.None)&&p.carryTracker.MaxStackSpaceEver(t.def)>=n;}
  public static bool BuildValid(Pawn p,Thing wood,IntVec3 c){return Ready(p,"build")&&wood!=null&&wood.def==ThingDefOf.WoodLog&&Source(p,wood,20)&&Visible(p,c)&&c.Standable(p.Map)&&c.GetThingList(p.Map).All(t=>t.def.category==ThingCategory.Pawn||t.def.category==ThingCategory.Filth)&&GenConstruct.CanPlaceBlueprintAt(Campfire,c,Rot4.North,p.Map).Accepted&&p.CanReach(c,PathEndMode.Touch,Danger.None)&&p.CanReserve(c);}
  public static int Ingredients(Thing t){return t==null||!Recipe.ingredients[0].filter.Allows(t)?0:Recipe.ingredients[0].CountRequiredOfFor(t.def,Recipe);}
  public static bool CookValid(Pawn p,Thing food,Building_WorkTable table,int count){return Ready(p,"cook")&&table!=null&&table.def==Campfire&&table.Map==p.Map&&Visible(p,table.Position)&&!table.IsForbidden(p)&&table.CurrentlyUsableForBills()&&table.def.AllRecipes.Contains(Recipe)&&Ingredients(food)==count&&count>0&&count<=75&&Source(p,food,count)&&p.CanReserveAndReach(table,PathEndMode.InteractionCell,Danger.None);}
  public static string Options(Pawn p,string epoch){
   var options=new List<string>();var supplies=new Dictionary<string,ProductionSupply>();
   var visible=new List<Thing>();var cells=new List<IntVec3>();
   for(int dx=-12;dx<=12;dx++)for(int dz=-12;dz<=12;dz++){var c=p.Position+new IntVec3(dx,0,dz);if(Visible(p,c)){cells.Add(c);visible.AddRange(c.GetThingList(p.Map));}}
   Action<Thing> supply=t=>supplies[t.GetUniqueLoadID()]=new ProductionSupply{thing=t.GetUniqueLoadID(),label=t.LabelNoCount,count=t.stackCount};
   // One local campfire project, not an invitation to pave the map with fires.
   if(Ready(p,"build")&&!visible.Any(t=>t.def==Campfire||t.def.entityDefToBuild==Campfire)){
    var wood=visible.Where(t=>t.def==ThingDefOf.WoodLog).OrderBy(t=>(t.Position-p.Position).LengthHorizontalSquared).FirstOrDefault(t=>Source(p,t,20));
    if(wood!=null)foreach(var c in cells.OrderBy(c=>(c-p.Position).LengthHorizontalSquared).ThenBy(c=>c.x).ThenBy(c=>c.z))if(BuildValid(p,wood,c)){options.Add(JsonUtility.ToJson(new BuildOption{thing=wood.GetUniqueLoadID(),x=c.x,z=c.z}));supply(wood);if(options.Count>=2)break;}
   }
   if(Ready(p,"cook"))foreach(var table in visible.OfType<Building_WorkTable>().Where(t=>t.def==Campfire).Take(2))foreach(var food in visible.Where(t=>t.def.category==ThingCategory.Item).Take(32)){
    int n=Ingredients(food);if(n>0&&CookValid(p,food,table,n)){options.Add(JsonUtility.ToJson(new CookOption{thing=food.GetUniqueLoadID(),target=table.GetUniqueLoadID(),x=table.Position.x,z=table.Position.z,count=n,meals=Math.Min(3,food.stackCount/n)}));supply(food);if(options.Count>=4)break;}
   }
   return "{\"epoch\":\""+epoch+"\",\"tick\":"+Find.TickManager.TicksGame+",\"mapId\":"+p.Map.uniqueID+",\"options\":["+String.Join(",",options.ToArray())+"],\"supplies\":["+String.Join(",",supplies.Values.Select(s=>JsonUtility.ToJson(s)).ToArray())+"]}";
  }
  public static void Start(Pawn p,Request r,ActionRecord a){
   if(r.mapId!=p.Map.uniqueID||r.maxTicks<60||r.maxTicks>(r.op=="cook"?7200:3600)){a.reason="Production map or duration unavailable";return;}
   a.untilTick=Math.Min(Find.TickManager.TicksGame+r.maxTicks,r.untilTick);
   if(a.untilTick<=Find.TickManager.TicksGame){a.reason="Production deadline expired";return;}
   var source=FindThing(p.Map,r.thing);var cell=new IntVec3(r.x,0,r.z);Job j;
   if(r.op=="build"){
    if(!BuildValid(p,source,cell)){a.reason="Campfire site, wood, ability, needs or reservation unavailable";return;}
    var blueprint=GenConstruct.PlaceBlueprintForBuild(Campfire,cell,p.Map,Rot4.North,p.Faction,null);
    blueprint.SetForbidden(true,false);a.project=blueprint.GetUniqueLoadID();a.stage="materials";
    j=JobMaker.MakeJob(DefDatabase<JobDef>.GetNamed("Concord_BuildMaterials"),source,blueprint);j.count=20;j.ignoreForbidden=true;
   }else{
    var table=FindThing(p.Map,r.target) as Building_WorkTable;
    if(r.meals<1||r.meals>3||table==null||table.Position!=cell||!CookValid(p,source,table,r.count)){a.reason="Campfire, ingredients, ability, fuel, needs or reservation unavailable";return;}
    var bill=new ConcordBill(Recipe);bill.ownerAction=a.id;bill.repeatMode=BillRepeatModeDefOf.RepeatCount;bill.repeatCount=1;bill.SetPawnRestriction(p);bill.SetStoreMode(BillStoreModeDefOf.DropOnFloor,null);bill.ingredientFilter.SetDisallowAll();bill.ingredientFilter.SetAllow(source.def,true);table.BillStack.AddBill(bill);
    a.project=table.GetUniqueLoadID();a.stage="cooking";
    j=JobMaker.MakeJob(DefDatabase<JobDef>.GetNamed("Concord_Cook"),table);j.bill=bill;j.targetQueueB=new List<LocalTargetInfo>{source};j.countQueue=new List<int>{r.count};
   }
   Dispatch(p,j,a);
  }
  public static void Cleanup(ActionRecord a){
   if(a.kind!="cook")return;
   foreach(var map in Find.Maps)foreach(var table in map.listerThings.AllThings.OfType<Building_WorkTable>())foreach(var bill in table.BillStack.Bills.OfType<ConcordBill>().Where(b=>b.ownerAction==a.id).ToArray())table.BillStack.Delete(bill);
  }
  private static void Dispatch(Pawn p,Job j,ActionRecord a){
   a.jobId=j.loadID;a.status="started";a.reason="Pawn accepted bounded "+a.kind;p.jobs.TryTakeOrderedJob(j,JobTag.Misc);
   if((p.CurJob==null||p.CurJob.loadID!=a.jobId)&&a.status=="started"&&a.stage!="materials-ready"){
    a.status="failed";a.reason="Native scheduler did not start the production job";
    p.jobs.jobQueue.RemoveAll(p,queued=>queued.loadID==a.jobId);Cleanup(a);
   }
  }
  public static void ContinueBuild(Pawn p,ActionRecord a){
   var frame=FindThing(p.Map,a.project) as Frame;
   if(frame==null||frame.BuildDef!=Campfire||!frame.IsCompleted()||!GenConstruct.CanConstruct(frame,p,true,true)){a.status="failed";a.reason="Agreed frame unavailable after material delivery";return;}
   a.stage="construction";var j=JobMaker.MakeJob(DefDatabase<JobDef>.GetNamed("Concord_BuildFinish"),frame);j.ignoreForbidden=true;Dispatch(p,j,a);
  }
 }
 // Ordinary work scanners must never resume this operator-owned, consent-bound bill.
 // The explicit native DoBill job executes once; deletion/withdrawal remains native.
 public class ConcordBill:Bill_Production {
  public string ownerAction;
  public override void ExposeData(){base.ExposeData();Scribe_Values.Look(ref ownerAction,"concordOwnerAction");}
  public ConcordBill(){}public ConcordBill(RecipeDef r):base(r){}
  public override bool ShouldDoNow(){return false;}
  public override bool PawnAllowedToStartAnew(Pawn p){return false;}
 }
 public class JobDriver_ConcordBuildMaterials:JobDriver {
  public override bool TryMakePreToilReservations(bool errorOnFailed){return pawn.Reserve(job.targetA,job,1,20,null,errorOnFailed)&&pawn.Reserve(job.targetB,job,1,-1,null,errorOnFailed);}
  protected override IEnumerable<Toil> MakeNewToils(){
   this.FailOnDestroyedOrNull(TargetIndex.B);this.FailOn(()=>!Production.Active(pawn,job));
   this.FailOn(()=>job.targetA.Thing!=null&&job.targetA.Thing.Spawned&&job.targetA.Thing.IsForbidden(pawn));
   yield return Toils_Goto.GotoThing(TargetIndex.A,PathEndMode.ClosestTouch);
   yield return Toils_Haul.StartCarryThing(TargetIndex.A,false,false,true);
   yield return Toils_Goto.GotoBuild(TargetIndex.B);
   yield return Toils_Goto.MoveOffTargetBlueprint(TargetIndex.B);
   var solid=Toils_Construct.MakeSolidThingFromBlueprintIfNecessary(TargetIndex.B);var init=solid.initAction;
   solid.initAction=()=>{init();var a=Production.Record(pawn,job);var frame=job.targetB.Thing as Frame;if(frame==null){EndJobWith(JobCondition.Incompletable);return;}frame.SetForbidden(true,false);if(a!=null)a.project=frame.GetUniqueLoadID();};yield return solid;
   yield return Toils_Haul.DepositHauledThingInContainer(TargetIndex.B,TargetIndex.None);
   var finish=ToilMaker.MakeToil("ConcordMaterialsDone");finish.defaultCompleteMode=ToilCompleteMode.Instant;finish.initAction=()=>{var a=Production.Record(pawn,job);var frame=job.targetB.Thing as Frame;if(a!=null&&a.status=="started"&&frame!=null&&frame.IsCompleted())a.stage="materials-ready";};yield return finish;
  }
 }
 public class JobDriver_ConcordBuildFinish:JobDriver_ConstructFinishFrame {
  protected override IEnumerable<Toil> MakeNewToils(){
   this.FailOn(()=>!Production.Active(pawn,job));
   foreach(var toil in base.MakeNewToils()){
    // Observe the native construction mutation synchronously, before another actor
    // or tick can alter the site; retain native skill gain and failure probability.
    if(toil.tickIntervalAction!=null){var tick=toil.tickIntervalAction;toil.tickIntervalAction=delta=>{
     var frame=job.targetA.Thing as Frame;var map=pawn.Map;var pos=frame==null?IntVec3.Invalid:frame.Position;var a=Production.Record(pawn,job);
     tick(delta);
     if(a!=null&&a.status=="started"&&frame!=null&&frame.Destroyed){var built=pos.GetEdifice(map);a.status=built!=null&&built.def==Production.Campfire?"completed":"failed";a.reason=a.status=="completed"?"Native construction completed the agreed campfire":"Native construction failed; no retry";a.delivered=a.status=="completed"?1:0;if(built!=null)a.project=built.GetUniqueLoadID();if(a.status=="failed")foreach(var remaining in pos.GetThingList(map).Where(t=>t.def.entityDefToBuild==Production.Campfire))remaining.SetForbidden(true,false);}
    };}yield return toil;
   }
  }
 }
 public class JobDriver_ConcordCook:JobDriver_DoBill {
  protected override IEnumerable<Toil> MakeNewToils(){
   this.FailOn(()=>!Production.Active(pawn,job));
   var toils=base.MakeNewToils().ToList();
   // Native placement records recipe ingredients only for its exact DoBill
   // JobDef, not subclasses. Keep our isolated JobDef and record the actual
   // dropped stack through the same native callback (including stack merges).
   foreach(var toil in toils.Where(t=>t.debugName=="PlaceHauledThingInCell"))toil.initAction=()=>{
    var a=Production.Record(pawn,job);var carried=pawn.carryTracker.CarriedThing;Thing placed;
    if(a==null||carried==null||carried.stackCount!=a.count||Production.Ingredients(carried)!=a.count||
       !pawn.carryTracker.TryDropCarriedThing(job.targetC.Cell,ThingPlaceMode.Direct,out placed,(t,n)=>HaulAIUtility.UpdateJobWithPlacedThings(job,t,n)))EndJobWith(JobCondition.Incompletable);
   };
   // Last native toil creates, consumes and drops products synchronously.
   var finish=toils.Last();var init=finish.initAction;
   finish.initAction=()=>{
    var a=Production.Record(pawn,job);var map=pawn.Map;var meal=ThingDefOf.MealSimple;
    // Fail before product creation if the exact delivered quantity vanished.
    if(a==null||a.status!="started"||job.placedThings==null||job.placedThings.Count!=1||
       job.placedThings[0].Count!=a.count||job.placedThings[0].thing==null||
       !job.placedThings[0].thing.Spawned||job.placedThings[0].thing.Map!=map||
       job.placedThings[0].thing.stackCount<a.count||Production.Ingredients(job.placedThings[0].thing)!=a.count){EndJobWith(JobCondition.Incompletable);return;}
    var ingredient=job.placedThings[0].thing.def;
    int foodBefore=map.listerThings.ThingsOfDef(ingredient).Sum(t=>t.stackCount);
    int before=map.listerThings.ThingsOfDef(meal).Sum(t=>t.stackCount);init();int made=map.listerThings.ThingsOfDef(meal).Sum(t=>t.stackCount)-before;
    int consumed=foodBefore-map.listerThings.ThingsOfDef(ingredient).Sum(t=>t.stackCount);
    if(a.status=="started"){a.delivered=Math.Max(0,made);a.status=made==1&&consumed==a.count?"completed":"failed";a.reason=a.status=="completed"?"Native recipe consumed "+consumed+" ingredients and produced one simple meal; eating not implied":"Recipe ingredient consumption or output was not confirmed; no retry";}
   };
   AddFinishAction(condition=>{var b=job.bill;if(b!=null&&!b.DeletedOrDereferenced)b.billStack.Delete(b);});
   foreach(var t in toils)yield return t;
  }
 }
}
