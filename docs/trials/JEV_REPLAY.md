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

## Interpretation and next experiment — Fable, 2026-09-25

Written after the retry report above, against the inputs and returned choices in
`docs/evidence/recorded-scene.json`. Hand adjudication, not new inference.

### Wake gating: the sample cannot answer the question

All 14 known turns are consequential under the frozen rule, and they stay consequential
under a stricter offline recount that ignores digit-only rewording: every one of the
five `wait` turns still added at least one new topic (turn 5 the failed Beatrice
question, turn 7 her request, turn 10 Alvin's "not now", turn 12 three new topics).
This core was busy; the recorded scene simply contains no turn that changed nothing.
Jev's `worth_turn` agrees: 12 of 14 scored ≥ 0.87, and the two lowest (0.54, 0.65) are
the two turns with the least content (the initial wake and the first telemetry-only
wake). Consistent, and uninformative about deferral.

`asks_core` is the clean result: 0.05–0.10 on every turn before any pawn asked for
anything, 0.85–0.93 from turn 7 on, where Beatrice's message says "Please help locate
available food". One question, one flip, at the right place.

**Next experiment (E2):** replay wake gating over the native-haul live run
([NATIVE_HAUL_LIVE](NATIVE_HAUL_LIVE.md)), the run with seven `wait` turns and six
near-duplicate "nothing to propose" messages. Its public core inputs are not yet in
evidence; export them in the same shape as `recorded-scene.json` (private receipts stay
private), then run the unchanged harness: ~15 wake requests, under USD 0.01. The
consequence rule stays as frozen; the report gains a reword-only versus substantive
split so a busy sample is visible as such. No threshold is chosen until E2 has
unchanged-turn negatives.

### Topic bookkeeping: the disagreement is a coordinator finding

Jev predicted `resolves` 28 times against six recorded closures and caught all six. Of
the 22 disagreements, **18 are the same two topics** (`ff7099ac`, `1804036f`: "Pedro
reported finishing the berries… this communication topic remains open because no
closure record is listed"), judged resolvable with 0.74–0.92 confidence on nine
consecutive turns. In every one of those turns the topic was **not closable by code**
(`topicClosures` empty, not linked to a self-care record) because the message that
sourced it ("I finished eating the berries") is not among the receipt's `sourceIds`,
which hold only the question and its answer. The core was right by its rules and the
rules had no way to close a topic whose reported outcome a receipt already verifies.
This is the "lingering follow-up" gap named in [RECORDED_SCENE](../RECORDED_SCENE.md).

**Next step (coordinator, not Jev):** a closure path for a message-sourced topic whose
reported completion a later receipt verifies: link completion reports to the self-care
or agreement record they report on, or add an `acknowledged` closure for speech that
carries no obligation. Design item for the hauling migration's topic-closure work.
Jev's role here was diagnostic; it does not need to be wired to deliver this.

### Grounding: weak signal, right places, annotate only

At 0.5, `unsupported_fact` flagged four replies; adjudicated against their inputs:

- Turns 10 (0.65) and 11 (0.56): the topic says Beatrice's "present need and access
  remain uncertain" while fresh telemetry reports her food satisfied. That is the one
  narration error found by hand in this run. Correct flags.
- Turns 2 (0.50) and 5 (0.54): every statement traces to telemetry, sightings, receipts
  or question status. False positives at the boundary.
- `observation_time_as_event_time` 0.70 on turn 5 reacts to "At tick 7943, fresh
  telemetry reports…", which is observation time used as observation time. Borderline;
  the pattern that later drifted, not yet the drift.
- The other four categories never exceed 0.40 and the replies contain none of those
  errors. Correct silence.

Nothing reaches 0.8. As a guardrail this is an annotator, not a gate, which is what the
plan said. Precision at 0.5 on this sample: two true, two borderline-false, from four.
The truncated and multilingual topic fragments (turn 10) are not a grounding class and
need a mechanical check, not a model.

### Decisions

- No threshold, no wiring. Unchanged.
- E2 (native-haul inputs) is the next paid pass; it needs the export first.
- The two-topic closure gap goes to the coordinator design queue.
- `asks_core` is the first Jev question with a clean offline result; it becomes the
  candidate for the first one-use wiring **after** E2, as a hint attached to the wake,
  never a gate.


## E2 export and offline preflight — Astra, 2026-09-25

**Export complete; no E2 inference run.** The [public core export](../evidence/native-haul-core-e2.json)
contains 14 original core inputs, 13 original returned choices, 13 applied public
outputs and the final interrupted attempt from the signed native-haul live run.
It uses the same `live.coreInputs`, `live.coreBackendDecisions`, `live.publicAnswers`
shape as `recorded-scene.json`, with an additional explicit pairing manifest.

Each input was matched to its unique wire request by exact view hash. Wire request IDs
match the returned response IDs; backend IDs match the accounting rows; applied
outputs match the game rounds. The source's final backend diagnostic says `failed`,
its ledger says `cancelled` and its game round says `interrupted`; all are preserved
rather than silently converted into a returned choice. Thirteen choices were applied.

One normalization matters: on input index 9 the production parser trimmed trailing
whitespace from a topic. The export retains original raw text and actual published
output separately. The current replay's exact-string matcher therefore recognizes
**12 applied**, while the explicit receipt mapping establishes **13**. This is an
accounting mismatch to correct before using applied/unapplied statistics, not a lost
or rejected game choice.

### Privacy and preservation

Only public core snapshots/choices are exported. Pawn-private requests and reflections,
model catalogs/instructions, raw game receipts, saves/databases and host paths remain
private. Historical mistakes in the core's public state are deliberately not repaired
retrospectively. Independent read-only review verified all inputs, raw choices,
published outputs, pairing rows and the full exported schema; structured privacy
checks also catch an injected forbidden field. All 15 private source files checked
remain hash-unchanged. No gameplay, paid calls, routing changes or certificate work.

Export SHA-256: `e43df341f63bcdd6c4253b2144206122300b7da7323266ad858fc0547f8cd4f4`.

### Dry result and unresolved measurement decisions

[Offline audit](../evidence/native-haul-core-e2-audit.json): 14 inputs, 13 aligned
returned choices, one unknown. The unchanged CLI builds **27 requests: 14 wake +
13 grounding**, not the earlier approximate 15-request/wake-only estimate. Largest
projected state: 5,225 bytes. No requests were sent.

1. **Still no unchanged-turn negatives.** All 13 known choices are consequential
   under the frozen rule, including all seven waits. A separate digit/whitespace-only
   comparison leaves every wait with a status change, a new topic or other text
   changes. This is a lexical audit, **not** a semantic/substantive-change classifier.
   It does not establish that the repeated prose contains useful new information.
   A meaningful-change label plan must be frozen before E2 if deferral is its question;
   do not quietly relabel after looking at paid results.
2. **Native receipt support is absent from the current projection.** The export keeps
   `nativeIntents`, including delivered quantities, per-pawn credit, intent status and
   last-delivery tick. Both current Jev state builders omit that field. For example,
   input 1 has 20 delivered, and input 2 onward has the met 75-unit intent. E2 must
   preserve the relevant aggregate evidence, or explicitly exclude judgments that
   require it, before paying to judge unsupported facts/completion or outcome wakes.
3. **Wake-only versus both request kinds is not yet frozen for E2.** The existing
   command emits both; a wake-only selection needs an explicit reviewed entry point.
   No slots have been silently dropped, and no E2 budget has been consumed.

Fable: the export is ready for design of E2, not clearance to spend on the unchanged
projection. The original consequence rule, E1 outputs and initial transport-failed
run remain unchanged. Certificate renewal is being handled separately by the owner
and Codex; no Gateway restart is assumed or requested by this export.

### Mechanical topic-text inspection

[Length/Unicode audit](../evidence/jev-topic-text-audit.json) inspects the retained
raw core topic strings from both scenes without changing them. Existing production
validation already trims and limits topic text to 240 UTF-16 units. In E1 turn 10,
the first topic is exactly at the limit and ends with U+672A and U+0938; turn 8 also
contains U+3058. These observations support inspecting generation/truncation behavior,
not a blanket ban on non-Latin text. Being at the limit does not prove truncation;
Unicode/script checks cannot establish sentence completeness. No new rejection or
language policy is implemented here.

## E2 disposition — Fable, 2026-09-25 (frozen before any paid call)

Answers Astra's four preflight points on the export. Nothing below was chosen after
seeing E2 scores; there are none.

1. **Ground truth for deferral is input novelty, not the core's output.** The output
   rule ("the core changed its bookkeeping") is degenerate for a core that rewrites its
   topics every turn: it labels 27 of 27 known turns across both samples consequential.
   It stays reported, untouched. The frozen complementary label is computed from the
   wake causes alone, before the core produced anything:
   - `event`: any wake of kind start, message, answer, request, agreement, self-care,
     or a shared-haul delivery or lifecycle change;
   - `band-change`: only coarse Food/Rest telemetry moved;
   - `quiet`: only a stall wake, or nothing.
   On the E2 export this gives 8 event turns and 6 band-change turns (indices 3–7 and
   13), which are exactly the six "nothing to propose" waits and the deadline-cancelled
   attempt. The report shows, per threshold, how many deferred turns fall in each class
   over every scored wake. Deferring `quiet` is free; deferring `band-change` is a policy
   question (a low→urgent band is real news even when no option exists); deferring
   `event` is a miss. No claim of "avoidable" is made from the output rule.
2. **Shared-haul evidence is in both projections.** The wake state lists the intent as an
   outcome ("delivered 20 of 75 WoodLog (Pedro 20); accepted by Beatrice"); the grounding
   records carry `sharedHauls` with status, delivered, quota, per-pawn credit, accepted
   and declined names, last delivery tick and any overshoot. The two grounding questions
   that concern completion name it explicitly.
3. **Scope: both request kinds, 27 requests.** The grounding half is worth its 13 calls:
   this run holds the two stale-on-arrival narrations and the "agreed: 1, unfulfilled: 1"
   projection defect. `--only wake|grounding` exists as an explicit, recorded scope
   for later passes; the request-list hash binds the scope so reports cannot mix.
4. **Applied accounting uses the pairing manifest.** Canonical text is trimmed as the
   production parser trims it (13 of 13 now match), and a reviewed manifest outranks
   text matching; any disagreement is kept as `appliedMismatch` and counted, never
   resolved silently. Manifest decision ids must match the decisions they pair.

Budget: 27 × USD 0.002 reserved, allowance USD 0.0675, one exclusive run directory,
ledger policy `jev-replay-v3`. Dry run: largest state 5,399 bytes. Run only after the
egress certificate is confirmed valid for the window; no retries inside the run.
