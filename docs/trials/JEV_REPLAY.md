# Jev offline replay — protocol `jev-replay-v2`

**Status: reviewed; owner-authorized retry completed with 29 valid answers after certificate renewal. The initial transport-failed run remains preserved.** Owner: Fable. Reviewer:
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
status and eligible recipients, all supplied public testimony, agreements with offer status *and* work status, delivered quantity with unit,
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
Every received JSON response is preserved in full before validation or billing settlement.
A paid answer that fails the contract is kept as a failure, never scored; its reported
cost remains in the report.
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
  count; ownership is claimed atomically before writing input artifacts; concurrent or second
  `--live` calls in the same directory are refused. Dry runs cannot overwrite owned inputs.
- `attempts.jsonl` receives every attempt **before** its call and the
  received response and validated result or failure **after**. Each append is flushed;
  full raw responses survive validation errors and pricing locks. Each slot runs at
  most once. Unfinished attempts remain explicit, unscored, and are never retried.
  Hard termination may leave billing unknown; `--report` recovers complete journal
  lines and marks an incomplete final line, without new calls.
- Reports verify the evidence, request bodies, model and per-attempt identities against
  the original run. Mismatched inputs are rejected before any retained file is changed.
- Hard upper bound: 32 calls and USD 0.08 allowance; this 29-request pass reserves
  USD 0.058, with a USD 0.0725 local allowance. Reservations are conservative accounting,
  not a provider-enforced charge cap.
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


## Result — 2026-09-25 (transport failure, not a scoring result)

Runtime `eab4502` passed independent focused re-review, 402 coordinator tests and
CI/Pages. Corrections retain supplied testimony and eligible question recipients,
preserve complete received JSON and billing on invalid output, claim runs atomically,
and validate evidence/request hashes before reporting. The dry run has 29 requests;
largest state is 6,581 bytes, below the unchanged 16,000-byte cap.

The approved single protected pass ran at 05:00:56–05:00:57 UTC: **29 attempts,
29 transport failures, zero received responses, zero scored cases**. All attempt
records and reservations remain intact. The CLI completed its loop, but this is **not
a successful model evaluation**. No retry or model-choice reroll was made.

A subsequent **non-inference** read-only authentication check on the same protected
route failed with `CERT_HAS_EXPIRED`. The injected CA bundle contains a certificate
that expired at **2026-09-25 01:31:20 UTC**. TLS verification was not disabled; no
plaintext route or credential fallback was used. No gateway restart or infrastructure
change was made during this review.

The ledger retains **USD 0.058 reserved**, within the USD 0.0725 local allowance and
USD 0.08 operator limit. **USD 0 reported** means no billing receipts arrived, not
that zero cost has been proven. The expected response version remains
`typesafe/jev-1.13-20260917`; no actual model version was observed. Public endpoint
metadata before the run confirmed that version and input pricing of USD 0.042/M
(output free); this was not an inference probe.

[Sanitized run record and hashes](../evidence/jev-replay.json). Raw request artifacts,
attempt journal and non-rewindable ledger are preserved privately. Recomputing the
report offline passed provenance checks; it made no new calls. Zero flags in that
report have **zero scored answers**, so no threshold, agreement, quality or routing
conclusion follows. Certificate repair and an explicit new trial disposition are
needed before another pass; the old run will not be overwritten or resumed.

Fable's interpretation is pending; there are no Jev judgment numbers to interpret
from this attempt. Hauling PR #73, its remaining B1 round, and stopped staging are
unchanged.


## Authorized retry — 2026-09-25 (report first)

After certificate renewal, the owner explicitly authorized one unchanged retry.
Protected non-inference authentication returned HTTP 200 and no injected certificate
was expired. All **29 request bodies**, evidence and request hashes match the first
run. No code, model pin, question or threshold changed. A new run directory and
ledger were used; the failed run and its USD 0.058 reservations remain unchanged.

The retry ran at **05:16:52–05:17:05 UTC** and returned **29/29 valid answers**, zero
failures. Every response reports **`typesafe/jev-1.13-20260917`**. Provider-reported
cost: **USD 0.004345194**; new-run reservations: USD 0.058 against the same USD 0.0725
local allowance (within the newly authorized USD 0.08 bound). There were no
within-run retries and no gameplay. The initial run's actual charges remain unknown;
its reservations are not erased or described as this retry's actual spend.

### Measurements

- **Wake:** 15 answers; the cancelled source turn remains unknown and excluded from
  the curve. At thresholds 0.3, 0.4 and 0.5, none of 14 known turns would be deferred.
  At 0.6 / 0.7 / 0.8 / 0.9, respectively 1 / 2 / 2 / 8 turns would be deferred, all
  labelled consequential by the frozen source-truth rule; avoidable counts are zero.
- **Important denominator limit:** all 14 known source turns count as consequential
  under the rule (non-wait action, new topic, or any open-topic status/text change).
  This sample has **zero unchanged-turn negatives**, even though five actions were
  `wait`. It cannot establish how well wake gating recognizes genuinely avoidable
  turns. The definition and thresholds were not altered after observing scores.
- **Topics:** 31/58 exact agreement with recorded core updates (53.45%). Jev predicted
  28 closures; the core recorded six, and all six were among Jev's predictions.
  The other 22 predictions are disagreements, not independently established errors.
- **Grounding, threshold 0.5:** unsupported fact flagged on four replies (zero-based
  turns 2, 5, 10, 11); observation-time-as-event-time on one (turn 5). Other categories
  flagged none. At threshold 0.8, no category flagged a reply. Each category scored
  14 replies. These are model judgments awaiting human evidence adjudication, not a
  measured false-positive rate or correctness verdict.

[Full sanitized retry report and hashes](../evidence/jev-replay-retry.json).
Original [failed-run evidence](../evidence/jev-replay.json) remains intact. Raw responses,
attempt journal and separate ledger are preserved privately. **No threshold or routing
change follows.** Fable owns the interpretation and next experiment proposal.
