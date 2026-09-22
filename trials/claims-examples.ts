/**
 * Hand-encoded claims for replies already retained in docs/evidence/outlook-grounding.json.
 * These encodings are AUTHORED by a reviewer to show what the scorer would report if the
 * model had emitted structured claims. The structured claims are not model output and prove nothing about
 * either model. Reason text is quoted verbatim from the retained evidence.
 */
import type {Claim} from './claims.js';
export const claimExamples:Array<{id:string;model:string;caseId:string;reason:string;claims:Claim[];reviewerNote:string}>=[
 {id:'claude-needs-low-r1',model:'claude-sonnet-4-6',caseId:'needs-low',
  reason:"Food and Rest are both at 10%, well below the 0.35 threshold that stops hauling work. I'd collapse before completing even one trip. I need to eat and sleep before taking on any labor.",
  claims:[
   {kind:'fact',text:'Food is at 10%',subject:'Food',source:'pawn.needs.Food.fractionFilled',assertion:{op:'eq',value:10,unit:'percent'}},
   {kind:'fact',text:'Rest is at 10%',subject:'Rest',source:'pawn.needs.Rest.fractionFilled',assertion:{op:'eq',value:10,unit:'percent'}},
   {kind:'fact',text:'both are below the 0.35 stop threshold',subject:'Food',source:'pawn.needs.Food.fractionFilled',assertion:{op:'lt',value:.35}},
   {kind:'forecast',text:"I'd collapse before completing even one trip",basis:['pawn.needs.Food.fractionFilled']},
  ],
  reviewerNote:'Two correct facts, one correct comparison, one unverified forecast. The forecast is counted, not marked false; nothing in the perspective supports or rules out collapse.'},
 {id:'claude-outlook-protect-time-r2',model:'claude-sonnet-4-6',caseId:'outlook-protect-time',
  reason:"My food is at 40% and dropping. I'd rather eat before taking on hauling work — the job could stall mid-way if I get too hungry, and I prefer to meet my own needs first.",
  claims:[
   {kind:'fact',text:'food is at 40%',subject:'Food',source:'pawn.needs.Food.fractionFilled',assertion:{op:'eq',value:40,unit:'percent'}},
   {kind:'fact',text:'and dropping',subject:'Food',source:'pawn.needs.Food.fractionFilled',assertion:{op:'is',value:'dropping'}},
   {kind:'forecast',text:'the job could stall mid-way if I get too hungry',basis:['pawn.needs.Food.fractionFilled']},
   {kind:'preference',text:'I prefer to meet my own needs first',source:'character.outlook.notes[0]'},
  ],
  reviewerNote:'"Dropping" is a trend claim against a single reading: unscorable, which is the honest verdict. The preference correctly cites the authored outlook note.'},
 {id:'luna-needs-low-r1',model:'gpt-5.6-luna',caseId:'needs-low',
  reason:'I am very hungry and exhausted, so I am not ready for hauling work.',
  claims:[
   {kind:'fact',text:'I am very hungry',subject:'Food',source:'pawn.needs.Food.fractionFilled',assertion:{op:'band',value:'low'}},
   {kind:'fact',text:'I am exhausted',subject:'Rest',source:'pawn.needs.Rest.fractionFilled',assertion:{op:'band',value:'low'}},
  ],
  reviewerNote:'Qualitative words become checkable through the band policy. The numeric-regex scorer saw nothing here; this scorer sees two supported facts.'},
 {id:'luna-outlook-protect-time-r1',model:'gpt-5.6-luna',caseId:'outlook-protect-time',
  reason:'I can do a shorter nearby haul agreement, while keeping time for my needs.',
  claims:[
   {kind:'preference',text:'keeping time for my needs',source:'character.outlook.notes[0]'},
   {kind:'fact',text:'the haul is nearby',subject:'wood',source:'pawn.hauling.supplies.wood@4,2.sourceCount',assertion:{op:'gt',value:0}},
  ],
  reviewerNote:'Second claim is deliberately weak: "nearby" is not what sourceCount says. The scorer marks it supported because the assertion (count > 0) is true, which shows the limit: the scorer checks the assertion, not whether the assertion captures the prose. A stricter encoding would cite no field and be unscorable.'},
 {id:'authored-luna-hunger-mixup',model:'gpt-5.6-luna (contract probe, 2026-09-22)',caseId:'probe',
  reason:'I am severely hungry and tired, so I cannot safely commit to rescuing Bea.',
  claims:[
   {kind:'fact',text:'severe hunger',subject:'Food',source:'pawn.needs.Food.fractionFilled',assertion:{op:'band',value:'low'}},
   {kind:'fact',text:'tiredness',subject:'Rest',source:'pawn.needs.Rest.fractionFilled',assertion:{op:'band',value:'low'}},
  ],
  reviewerNote:'Encoded against the full-needs view to show the contradiction verdict this scorer would have produced for the earlier probe.'},
];
