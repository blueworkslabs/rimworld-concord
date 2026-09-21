using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Verse;

namespace Concord
{
    // An independent force-pause layer: never writes CurTimeSpeed, including on release.
    // Wall-clock expiry runs from the bridge Update even when simulation is paused.
    public static class DecisionPauses
    {
        class Lease { public string epoch,actor; public float until; }
        static readonly Dictionary<string,Lease> leases=new Dictionary<string,Lease>();
        static PauseWindow window;
        public static int Count { get { return leases.Count; } }
        public static void Set(string epoch,string actor,string id,int ttl) {
            var w=Current.Game.GetComponent<WorldState>(); Guid parsed;
            if(epoch!=w.epoch)throw new Exception("Stale pause timeline");
            if(!Guid.TryParse(id,out parsed)||ttl<0||ttl>120000)throw new Exception("Invalid decision pause");
            if(!Find.CurrentMap.mapPawns.FreeColonistsSpawned.Any(p=>p.GetUniqueLoadID()==actor))throw new Exception("Unknown pause actor");
            Lease old;
            if(leases.TryGetValue(id,out old)&&(old.epoch!=epoch||old.actor!=actor))throw new Exception("Pause ownership mismatch");
            if(ttl==0)leases.Remove(id);
            else {
                if(!leases.ContainsKey(id)&&leases.Count>=3)throw new Exception("Too many decision pauses");
                leases[id]=new Lease {epoch=epoch,actor=actor,until=Time.realtimeSinceStartup+ttl/1000f};
            }
            Update();
        }
        public static void Update() {
            var world=Current.Game==null?null:Current.Game.GetComponent<WorldState>();
            var epoch=world==null?null:world.epoch;
            foreach(var id in leases.Keys.ToArray())
                if(leases[id].epoch!=epoch||Time.realtimeSinceStartup>=leases[id].until)leases.Remove(id);
            if(leases.Count>0&&Find.WindowStack!=null) {
                if(window==null||!Find.WindowStack.Windows.Contains(window)) {window=new PauseWindow();Find.WindowStack.Add(window);}
            } else if(window!=null) {if(Find.WindowStack!=null)Find.WindowStack.TryRemove(window,false);window=null;}
        }
        class PauseWindow:Window {
            public PauseWindow() {
                forcePause=true;closeOnAccept=false;closeOnCancel=false;
                doCloseX=false;doCloseButton=false;absorbInputAroundWindow=false;
                preventCameraMotion=false;focusWhenOpened=false;draggable=true;
                layer=WindowLayer.GameUI;
            }
            public override Vector2 InitialSize {get{return new Vector2(310,80);}}
            protected override void SetInitialSizeAndPosition() {windowRect=new Rect(12,80,InitialSize.x,InitialSize.y);}
            public override void DoWindowContents(Rect rect) {Widgets.Label(rect,"Concord: paused for deliberation\n"+Count+" active thought(s); bounded wait.");}
        }
    }
}
