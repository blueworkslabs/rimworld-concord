# Identity-aware adapter: native follow-through

## Frozen protocol

One new `identity-followup-v1` native trial after PR50. This does not replace,
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
- PR50's core-only formatting recovery requires a complete identity-covered trace
  of at most two distinct messages; well-formed split events may share a message.
  Native max-turns remains two; other modes keep their prior result guard.
  Preserve raw structured outputs and typed text-free diagnostics, including
  explicit recovery receipts. Do not inject an error to force a repair.
- Scripted question/reply/wait rehearsal and paired/full restart before live.
  Live end: pause, stop owned work/retire unanswered offers, preserve outcomes,
  paired restore, full restart without inference, then stop staging.

Reuse the locked `scripts/run-core-followup.mjs` host launcher with an absolute
private configuration whose `policy` is `identity-followup-v1`. Scripted and live
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

## Retained result

Behavior `88f2279e01f25e5e6450a63d0c0771156ba5892d`. **Six core attempts and
three pawn replies all passed validation and were applied/delivered.** Zero Jev,
no operator rerolls, no inference fallback. Three unused pawn slots stayed unused.
The technical trial passed; the useful-work goal remains unproved.

- The core asked Alvin about berries, received his stated intention to eat, and
  waited on the reply-triggered turn rather than treating speech as completion.
- Pedro's later Food-band change prompted a question, his reply, then another wait.
- Beatrice's Food-band change likewise prompted a question, reply and final wait.
  All three received a turn; no personality, recipient or response was scripted.
- Core turns three, four and six each repaired one overlong topic after a schema
  error. Each had two distinct identified assistant messages and matching failed/
  successful formatting results. Turns three and six had two assistant events;
  **turn four had three events across two messages** and was accepted with complete
  identity coverage. This exercises PR50's split-event repair path live.
- No provider/API failure or rejected decision occurred in this run. That is one
  bounded result, not a guarantee or an explanation of earlier API failures.

**No work offers, agreement jobs, campfires or cooked meals.** Observation covered
120,859 ms of native activity, with 87/87 unpaused samples outside explicit
inference pauses. No sampled job was `Ingest`; all three ended with lower Food
readings (.224/.458/.358 versus .400/.646/.550 initially). These samples are not a
complete eating-event archive. The pawn replies did not issue an eating job.

Unlike some earlier runs, current berry sightings were present in every core view,
including the final one. Repeated IDs are overlapping observations, not extra
stock. Grounded build/haul options also remained in the supplied menus. This
removes provider rejection and missing local food sightings as explanations for
this run's lack of work; it does not establish the model's underlying reasons or
prove that building a campfire was preferable to eating raw food.

## Grounding and interpretation

The core consistently retained the distinction between intending to eat and
confirmed completion. Its final wait explicitly says there are no receipts.
However, the run still contains imprecise language: food **stacks** become berry
“patches,” shared-link telemetry becomes “looks low,” and “no campfire present”
drops the local-sighting scope. Seeing unforbidden food is not proof that a pawn
can or should eat it; the supplied food-knowledge contract states that limit.
The “designated question recipient” phrase also exposes interface language to the
player. These are not formal validation failures; all original wording is retained.

The final panel shows no outstanding agreement and all three low Food bands. It
shows the intentions and wait, not a completed meal. The unchanged runner still
lacks a complete diagnostic explanation for native self-care not selecting food.
Do not infer refusal, inability or broken consent from that absence alone.

## Verification and next step

- 314 Node and ten Python checks passed. Independent Codex review of the final
  behavioral revision found no actionable defects; actual source inspection and
  denied writes verified. Reviewer no-emit type-checking and four targeted tests
  passed; full reviewer `npm test` was blocked by read-only build permissions.
- Scripted question/reply/wait rehearsal and paired/cold restore passed with zero
  model calls. Live paired and full restart retained the exchanges, core state,
  accepted repair records and consumed allowances with no extra inference.
- Native Max reported core 0.3819111 and pawn 0.081996 USD API-equivalent usage;
  these are provider estimates, not cash charges or a changed billing route.
- All 226 historical database-related files are unchanged; staging is stopped.
- [Complete outputs, traces, views and public records](evidence/identity-followthrough.json).
  No separate diary entry for this operational confirmation.

Next: inspect the native food-selection conditions and the boundary between a
spoken eating intention and executable pawn-owned action. Establish why self-care
is not choosing the observed berries before another planning trial. Do not turn
prose into an order, force construction, or extend this completed allowance.
