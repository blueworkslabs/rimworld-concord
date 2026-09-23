using System;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;
namespace Concord {
 [Serializable] public class CrewEntry { public int seq,tick;public string kind,actor,recipient,subject,text,key; }
 [Serializable] public class AgreementProgress { public string id,kind,status;public int tick,agreed,completed,active,unconfirmed,unsuccessful,notStarted,unfulfilled,delivered,quantityUnknown; }
 [Serializable] public class CrewAgreement { public string pawn,name;public AgreementProgress progress; }
 [Serializable] public class CrewReport { public string world,epoch,branch;public int revision,tick;public CrewEntry[] entries;public CrewAgreement[] agreements;public SharedStatus[] sharedStatus;public string waiting,foodText,observerText,topicText; }
 [Serializable] public class CrewWire {public string world,epoch,branch,entryLines,agreementLines,statusLines,waiting,foodText,observerText,topicText;public int revision,tick;}
 [Serializable] public class CrewAgreementWire {public string pawn,name,id,kind,status;public int tick,agreed,completed,active,unconfirmed,unsuccessful,notStarted,unfulfilled,delivered,quantityUnknown;}
 [Serializable] public class CrewHeader {public string world,epoch,branch,waiting,foodText,observerText,topicText;public int revision,tick;}
 [Serializable] public class CrewAgreementHeader {public string pawn,name;}
 public static class CrewLog {
  private static CrewReport Parse(string json){
   var w=JsonUtility.FromJson<CrewWire>(json);if(w==null)return null;
   var entries=String.IsNullOrEmpty(w.entryLines)?new CrewEntry[0]:w.entryLines.Split('\n').Select(x=>JsonUtility.FromJson<CrewEntry>(x)).ToArray();
   var agreements=String.IsNullOrEmpty(w.agreementLines)?new CrewAgreement[0]:w.agreementLines.Split('\n').Select(x=>{
    var a=JsonUtility.FromJson<CrewAgreementWire>(x);return new CrewAgreement {pawn=a.pawn,name=a.name,progress=new AgreementProgress {id=a.id,kind=a.kind,status=a.status,tick=a.tick,agreed=a.agreed,completed=a.completed,active=a.active,unconfirmed=a.unconfirmed,unsuccessful=a.unsuccessful,notStarted=a.notStarted,unfulfilled=a.unfulfilled,delivered=a.delivered,quantityUnknown=a.quantityUnknown}};
   }).ToArray();
   return new CrewReport {world=w.world,epoch=w.epoch,branch=w.branch,revision=w.revision,tick=w.tick,entries=entries,agreements=agreements,waiting=w.waiting??"",foodText=w.foodText??"",observerText=w.observerText??"",topicText=w.topicText??"",sharedStatus=String.IsNullOrEmpty(w.statusLines)?new SharedStatus[0]:w.statusLines.Split('\n').Select(x=>JsonUtility.FromJson<SharedStatus>(x)).ToArray()};
  }
  public static string Json(WorldState w){
   var r=Read(w);if(r==null)return "null";
   return JsonUtility.ToJson(new CrewHeader {world=r.world,epoch=r.epoch,branch=r.branch,revision=r.revision,tick=r.tick,waiting=r.waiting,foodText=r.foodText,observerText=r.observerText,topicText=r.topicText}).TrimEnd('}')+",\"sharedStatus\":["+String.Join(",",r.sharedStatus.Select(s=>JsonUtility.ToJson(s)).ToArray())+"],\"entries\":["+String.Join(",",r.entries.Select(e=>JsonUtility.ToJson(e)).ToArray())+"],\"agreements\":["+String.Join(",",r.agreements.Select(a=>JsonUtility.ToJson(new CrewAgreementHeader {pawn=a.pawn,name=a.name}).TrimEnd('}')+",\"progress\":"+JsonUtility.ToJson(a.progress)+"}").ToArray())+"]}";
  }

  private static bool Short(string s,int n){return s!=null&&s.Length<=n;}
  public static CrewReport Read(WorldState w){
   if(w.crewReport==null&&!String.IsNullOrEmpty(w.crewJson))try{w.crewReport=Parse(w.crewJson);}catch(Exception e){Log.Warning("[Concord] Saved crew report parse failed: "+e.Message);w.crewJson=null;}
   return w.crewReport;
  }
  public static void Set(WorldState w,string epoch,string json){
   if(epoch!=w.epoch)throw new Exception("Stale crew log timeline");
   if(json==null||json.Length>2000000)throw new Exception("Crew report too large");
   var r=Parse(json);Guid branch;
   if(r==null)throw new Exception("Missing crew report");
   if(r.world!=w.world||r.epoch!=w.epoch)throw new Exception("Crew report world/epoch mismatch");
   if(!Guid.TryParse(r.branch,out branch)||r.revision<0)throw new Exception("Crew report branch/revision invalid");
   if(r.tick<0||r.tick>Find.TickManager.TicksGame)throw new Exception("Crew report tick invalid");
   if(r.entries==null||r.entries.Length>128||r.agreements==null||r.agreements.Length>12)throw new Exception("Crew report arrays invalid");
   if(r.sharedStatus.Length>16||!Short(r.waiting,400)||!Short(r.foodText,60000)||!Short(r.observerText,1600)||!Short(r.topicText,2400))throw new Exception("Invalid shared status bounds");
   foreach(var s in r.sharedStatus)if(s==null||!Short(s.pawn,120)||!Short(s.name,80)||s.source!="shared-link-telemetry"||s.epoch!=r.epoch||s.tick<0||s.tick>r.tick||!new[]{"satisfied","low","urgent","unknown"}.Contains(s.food)||!new[]{"satisfied","low","urgent","unknown"}.Contains(s.rest))throw new Exception("Invalid shared telemetry");
   int seq=0;
   foreach(var e in r.entries){
    if(e==null||e.seq<=seq||e.tick<0||e.tick>r.tick||(e.kind!="message"&&e.kind!="record")||!Short(e.actor,80)||!Short(e.recipient,80)||!Short(e.subject,120)||!Short(e.text,1000)||!Short(e.key,160))throw new Exception("Invalid crew entry");seq=e.seq;
   }
   foreach(var a in r.agreements){
    var p=a==null?null:a.progress;
    if(p==null||!Short(a.pawn,120)||!Short(a.name,80)||!Short(p.id,120)||!Short(p.kind,20)||!Short(p.status,20)||p.agreed<1||p.agreed>3||p.completed<0||p.active<0||p.unconfirmed<0||p.unsuccessful<0||p.notStarted<0||p.unfulfilled<0||p.delivered<0||p.quantityUnknown<0||p.completed+p.active+p.unconfirmed+p.unsuccessful+p.notStarted!=p.agreed||p.unfulfilled!=p.agreed-p.completed)throw new Exception("Invalid agreement progress");
   }
   var old=Read(w);
   if(old!=null&&old.epoch==w.epoch&&(old.branch!=r.branch||r.revision<old.revision||r.tick<old.tick))throw new Exception("Older or different crew report");
   w.crewJson=json;w.crewReport=r;w.crewReceived=Time.realtimeSinceStartup;
  }
 }
 public class MainTabWindow_Concord : MainTabWindow {
  private Vector2 logScroll,workScroll,supplyScroll;
  private string filter="all";
  private bool expanded=false,topics=false;
  private Vector2 compactScroll,boardScroll;
  public override Vector2 InitialSize {get{return new Vector2(420,Math.Min(670,UI.screenHeight-100));}}
  public override void DoWindowContents(Rect rect){
   if(Widgets.ButtonText(new Rect(rect.width-120,0,120,28),expanded?"Compact":"Full journal")){
    expanded=!expanded;windowRect.width=expanded?900:420;
    windowRect.x=Mathf.Clamp(windowRect.x,0,Math.Max(0,UI.screenWidth-windowRect.width));
    return;
   }
   if(expanded)DrawJournal(rect);else DrawCompact(rect);
  }
  private void DrawCompact(Rect rect){
   var w=Current.Game==null?null:Current.Game.GetComponent<WorldState>();var r=w==null?null:CrewLog.Read(w);
   Text.Font=GameFont.Small;var style=Text.CurFontStyle;bool rich=style.richText;style.richText=false;
   try{
    Widgets.Label(new Rect(0,0,rect.width-125,28),"CONCORD · Observer");
    bool fresh=r!=null&&r.epoch==w.epoch&&Time.realtimeSinceStartup-w.crewReceived<10f&&Find.TickManager.TicksGame-r.tick<=120;
    string clock=Find.TickManager.Paused?(DecisionPauses.Count>0?"Paused for deliberation":"Paused · game / operator"):"Game running";
    Widgets.Label(new Rect(0,30,rect.width,42),clock+" · tick "+Find.TickManager.TicksGame+"\n"+(fresh?"Current report":"Saved / stale report — not current"));
    if(r==null){Widgets.Label(new Rect(0,80,rect.width,90),"No coordinator report. This observer view cannot start agents or issue jobs.");return;}
    float y=78;
    foreach(var s in r.sharedStatus.Take(3)){
     bool current=fresh&&s.fresh&&Find.TickManager.TicksGame-s.tick<=120;
     var pawn=Find.CurrentMap==null?null:Find.CurrentMap.mapPawns.FreeColonistsSpawned.FirstOrDefault(p=>p.GetUniqueLoadID()==s.pawn);
     string job=pawn==null?"not on this map":pawn.CurJobDef==null?"idle":pawn.CurJobDef.defName=="Concord_Eat"?"eating":pawn.CurJobDef.label??pawn.CurJobDef.defName;
     Widgets.Label(new Rect(0,y,rect.width,42),s.name+" · "+job+"\nFood "+(current?s.food:"unknown")+" · Rest "+(current?s.rest:"unknown")+" · shared link");y+=45;
    }
    var status=(fresh?"":"Last report: ")+(r.observerText??"Scheduler state not reported.")+"\n"+r.waiting;
    float statusHeight=Text.CalcHeight(status,rect.width-20);
    Widgets.BeginScrollView(new Rect(0,y,rect.width,76),ref boardScroll,new Rect(0,0,rect.width-20,Math.Max(76,statusHeight)));
    Widgets.Label(new Rect(0,0,rect.width-20,statusHeight),status);Widgets.EndScrollView();y+=80;
    if(Widgets.ButtonText(new Rect(0,y,135,27),topics?"Show events":"Core topics")){topics=!topics;compactScroll=Vector2.zero;}
    Widgets.Label(new Rect(145,y,rect.width-145,27),topics?"Interpretations, not receipts":"Speech ≠ completion");y+=33;
    var area=new Rect(0,y,rect.width,Math.Max(40,rect.height-y));float width=rect.width-22;
    if(topics){string board="Core-authored topic board\n"+(String.IsNullOrEmpty(r.topicText)?"No topics reported.":r.topicText);float h=Text.CalcHeight(board,width);Widgets.BeginScrollView(area,ref compactScroll,new Rect(0,0,width,Math.Max(h,area.height)));Widgets.Label(new Rect(0,0,width,h),board);Widgets.EndScrollView();}
    else{
     var entries=r.entries.Reverse().ToArray();
     Func<CrewEntry,string> heading=e=>(e.kind=="message"?e.actor+" → "+e.recipient:e.actor+" · RECORD")+" · t"+e.tick;
     float total=entries.Sum(e=>Text.CalcHeight(heading(e),width)+Text.CalcHeight(e.text,width)+14);
     Widgets.BeginScrollView(area,ref compactScroll,new Rect(0,0,width,Math.Max(total,area.height)));float ey=0;
     foreach(var e in entries){float hh=Text.CalcHeight(heading(e),width),th=Text.CalcHeight(e.text,width);GUI.color=e.kind=="message"?new Color(1f,.8f,.45f):new Color(.65f,.85f,1f);Widgets.Label(new Rect(0,ey,width,hh),heading(e));GUI.color=Color.white;Widgets.Label(new Rect(0,ey+hh,width,th),e.text);ey+=hh+th+14;}
     Widgets.EndScrollView();
    }
   }finally{GUI.color=Color.white;Text.Font=GameFont.Small;style.richText=rich;}
  }
  private void DrawJournal(Rect rect){
   var w=Current.Game==null?null:Current.Game.GetComponent<WorldState>();var r=w==null?null:CrewLog.Read(w);
   Text.Font=GameFont.Small;var style=Text.CurFontStyle;var rich=style.richText;style.richText=false;
   try {
    Text.Font=GameFont.Medium;Widgets.Label(new Rect(0,0,rect.width-125,32),"Concord — crew log");Text.Font=GameFont.Small;
    Widgets.Label(new Rect(0,38,rect.width,45),"Observer view: addressed messages are not shared thoughts. Statements may be mistaken; records report game outcomes.");
    if(r==null){Widgets.Label(new Rect(0,100,rect.width,80),"No coordinator report yet. This panel is read-only; it does not start agents or change pawn work.");return;}
    bool fresh=r.epoch==w.epoch&&Time.realtimeSinceStartup-w.crewReceived<10f;
    Widgets.Label(new Rect(0,83,rect.width,28),(fresh?"Latest coordinator report":"Saved / last report — not live")+"  |  game tick "+r.tick);
    Widgets.Label(new Rect(0,112,rect.width,42),"Shared link · "+String.Join(" | ",r.sharedStatus.Select(s=>s.name+": Food "+(fresh&&s.fresh&&Find.TickManager.TicksGame-s.tick<=120?s.food:"unknown")+", Rest "+(fresh&&s.fresh&&Find.TickManager.TicksGame-s.tick<=120?s.rest:"unknown")+" @"+s.tick).ToArray()));
    Widgets.Label(new Rect(0,155,rect.width,25),"Waiting: "+r.waiting);
    Widgets.Label(new Rect(0,180,rect.width,25),"Agreements — receipt-based progress (up to 12 recent / running)");
    var workRect=new Rect(0,208,rect.width,77);var workView=new Rect(0,0,rect.width-22,Math.Max(140,r.agreements.Length*62));
    Widgets.BeginScrollView(workRect,ref workScroll,workView);
    float y=0;
    foreach(var a in r.agreements){var p=a.progress;
     Widgets.Label(new Rect(0,y,workView.width,25),a.name+" · "+p.kind+" · "+p.status+" — "+p.completed+" / "+p.agreed+" completed");
     Widgets.Label(new Rect(0,y+25,workView.width,32),"Active "+p.active+" · Unconfirmed "+p.unconfirmed+" · Unsuccessful "+p.unsuccessful+" · Not started "+p.notStarted+" · Unfulfilled "+p.unfulfilled+(p.kind=="haul"?" · Delivered "+p.delivered+" confirmed units"+(p.quantityUnknown>0?" · Unknown quantities "+p.quantityUnknown:""):""));y+=62;
    }
    Widgets.EndScrollView();
    if(Widgets.ButtonText(new Rect(0,296,110,28),"All")){filter="all";logScroll=Vector2.zero;}
    if(Widgets.ButtonText(new Rect(120,296,110,28),"Messages")){filter="message";logScroll=Vector2.zero;}
    if(Widgets.ButtonText(new Rect(240,296,110,28),"Records")){filter="record";logScroll=Vector2.zero;}
    if(Widgets.ButtonText(new Rect(355,296,110,28),"Supplies")){filter="supplies";}
    Widgets.Label(new Rect(475,299,rect.width-475,25),"Newest first · "+filter+" · last 128 entries");
    if(filter=="supplies"){
     string text=(fresh&&Find.TickManager.TicksGame-r.tick<=120?"Shared local sightings":"Saved / stale sightings — current supplies unknown")+"\n"+r.foodText;
     float h=Text.CalcHeight(text,rect.width-24);Widgets.BeginScrollView(new Rect(0,334,rect.width,rect.height-334),ref supplyScroll,new Rect(0,0,rect.width-24,Math.Max(h,rect.height-340)));Widgets.Label(new Rect(0,0,rect.width-24,h),text);Widgets.EndScrollView();return;
    }
    var entries=r.entries.Where(e=>filter=="all"||e.kind==filter).Reverse().ToArray();float width=rect.width-24;
    float total=entries.Sum(e=>36+Text.CalcHeight(e.text,width));
    Widgets.BeginScrollView(new Rect(0,334,rect.width,rect.height-334),ref logScroll,new Rect(0,0,width,Math.Max(total,rect.height-340)));
    y=0;
    foreach(var e in entries){
     GUI.color=e.kind=="message"?new Color(1f,.8f,.45f):new Color(.65f,.85f,1f);
     Widgets.Label(new Rect(0,y,width,25),(e.kind=="message"?"MESSAGE  ":"RECORD  ")+e.actor+(e.kind=="message"?" → "+e.recipient:"")+"  · tick "+e.tick);GUI.color=Color.white;
     float h=Text.CalcHeight(e.text,width);Widgets.Label(new Rect(0,y+26,width,h),e.text);y+=36+h;
    }
    Widgets.EndScrollView();
   }finally{GUI.color=Color.white;Text.Font=GameFont.Small;style.richText=rich;}
  }
 }
}
