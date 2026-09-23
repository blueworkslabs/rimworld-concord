# Food-sighting follow-through

## Frozen protocol

One new `food-followup-v1` run after independent food observations (PR45).
This is not a replay appended to the earlier campfire or follow-up trial.

- At most six core and six pawn attempts, zero Jev; no operator retries or rerolls.
  Separate fresh native-Claude-Max ledgers reserve 0.60 USD API-equivalent each,
  not cash billing. Historical trial identities and limits are unchanged.
- Two minutes of native activity, explicit inference pauses, 45s decision limit,
  15-minute game deadline plus bounded cleanup. Unused slots stay unused.
- Original campfire-v2 fixture and open coordination brief: no ready meals or
  stove, 225 berries, unchanged pawn traits/skills; native self-care enabled,
  ordinary work priorities disabled. Food starts .40/.65/.55, Rest .90.
- New attributed local food/campfire sightings are available independently of
  jobs. Repeated sightings of a stack are not additional inventory. Visible
  forbidden food is not permission to use it.
- Questions, refusal, raw eating, proposals and waiting are valid branches. No
  particular recipient, work outcome or campfire chain is required. Speech is
  not consent. Every job still requires a fresh bound-pawn decision.
- Preserve raw structured outputs, failed attempts and text-free provider stream
  counts. The strict successful-result turn bound remains two. Event counts are
  diagnostics, not a new inference allowance or complete provider execution trace.
- Scripted question/reply/wait rehearsal and paired/cold restore before live.
  At the live window end, stop owned work and retire offers, preserve outcomes,
  verify paired/full restart without inference, then stop staging.

The existing locked follow-up launcher is reused. A private absolute-path host
configuration sets `policy` to `food-followup-v1`; omission retains the old
`core-followup-v1` policy. Rehearsal and live configurations have separate output
paths and ledger locations. Exact deployment digest covers compiled sources and
launcher. Never reset or reuse an exhausted ledger.

```
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted
# After full game restart, same scripted configuration:
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted --cold
# Live: separate fresh configuration, omit --scripted; verify --cold after restart.
```

This short paused trial cannot establish sustained autonomous planning, causal
benefit of the new observations, stable personalities or continuous inference.
The prior failed runs remain evidence.

## Retained result

Behavior commit `e02077373aebb101def77686809393fd2a712a45`. The single live run
used **six core attempts and three pawn attempts**, with no Jev calls. It is a
failed inference trial with successful persistence, not an all-green planning run.

1. The first request (tick 91) contained attributed berry sightings and ten local
   work options. The second (tick 1964) still included food sightings and two
   options. Both returned provider error results with no structured choice, zero
   reported usage and an empty model-usage object. They were counted and rejected.
   The retained metadata does not establish the error's cause.
2. At tick 5639, all three current local sightings were empty and there were no
   work options. This time the core asked Alvin about food sources. Alvin replied,
   then reply-triggered turns asked Beatrice and Pedro. All three replies reached
   the core. Empty local sightings are not proof that food is absent globally.
3. The sixth attempt returned a structured wait choice but reported three turns,
   exceeding the unchanged two-turn guard; it was not applied. A separate offline
   check confirms that the returned wait passes the game choice contract; that
   does not override the provider rejection. New diagnostics
   record two distinct assistant messages, two StructuredOutput calls, two user
   events/tool results and one tool-result error. This supports an extra internal
   formatting attempt, but does not identify its exact cause or reconstruct PR44's
   earlier failure. No operator replay or replacement call was added.

**Zero work proposals, jobs, completed campfires or cooked meals.** Three pawn
slots stayed unused. Native observation lasted 120,993 ms; all 88 sampled states
were unpaused outside deliberate inference pauses. No Ingest job was sampled;
this is not a complete native eating-event history.

The replies generally respected the current sighting bounds. Pedro's volunteered
“39% food” matches his own approximately 39.4% reading; this is deliberate speech,
not the core receiving his private meter. His “No food on me” is not established
by a complete inventory in the supplied perspective; an empty carrying field
alone is insufficient. No private character conclusions are asserted.

The two-minute authored fixture, changed allowance and early provider errors
prevent a controlled causal comparison with PR44. This run does not show that
food sightings improved planning, nor that the core ignored available berries
when it successfully answered. Its successful turns had no current food sighting
or work option. Earlier sightings remain in the operator evidence; the current
core view is not a durable last-known resource map.

## Verification and next step

- 300 Node and 10 Python checks passed; independent final-behavior Codex review
  completed with no actionable findings. Raw reports remain private.
- Scripted question/reply/wait, paired restore and full restart passed. Its initial
  view contained local food before any cooking option; no live judgment implied.
- Live paired and cold restore preserved conversations, failures and consumed
  allowances with no extra inference. 221 historical database-related files were
  unchanged. Staging was stopped.
- Reported API-equivalent usage: core 0.1486098 + pawns 0.091476 USD, not cash
  billing. Reserved allowance stays consumed even for failed attempts.

[Complete retained outputs, diagnostics and core situations](evidence/food-followthrough.json).
No separate diary entry for this operational check. The panel still does not
explain coordination failures or exhausted allowances. Before another colony
allowance, investigate the provider/formatting failures through bounded diagnostic
evidence; retain the strict guard until any revised rule is justified. Do not
infer that a globally empty pantry or a character's unwillingness caused this run.
