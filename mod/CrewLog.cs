using System;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;
namespace Concord {
 [Serializable] public class CrewEntry { public int seq,tick;public string kind,actor,recipient,subject,text,key; }
 [Serializable] public class AgreementProgress { public string id,kind,status;public int tick,agreed,completed,active,unconfirmed,unsuccessful,notStarted,unfulfilled,delivered,quantityUnknown; }
 [Serializable] public class CrewAgreement { public string pawn,name;public AgreementProgress progress; }
 [Serializable] public class CrewReport { public string world,epoch,branch;public int revision,tick;public CrewEntry[] entries;public CrewAgreement[] agreements; }
 [Serializable] public class CrewWire {public string world,epoch,branch,entryLines,agreementLines;public int revision,tick;}
 [Serializable] public class CrewAgreementWire {public string pawn,name,id,kind,status;public int tick,agreed,completed,active,unconfirmed,unsuccessful,notStarted,unfulfilled,delivered,quantityUnknown;}
 [Serializable] public class CrewHeader {public string world,epoch,branch;public int revision,tick;}
 [Serializable] public class CrewAgreementHeader {public string pawn,name;}
 public static class CrewLog {
  private static CrewReport Parse(string json){
   var w=JsonUtility.FromJson<CrewWire>(json);if(w==null)return null;
   var entries=String.IsNullOrEmpty(w.entryLines)?new CrewEntry[0]:w.entryLines.Split('\n').Select(x=>JsonUtility.FromJson<CrewEntry>(x)).ToArray();
   var agreements=String.IsNullOrEmpty(w.agreementLines)?new CrewAgreement[0]:w.agreementLines.Split('\n').Select(x=>{
    var a=JsonUtility.FromJson<CrewAgreementWire>(x);return new CrewAgreement {pawn=a.pawn,name=a.name,progress=new AgreementProgress {id=a.id,kind=a.kind,status=a.status,tick=a.tick,agreed=a.agreed,completed=a.completed,active=a.active,unconfirmed=a.unconfirmed,unsuccessful=a.unsuccessful,notStarted=a.notStarted,unfulfilled=a.unfulfilled,delivered=a.delivered,quantityUnknown=a.quantityUnknown}};
   }).ToArray();
   return new CrewReport {world=w.world,epoch=w.epoch,branch=w.branch,revision=w.revision,tick=w.tick,entries=entries,agreements=agreements};
  }
  public static string Json(WorldState w){
   var r=Read(w);if(r==null)return "null";
   return JsonUtility.ToJson(new CrewHeader {world=r.world,epoch=r.epoch,branch=r.branch,revision=r.revision,tick=r.tick}).TrimEnd('}')+",\"entries\":["+String.Join(",",r.entries.Select(e=>JsonUtility.ToJson(e)).ToArray())+"],\"agreements\":["+String.Join(",",r.agreements.Select(a=>JsonUtility.ToJson(new CrewAgreementHeader {pawn=a.pawn,name=a.name}).TrimEnd('}')+",\"progress\":"+JsonUtility.ToJson(a.progress)+"}").ToArray())+"]}";
  }

  private static bool Short(string s,int n){return s!=null&&s.Length<=n;}
  public static CrewReport Read(WorldState w){
   if(w.crewReport==null&&!String.IsNullOrEmpty(w.crewJson))try{w.crewReport=Parse(w.crewJson);}catch{}
   return w.crewReport;
  }
  public static void Set(WorldState w,string epoch,string json){
   if(epoch!=w.epoch)throw new Exception("Stale crew log timeline");
   if(json==null||json.Length>220000)throw new Exception("Crew report too large");
   var r=Parse(json);Guid branch;
   if(r==null)throw new Exception("Missing crew report");
   if(r.world!=w.world||r.epoch!=w.epoch)throw new Exception("Crew report world/epoch mismatch");
   if(!Guid.TryParse(r.branch,out branch)||r.revision<0)throw new Exception("Crew report branch/revision invalid");
   if(r.tick<0||r.tick>Find.TickManager.TicksGame)throw new Exception("Crew report tick invalid");
   if(r.entries==null||r.entries.Length>128||r.agreements==null||r.agreements.Length>12)throw new Exception("Crew report arrays invalid");
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
  private Vector2 logScroll,workScroll;
  private string filter="all";
  public override Vector2 InitialSize {get{return new Vector2(900,670);}}
  public override void DoWindowContents(Rect rect){
   var w=Current.Game==null?null:Current.Game.GetComponent<WorldState>();var r=w==null?null:CrewLog.Read(w);
   Text.Font=GameFont.Small;var style=Text.CurFontStyle;var rich=style.richText;style.richText=false;
   try {
    Text.Font=GameFont.Medium;Widgets.Label(new Rect(0,0,rect.width,32),"Concord — crew log");Text.Font=GameFont.Small;
    Widgets.Label(new Rect(0,38,rect.width,45),"Observer view: addressed messages are not shared thoughts. Statements may be mistaken; records report game outcomes.");
    if(r==null){Widgets.Label(new Rect(0,100,rect.width,80),"No coordinator report yet. This panel is read-only; it does not start agents or change pawn work.");return;}
    bool fresh=r.epoch==w.epoch&&Time.realtimeSinceStartup-w.crewReceived<10f;
    Widgets.Label(new Rect(0,83,rect.width,28),(fresh?"Latest coordinator report":"Saved / last report — not live")+"  |  game tick "+r.tick);
    Widgets.Label(new Rect(0,112,rect.width,25),"Agreements — receipt-based progress (up to 12 recent / running)");
    var workRect=new Rect(0,140,rect.width,145);var workView=new Rect(0,0,rect.width-22,Math.Max(140,r.agreements.Length*62));
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
    Widgets.Label(new Rect(365,299,rect.width-365,25),"Newest first · "+filter+" · last 128 entries");
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
