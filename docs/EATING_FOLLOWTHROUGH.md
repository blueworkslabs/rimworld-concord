# Pawn-owned eating: bounded live follow-through

## Frozen protocol

One `eating-followup-v1` trial on the explicit pawn-owned eating implementation
from PR53. Earlier trials, failures and allowances remain unchanged.

- Six core attempts and six pawn attempts maximum, zero Jev, no operator rerolls.
  Fresh immutable native-Claude-Max ledgers reserve 0.60 USD API-equivalent each.
  Unused slots stay unused; no billing route or provider spending cap is changed.
- 120 seconds of native activity with explicit inference pauses, 45-second decision
  deadlines, a 15-minute game deadline and bounded cleanup.
- Same campfire-v2 fixture and open coordination brief: Food .40/.65/.55, Rest .90,
  225 berries, no ready meals, unchanged traits/skills, native self-care enabled,
  ordinary work priorities disabled. No prescribed question, recipient or outcome.
- A pawn answering a question may speak, stay silent, or explicitly select a supplied
  eating option. Speech alone starts no job. No active commitment can be overridden.
  Native diet, forbidden-item, reachability and reservation checks remain mandatory.
- Separately assess validation, dialogue, typed choices, consumption receipts and
  actual work. Eating is self-care, not hauled stock or a completed work agreement.
- Before live inference: independent review and a 30-second scripted rehearsal
  through the same relay, requiring actual consumption outside the mock callback,
  then paired and cold restore. Scripted behavior is not live evidence.
- End with bounded operator cleanup, paired restore and full restart without calls.
  Restore compares self-care identities/requests as well as outcomes and core state.

Use the existing exclusive-lock launcher with separate private scripted/live
configurations and `policy: "eating-followup-v1"`:

```
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted
# After a full game restart:
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted --cold
# Separate fresh live configuration: omit --scripted; then cold-check it.
```

This is one authored situation, not a controlled estimate of causal influence or
proof of general planning. Refusal, silence, waiting and speech-only replies remain
valid. No extra run will be appended to obtain a preferred result.

## Retained live result

Behavior `2ee10a6e685879f424b89cf967a7b7514be14c28`. **Six core attempts and
three pawn replies all passed and were applied/delivered.** Two core answers used
bounded formatting recovery. No provider failure, rejected reply or operator
reroll occurred; three unused pawn slots stayed unused.

Alvin selected the typed `eat` choice after a food question, targeting a supplied
berry stack. Native execution confirmed **12 berries consumed**. His sampled Food
rose from .400 to .980, then declined to .808 by the end. The selected portion and
consumption are separate from his spoken words. This was deliberately chosen
self-care before urgent hunger, not a core-issued eating order or native selection
finally crossing its autonomous raw-food threshold.

The reply triggered a core turn that saw the eating job started with zero consumed
and waited. A later telemetry update still had a started receipt; the core did not
substitute that band for completed consumption. The completed receipt then reached
the core, which acknowledged it and waited. No work proposal, agreement job,
campfire or cooking resulted. Food consumption is not hauling: the work summary
correctly records zero delivered work units/trips alongside one self-care outcome.

Pedro's later Food-band change prompted a question. His supplied view contained
neither eligible eating options nor locally sighted food; he chose a speech-only
reply saying he would go if directed. Beatrice subsequently gave directions in a
reply that addressed “Pedro” in its text. **Its actual recipient remained Core.**
Pedro's retained messages do not contain Beatrice's reply; no movement or eating
command was dispatched for either speaker. This is not a successful relay of help.

The run covered 120,772 ms of native activity and 87 unpaused samples outside
explicit inference pauses, including seven `Concord_Eat` job samples. Native
wandering and other jobs also continued; “no agreement work” does not mean the
whole game was inactive. No inference or action was added after the fixed trial.

## Grounding and remaining boundaries

- One core topic calls the receipt “consumption of 12 nutrition.” It is **12 food
  units**, not 12 nutrition. All original outputs are retained, not silently edited.
- “Berry patches” describes item stacks imprecisely. Directions are speech, not
  automatically navigation goals, and naming a pawn in text does not address them.
- Alvin's topic prose says follow-up is complete, but its status remains open.
  Existing closure eligibility concerns linked work proposals, not these self-care
  receipts. Do not interpret an open topic as proof that eating failed, or weaken
  unrelated work-topic closure to hide it.
- All three pawns were heard, but only Alvin chose and completed eating. This one
  authored situation does not establish generally appropriate eating decisions,
  durable personalities, successful communication to Pedro or multi-step cooking.
- The old provider failures, old trial records and original caps remain unchanged.

## Verification

- 326 Node and eleven Python checks passed. Independent Codex review of the final
  behavior found no actionable defects; source reads and actual errno-13 denied
  writes verified. Reviewer no-emit checking and focused compiled tests passed;
  full author tests ran separately because reviewer build writes are prohibited.
- Scripted same-relay rehearsal consumed 12 berries with no model calls, and both
  scripted and live paired/full restart retained self-care requests, identities,
  outcomes, conversation and core state. Cold checks made no extra calls and
  preserved consumed allowances.
- Core/pawn provider usage estimates were 0.363357/0.078063 USD API-equivalent,
  not cash charges or a changed billing route. Zero Jev.
- All 228 historical database-related files are unchanged. Staging stopped.
- The saved Records-panel capture after cold restart shows chosen, started and
  completed consumption separately. Its unknown link bands are saved-report
  state, not a new live observation of the pawns.
- [Complete outputs, diagnostic traces, situations and records](evidence/eating-followthrough.json).

Next: make self-care receipt units and communication destinations explicit, and
support evidence-linked completion of self-care follow-up without changing work
consent. Do not parse prose as forwarding, navigation or a fresh eating choice.
