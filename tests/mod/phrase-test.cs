// Wording of receipt-backed narration (mod/HarnessNarration.cs, Phrase). Local only: needs a built
// Concord.dll, which needs the game assemblies. Run: scripts/test-mod-phrases.sh
using System;using System.Collections.Generic;using Concord;
class T{static int fail=0;static void Eq(string a,string b){if(a!=b){Console.WriteLine("FAIL\n got:  "+a+"\n want: "+b);fail++;}else Console.WriteLine("ok   "+a);}
static void Main(){
Eq(Phrase.Core("placed "+Phrase.A("campfire blueprint")+" outdoors, next to the wall"),"The core placed a campfire blueprint outdoors, next to the wall.");
Eq(Phrase.Core("added a bill at the campfire: cook simple meal, "+Phrase.Repeat("count",3,0)),"The core added a bill at the campfire: cook simple meal, 3 times.");
Eq(Phrase.Repeat("count",1,0),"once");Eq(Phrase.Repeat("until",0,10),"until there are 10");Eq(Phrase.Repeat("forever",1,10),"forever");
Eq(Phrase.A("oak table"),"an oak table");
Eq(Phrase.List(new List<string>{"wood"}),"wood");Eq(Phrase.List(new List<string>{"wood","steel"}),"wood and steel");Eq(Phrase.List(new List<string>{"a","b","c","d","e"}),"a, b, c and 2 more");Eq(Phrase.List(new List<string>()),"nothing");
Eq(Phrase.Refused("place a campfire blueprint","Space already occupied by Beatrice.","game"),"The game refused the core's request to place a campfire blueprint: Space already occupied by Beatrice.");
Eq(Phrase.Refused("add a bill","not a colony workbench","harness"),"The core's request to add a bill was not sent to the game (harness check): not a colony workbench.");
Eq(Phrase.Uncertain("change a zone"),"The core's request to change a zone hit an unexpected error; its outcome is uncertain.");
Eq(Phrase.Core(Phrase.DesignationVerb("cut","oak tree")+" outdoors"),"The core marked the oak tree to be cut outdoors.");
Environment.Exit(fail);}}
