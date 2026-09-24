# Jev offline replay — protocol `jev-replay-v2`

**Status: harness built and mock-tested; no live replay yet.** Owner: Fable. Reviewer:
Astra. This is the "Jev, offline" track from [ROADMAP](../ROADMAP.md#in-parallel-jev-offline),
reordered after the [native-haul live run](NATIVE_HAUL_GATE_C.md): core wake gating
first, prose grounding second. Nothing here changes routing, receipts, consent or the
game. Output is numbers. Transport and pin: the protected OpenRouter route with an
explicit model version (owner decision 2026-09-24).

## Question

Over the recorded core turns already in evidence, would narrow Jev judgments have

1. **deferred core turns that changed nothing** (wake gating), and do per-topic
   judgments agree with what the core actually did to its topics (bookkeeping);
2. **flagged the prose errors we found by hand** (grounding), and at what rate do they
   flag replies we judged clean?

## Inputs and pairing

`docs/evidence/recorded-scene.json` (`live.coreInputs`, `live.coreBackendDecisions`,
`live.publicAnswers`). Inputs and backend decisions are recorded in the same order;
that order is trusted only when the counts match and each returned choice
**structurally fits its input** (every topic source, opportunity, counter and question
recipient it names exists in that input). A choice that does not fit is *misaligned*
and treated as unknown. *Applied* is decided by full action identity (kind, reason,
text, pawn, opportunity, counter, action topic, topics) against the published answers;
a duplicate identity is *ambiguous*, never yes. Recorded scene: 15 inputs, 14 aligned
returned choices (one cancelled at the deadline), 13 applied, 0 ambiguous.

## Questions (all in `src/jev-questions.ts`, including the live appraiser's `reflect`)

**Wake gating**, one request per core input, state filtered to brief, open topics, wake
causes, messages to the core and recent outcomes (offer status and work status both
kept), pawn ids replaced by names:

- `worth_turn` (noul): does anything need a core decision now.
- `asks_core` (noul): does any message ask the core for something.
- `topic_<k>` (choice per open topic): resolves / blocks / advances / unrelated.
- `message_<k>` (choice per message): which open topic, `none`, or `new`.

**Grounding**, one request per aligned returned choice, state = the reply beside the
records and communication it was given, **including the supporting facts the core may
cite**: food sightings (observer, item, count, forbidden), listed options, question
status, agreements with offer status *and* work status, delivered quantity with unit,
and receipt-backed `completedTick` where present. Claim classes that cannot be checked
from this projection are listed under `unscored` and must not count as unsupported.
Seven nouls: `unsupported_fact`, `completion_without_receipt`, `speaks_for_other`,
`instruction_to_pawn`, `forecast_as_certainty`, `reason_contradicts_action`,
`observation_time_as_event_time`.

Every state is capped at 16,000 bytes. Speech is evidence, never instructions; every
question says so.

## Response contract

Frozen and validated per call: model exactly `typesafe/jev-1.13-20260917` (the version
in retained evidence), exactly the asked question keys, the asked answer types, choice
labels among the listed options with probabilities covering them and summing to one.
A paid answer that fails the contract is kept verbatim as a failure, never scored.
The live appraiser in `src/appraisal.ts` now uses the same exact pin.

## Ground truth and measures

- **Actual consequence of a turn:** the returned action was not `wait`, or any open
  topic changed status or text, or a new topic was added. A topic re-submitted with the
  same status and text (including repeated *blocked*) is unchanged. Derived from the
  aligned returned choice, never from prose.
- **Unknown is not avoidable.** Turns with no usable returned choice (cancelled,
  unparseable, misaligned) have no ground truth. They are excluded from every
  denominator and counted under `unknown`.
- **Deferral curve:** for thresholds 0.3–0.9, turns Jev would have deferred, split into
  *avoidable* (the core changed nothing) and *missed* (the core did something), over
  known turns only. Counterfactual upper bounds: deferring a turn changes later inputs.
- **Topic agreement:** confusion matrix of Jev's per-topic choice against the actual
  update, plus closure agreement (predicted vs actual `resolves`).
- **Grounding:** per category, how many turns score ≥ 0.5 and ≥ 0.8, and which. Known
  hand-found cases in this run: two stale-on-arrival narrations (true at snapshot, so
  they should **not** flag as unsupported; the as-of prefix from #71 covers staleness)
  and repeated observation-time-as-completion-time wording (should flag).

Agreement with the core is not correctness. Thresholds are picked from these curves and
then validated on a held-out evidence file before anything is wired.

## Budget, durability, no rerolls

- `TrialBudget` policy `jev-replay-v2`: exactly one call per request (29 for the
  recorded scene), USD 0.002 reserved per call, allowance 1.25× the sum. The ledger
  cannot be reopened for a second pass.
- A live run **owns its output directory**: `run.json` binds a run id to the evidence
  hash, the request-list hash, the model alias, the expected version and the call
  count; a second `--live` in the same directory is refused.
- `attempts.jsonl` receives every attempt **before** its call and every result or
  failure **after**, so an interruption, budget stop or pricing lock never loses a
  paid answer. Each slot runs at most once. An interrupted run still writes its report.
- Protected Gateway transport only (`src/protected-jev.ts`); no plaintext credential,
  no retries.

## Running

```
npm run build
node dist/trials/run-jev-replay.js docs/evidence/recorded-scene.json --out .runtime/jev-replay           # dry: requests.json only
node dist/trials/run-jev-replay.js docs/evidence/recorded-scene.json --out .runtime/jev-replay --live    # one exclusive pass
node dist/trials/run-jev-replay.js docs/evidence/recorded-scene.json --out .runtime/jev-replay --report  # recompute from attempts.jsonl
```

Dry first, always. Sanitized results go to `docs/evidence/jev-replay.json` with a
ledger row when the pass has run.

## Not decided by this replay

Which use, if any, gets wired; where thresholds sit; whether the native TypeSafe
endpoint replaces OpenRouter. Each of those is its own decision after the numbers.
