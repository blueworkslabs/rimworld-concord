# Follow-through after bounded formatting recovery

## Frozen protocol

One new `recovery-followup-v1` native trial after PR48. This does not replace,
rerun or relabel the earlier failed trials.

- Six core attempts and six pawn attempts maximum, zero Jev, no operator rerolls.
  Separate fresh native-Claude-Max ledgers reserve 0.60 USD API-equivalent each;
  historical policy identities and caps stay unchanged. Unused slots stay unused.
- Two minutes of native activity, explicit inference pauses, 45s decision limit,
  15-minute game deadline plus bounded cleanup. Same campfire-v2 save and open
  coordination brief as the food-followup trial; no forced recipient or outcome.
- Food starts .40/.65/.55, Rest .90; 225 raw berries, no ready meals or stove,
  unchanged traits/skills, native self-care, ordinary work priorities disabled.
- Attributed local food/campfire sightings remain separate from available jobs.
  Questions, silence, raw eating, refusal, deferral, work offers and waiting are
  valid branches. Speech and visibility never grant consent.
- PR48's core-only formatting recovery requires the complete bounded trace.
  Native max-turns remains two; other modes keep their prior result guard.
  Preserve raw structured outputs and typed text-free diagnostics, including
  explicit recovery receipts. Do not inject an error to force a repair.
- Scripted question/reply/wait rehearsal and paired/full restart before live.
  Live end: pause, stop owned work/retire unanswered offers, preserve outcomes,
  paired restore, full restart without inference, then stop staging.

Reuse the locked `scripts/run-core-followup.mjs` host launcher with an absolute
private configuration whose `policy` is `recovery-followup-v1`. Scripted and live
configurations must have separate output and ledger paths. Deployment digest,
exclusive coordinator lock, direct-entry guards and cold protocol checks remain.

```
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted
# Following a full restart:
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted --cold
# Separate fresh live configuration: omit --scripted, then verify --cold.
```

This is not a controlled estimate of the adapter's effect on planning. Earlier
API errors may recur; a repair may never be needed. Report transport/validation,
core follow-up, pawn consent, actual work and persistence separately. A clean
inference run alone cannot establish useful colony coordination.

## Retained live result

Behavior `dc1e51ffd7d729c01a8f5d20eec8d9f9332d7ef0`. The trial used **five core
attempts and two pawn attempts**, zero Jev and no operator rerolls. One core slot
and four pawn slots stayed unused. It is a mixed inference result, not a successful
work-planning trial.

1. With food sightings present, the core asked Alvin whether he wanted nearby
   berries. Alvin said he would eat some. His reply triggered a core wait that
   explicitly distinguished his stated intention from verified completion.
2. Pedro's Food band later became low. This core call first exceeded the topic
   text limit, received a schema error, repaired its output, and returned the
   exact two-assistant-event/two-message trace accepted by PR48. Its question to
   Pedro was delivered; he replied that he would get berries. The core then waited.
3. A later attempt asked Beatrice about food after her band changed. Its repaired
   result had two distinct assistant messages but **three assistant events**,
   outside the frozen recovery rule. The adapter rejected it; Beatrice never
   received that question. No replacement call or mid-run rule change was made.

The retained trace establishes those counts and the invalid-topic/schema-error/
valid-repair sequence. It does not retain raw message IDs or prove which content
block caused the extra assistant event. The current rule is conservative about
stream shape; this result does not show a third distinct model message occurred.
One accepted recovery is live evidence of that path, not general provider reliability.
No API-error event recurred in this run.

**Zero work proposals, native agreement jobs, campfires or cooked meals.** Native
observation lasted 120,957 ms, with 87/87 unpaused samples outside deliberate
inference pauses. No sampled job was Ingest; all three ended with lower Food
readings than they started. This is not a complete native eating-event archive.
Saying “I'll eat” did not create an executable agreement or command; routine
self-care remained under RimWorld. Do not claim the dialogue made anyone eat.

## Grounding review

The public wait reasons correctly describe intention as unconfirmed. However,
some topic summaries shorten “reported he would eat” to “reported eating,” even
while adding that no receipt confirms it. Other wording blurs shared-link
telemetry with a pawn report or visual observation. “Accessible” is stronger
than merely observed and not forbidden; the sightings do not prove universal
reachability. All original wording is retained.

Initial requests contained berries and work options; later local sightings were
empty. That does not prove the whole map lacked food. The current core view is
not durable last-known resource memory. No causal conclusion about why it chose
questions and waiting follows from this single authored run.

## Verification and next step

- 310 Node and ten Python checks passed. Independent final-behavior Codex review
  found no actionable regressions; actual source reads and write denial verified.
- Scripted question/reply/wait, paired restore and cold restart passed with no
  inference. Live paired/cold restore preserved the failed attempt, delivered
  replies, core state and consumed allowances without extra calls.
- Core reported 0.3154635 and pawns 0.051861 USD API-equivalent usage via native
  Max, not cash billing. Five/two attempt reservations remain consumed.
- All 224 historical database-related files are unchanged. Staging is stopped.
- [Complete outputs, traces, situations and public records](evidence/recovery-followthrough.json).
  No separate diary entry for this operational check.

Next, investigate stream accounting for multiple events belonging to one message.
Any correction should explicitly bound distinct messages and reject unknown or
missing identity coverage, not simply raise an event limit. Use retained patterns
and offline checks before another colony allowance. The gap between spoken eating
intentions and executable pawn-owned actions also remains visible; neither speech
nor the core may silently authorize an eating job. No new allowance is enabled here.
