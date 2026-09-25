# Annotate-only grounding: the first live Jev use

**Status: wired, not yet exercised live. Fable, 2026-09-25.** This is decision 1 of the
[E2 interpretation](JEV_REPLAY.md#e2-interpretation-and-decisions--fable-2026-09-25):
the seven grounding questions run over every returned core reply during a live run and
their scores are journaled. **Nothing is gated, delayed, rewritten or rejected.** The
first run that carries it is the construction and cooking scene; its flags are then
adjudicated by hand against the recording, the way E1 and E2 were, and reported here.

## What runs

- **When:** in the operator's host runner (`scripts/run-ongoing.mjs`) with
  `--annotate-grounding`, after a core reply has already been sent back to the
  coordinator. The annotation is outside the inference lane and never awaited by a
  decision; the core turn's deadline is unaffected.
- **What is asked:** the grounding battery in `src/jev-questions.ts` (`unsupported_fact`,
  `completion_without_receipt`, `speaks_for_other`, `instruction_to_pawn`,
  `forecast_as_certainty`, `reason_contradicts_action`, `observation_time_as_event_time`)
  over the reply beside the trimmed core input the model was shown. When the wake carried
  pawn messages, `asks_core` is asked as a second, one-question request.
- **Same bytes as the replay:** for the same input and reply, the live grounding request
  hashes equal to the offline harness's (`tests/jev-annotate.test.ts` checks this over the
  recorded scene). Live flags are therefore directly comparable with E1 and E2.
- **Flags:** a noul at or above **0.5** is a flag. That is the reporting threshold from the
  replay interpretation, not a decision threshold; no threshold is frozen for gating.

## What it never does

- Change a reply, its timing, its publication, the crew log or the game.
- Retry, reroll or extend: one attempt per request; a failed attempt is a journaled failure.
- Read anything the core did not see: the state is the fitted core input and the returned
  choice, names only.
- Run without the protected transport: `protectedJevTransport()` must exist on the host
  before the game starts, or the run refuses to start. Never in scripted runs.

## Budget and journal

- Ledger `<ledger>.jev`, policy `jev-annotate-v1`: **USD 0.20, 100 calls**, one
  reservation of USD 0.002 per call settled from the provider's receipt; an overrun locks
  the ledger and every later annotation is a recorded failure. Expected cost for a
  ten-minute scene is a few tenths of a cent.
- Journal `<receipt>.jev-annotations.jsonl`, durable per event: `skipped` (oversized state,
  reply not a core choice), `attempted` before the call, `received` with the paid bytes
  before validation, then `result` or `failure`. Every event carries the decision-request
  id of the core turn, which is the backend decision id in the exported evidence, so an
  annotation joins its input and reply exactly.
- The run receipt carries `jev`: counts (attempted, answered, failed, skipped), flags per
  category, reported cost, the ledger summary and the journal path; `after.jevCalls` is the
  real count. The protocol records `jevCalls: "annotate-only grounding; gates nothing"`.

## Evidence rule for the first live use

The journal is host-private (it contains the fitted core inputs). Sanitized export follows
the E2 pattern: names only, the reply, the scores and flags, joined to the public core
inputs by decision id. The report has three parts, in this order: Astra's counts first
(flags per category, failures with causes, cost); a hand adjudication of every flagged
reply and of an equal number of unflagged replies against the recording, by whoever did
the cold read, without seeing the scores first; then the interpretation. Agreement with
the adjudicator is the measure; the model's own confidence is not.

## Not decided here

Whether any flag ever holds a reply, shows in the crew log, or reaches the core as
feedback. Each is its own decision after the first live numbers. `worth_turn` stays
retired; topic closure stays diagnostic (see the replay page).
