using System;
using System.Collections.Generic;
using System.Linq;
using RimWorld;
using UnityEngine;
using Verse;

namespace Concord {
    [Serializable] public class NativeEvent : IExposable {
        public int seq,tick; public string pawn,kind,detail,subject;
        public void ExposeData() {
            Scribe_Values.Look(ref seq,"seq"); Scribe_Values.Look(ref tick,"tick");
            Scribe_Values.Look(ref subject,"subject");Scribe_Values.Look(ref pawn,"pawn"); Scribe_Values.Look(ref kind,"kind"); Scribe_Values.Look(ref detail,"detail");
        }
    }
    [Serializable] public class Fact { public string key,value; public float level; }
    public class Sample {
        public string job; public int health,food,rest,mood;
        public HashSet<Thought_Memory> memories;
    }
    public class Thinking { public string id; public float until; }
    public static class Awareness {
        static int Band(float value) { return (int)(value*5); }
        public static Sample Read(Pawn p) {
            return new Sample { job=p.CurJobDef==null?"":p.CurJobDef.defName,
                health=Band(p.health.summaryHealth.SummaryHealthPercent),
                food=Band(p.needs.food==null?1:p.needs.food.CurLevelPercentage),
                rest=Band(p.needs.rest==null?1:p.needs.rest.CurLevelPercentage),
                mood=Band(p.needs.mood==null?1:p.needs.mood.CurLevelPercentage),
                memories=new HashSet<Thought_Memory>(p.needs.mood==null?new List<Thought_Memory>():p.needs.mood.thoughts.memories.Memories) };
        }
        public static string Facts(Pawn p) {
            var facts=new List<Fact>();
            if(p.story!=null) foreach(var t in p.story.traits.allTraits)
                facts.Add(new Fact {key="trait",value=t.Label,level=t.Degree});
            if(p.skills!=null) foreach(var s in p.skills.skills)
                facts.Add(new Fact {key="skill",value=s.def.defName,level=s.Level});
            if(p.needs!=null) foreach(var n in p.needs.AllNeeds)
                facts.Add(new Fact {key="need",value=n.def.defName,level=n.CurLevelPercentage});
            if(p.needs.mood!=null) foreach(var m in p.needs.mood.thoughts.memories.Memories)
                facts.Add(new Fact {key="memory",value=m.def.defName+(m.otherPawn==null?"":" concerning "+m.otherPawn.GetUniqueLoadID()),level=m.age});
            // Only this pawn's direct relations, not the other pawn's thoughts or opinions.
            if(p.relations!=null) foreach(var r in p.relations.DirectRelations)
                facts.Add(new Fact {key="relation",value=r.def.defName+":"+r.otherPawn.GetUniqueLoadID()});
            return "["+String.Join(",",facts.Select(f=>JsonUtility.ToJson(f)).ToArray())+"]";
        }
    }
}
