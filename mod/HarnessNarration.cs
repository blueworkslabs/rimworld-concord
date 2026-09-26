using System;
using System.Collections.Generic;
using System.Linq;
using RimWorld;
using Verse;

namespace Concord {
    // Receipt-backed narration of harness actions (docs/PHASE2.md, step A.1). One line per game-editing
    // request, written after the game has answered and from what the game reads back, never from the
    // request alone. The core is the decision-maker in every line; no pawn is said to agree or refuse.
    // The line lives on the saved receipt, so a replayed, retried or restored request (which returns its
    // stored receipt) cannot write it twice. It is shown as a native message, so a viewer of the
    // recording sees it even while the game is paused, and it is listed in the Concord tab.

    /** Wording only, no game types: kept apart so it reads as one voice. */
    public static class Phrase {
        public static string A(string noun){if(String.IsNullOrEmpty(noun))return noun;return ("aeiou".IndexOf(Char.ToLowerInvariant(noun[0]))>=0?"an ":"a ")+noun;}
        public static string List(IList<string> items,int max=3){
            if(items.Count==0)return "nothing";
            var shown=items.Take(max).ToList();var more=items.Count-shown.Count;
            if(more>0)return String.Join(", ",shown.ToArray())+" and "+more+" more";
            return shown.Count==1?shown[0]:String.Join(", ",shown.Take(shown.Count-1).ToArray())+" and "+shown[shown.Count-1];
        }
        public static string Sentence(string s){s=s.Trim();return s.EndsWith(".")?s:s+".";}
        public static string Core(string rest){return Sentence("The core "+rest);}
        public static string Refused(string attempt,string reason,string source){
            var why=String.IsNullOrEmpty(reason)?"no reason given":reason.TrimEnd('.');
            if(source=="game")return Sentence("The game refused the core's request to "+attempt+": "+why);
            return Sentence("The core's request to "+attempt+" was rejected (harness check): "+why);
        }
        public static string Uncertain(string attempt){return Sentence("The core's request to "+attempt+" hit an unexpected error; its outcome is uncertain");}
        public static string Repeat(string mode,int repeatCount,int targetCount){
            return mode=="count"?(repeatCount==1?"once":repeatCount+" times"):mode=="until"?"until there are "+targetCount:"forever";
        }
        public static string DesignationVerb(string mode,string target){
            switch(mode){
            case "deconstruct":return "marked the "+target+" for deconstruction";
            case "cancel":return "cancelled the orders on the "+target;
            case "mine":return "marked the "+target+" for mining";
            case "harvest":return "marked the "+target+" for harvesting";
            case "cut":return "marked the "+target+" to be cut";
            case "hunt":return "marked the "+target+" for hunting";
            case "haul":return "marked the "+target+" for hauling";
            default:return "gave a "+mode+" order on the "+target;
            }
        }
    }

    [HarmonyLib.HarmonyPatch(typeof(Messages),"AcceptsMessage")]
    public static class Patch_HarnessMessageIdentity {
        static bool Prefix(string text,LookTargets lookTargets,ref bool __result){
            var msg=HarnessNarration.publishing;
            if(msg==null||msg.text!=text||!Object.ReferenceEquals(msg.lookTargets,lookTargets))return true;
            __result=true;return false;
        }
    }

    public static class HarnessNarration {
        static Map Map{get{return Find.CurrentMap;}}
        /** Where, in the terms a viewer has: the room the game assigns (or outdoors), and the nearest
         *  visible colony building. Nothing that is not on the map is said. */
        public static string Where(IntVec3 c,Thing except=null){
            var map=Map;if(map==null||!c.InBounds(map))return "";
            if(c.Fogged(map))return "at an undiscovered location";
            var room=c.GetRoom(map);string place;
            if(room==null||room.PsychologicallyOutdoors)place="outdoors";
            else if(room.Role!=null&&room.Role!=RoomRoleDefOf.None)place="in the "+room.Role.label;
            else place="indoors";
            var near=GenRadial.RadialDistinctThingsAround(c,map,4.5f,true).OfType<Building>()
                .Where(b=>b!=except&&b.Faction==Faction.OfPlayer&&!(b is Frame)&&!b.Position.Fogged(map))
                .OrderBy(b=>b.Position.DistanceToSquared(c)).FirstOrDefault();
            return near==null?place:place+", next to the "+near.LabelNoCount;
        }
        /** What the request tried to do, for a refusal line: built from the request, labels where known. */
        public static string Attempt(Request r){
            switch(r.action){
            case "place_blueprint":{var def=String.IsNullOrEmpty(r.def)?null:DefDatabase<ThingDef>.GetNamedSilentFail(r.def);return "place "+Phrase.A((def!=null?def.label:r.def??"building")+" blueprint");}
            case "designate":return "give "+Phrase.A((r.mode??"")+" order");
            case "zone":return r.zoneId>=0?"change a zone":"lay out "+Phrase.A((r.mode??"")+" zone");
            case "bill":{var rec=String.IsNullOrEmpty(r.recipe)?null:DefDatabase<RecipeDef>.GetNamedSilentFail(r.recipe);return "add a bill"+(rec!=null?" to "+rec.label:"");}
            case "bill_edit":return "change a bill";
            case "bill_delete":return "remove a bill";
            case "work_priority":return "change a work priority";
            case "schedule":return "change a schedule";
            case "forbid":return r.flag?"forbid something":"allow something";
            case "allow_area":return "change an area restriction";
            default:return "use an unknown control";
            }
        }
        // Scope the duplicate-text exception to exactly this synchronous receipt publication. Native
        // messages otherwise coalesce two distinct requests with identical text and targets.
        [ThreadStatic] internal static Message publishing;
        /** "shown" means accepted into the native live list, not proof of a rendered/readable frame. */
        public static void Show(HarnessReceipt receipt,Thing look){
            if(String.IsNullOrEmpty(receipt.narration)){receipt.narrated="none";return;}
            var previous=publishing;
            try{
                var msg=look!=null&&look.Spawned
                    ?new Message(receipt.narration,MessageTypeDefOf.SilentInput,look.def.saveCompressible?new LookTargets(new TargetInfo(look.Position,look.Map)):new LookTargets(look))
                    :new Message(receipt.narration,MessageTypeDefOf.SilentInput);
                publishing=msg;Messages.Message(msg,true);
                receipt.narrated=Messages.IsLive(msg)?"shown":"display failed: native message not accepted";
            }catch(Exception e){receipt.narrated="display failed: "+e.GetType().Name;}
            finally{publishing=previous;}
        }
        /** The narrated receipts as crew-log records for the Concord tab (actor: the core). */
        public static CrewEntry[] Entries(){
            var s=HarnessState.Get();if(s==null)return new CrewEntry[0];
            return s.receipts.Where(x=>!String.IsNullOrEmpty(x.narration)).Select(x=>new CrewEntry{seq=x.seq,tick=x.tick,kind="record",actor="Core",text=x.narration,hasMap=x.mapId>=0,mapId=x.mapId}).ToArray();
        }
    }
}
