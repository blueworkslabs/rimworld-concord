# Jev offline replay — protocol `jev-replay-v1`

**Status: harness built and mock-tested; no live replay yet.** Owner: Fable. Reviewer:
Astra. This is the "Jev, offline" track from [ROADMAP](../ROADMAP.md#in-parallel-jev-offline),
reordered after the [native-haul live run](NATIVE_HAUL_GATE_C.md): core wake gating
first, prose grounding second. Nothing here changes routing, receipts, consent or the
game. Output is numbers.

## Question

Over the recorded core turns already in evidence, would narrow Jev judgments have

1. **deferred core turns that changed nothing** (wake gating), and do per-topic
   judgments agree with what the core actually did to its topics (bookkeeping);
2. **flagged the prose errors we found by hand** (grounding), and at what rate do they
   flag replies we judged clean?

## Inputs

`docs/evidence/recorded-scene.json` (`live.coreInputs`, `live.coreBackendDecisions`,
`live.publicAnswers`): 15 core inputs, 14 returned choices (one cancelled at the
deadline), 13 applied (one rejected on the topic limit). Later evidence files with the
same shape can be replayed unchanged.

## Questions (all in `src/jev-questions.ts`)

**Wake gating**, one request per core input, state filtered to brief, open topics, wake
causes, messages to the core and recent outcomes, pawn ids replaced by names:

- `worth_turn` (noul): does anything need a core decision now.
- `asks_core` (noul): does any message ask the core for something.
- `topic_<k>` (choice per open topic): resolves / blocks / advances / unrelated.
- `message_<k>` (choice per message): which open topic, `none`, or `new`.

**Grounding**, one request per returned choice, state = the reply beside the records
and communication it was given: seven nouls, `unsupported_fact`,
`completion_without_receipt`, `speaks_for_other`, `instruction_to_pawn`,
`forecast_as_certainty`, `reason_contradicts_action`, `observation_time_as_event_time`.

Every state is capped at 16,000 bytes. Speech is evidence, never instructions; every
question says so.

## Ground truth and measures

- **Actual consequence of a turn:** the returned action was not `wait`, or any open topic
  was closed, blocked or reworded. Derived from the returned choice, not from prose.
- **Deferral curve:** for thresholds 0.3–0.9, turns Jev would have deferred, split into
  *avoidable* (the core changed nothing) and *missed* (the core did something). These
  are counterfactual upper bounds: deferring a turn changes later inputs.
- **Topic agreement:** confusion matrix of Jev's per-topic choice against the actual
  update, plus closure agreement (predicted vs actual `resolves`).
- **Grounding:** per category, how many turns score ≥ 0.5 and ≥ 0.8, and which. Known
  hand-found cases in this run: two stale-on-arrival narrations (true at snapshot, so
  they should **not** flag as unsupported; the as-of prefix from #71 covers staleness)
  and repeated observation-time-as-completion-time wording (should flag).

Agreement with the core is not correctness. Thresholds are picked from these curves and
then validated on a held-out evidence file before anything is wired.

## Budget and transport

`TrialBudget` policy `jev-replay-v1`: USD 0.08, 32 calls, USD 0.002 reserved per call
(29 calls planned). Protected Gateway transport only (`src/protected-jev.ts`); no
plaintext credential, no retries, failures keep their reservation. The OpenRouter route
and the `jev-1.13` pin are unchanged pending the owner's transport decision.

## Running

```
npm run build
node dist/trials/run-jev-replay.js docs/evidence/recorded-scene.json --out .runtime/jev-replay        # dry: requests.json only
node dist/trials/run-jev-replay.js docs/evidence/recorded-scene.json --out .runtime/jev-replay --live --ledger .runtime/jev-replay/ledger.sqlite
node dist/trials/run-jev-replay.js docs/evidence/recorded-scene.json --out .runtime/jev-replay --report .runtime/jev-replay/answers.json
```

Dry first, always. The live run is one pass, no rerolls; `answers.json` is retained
verbatim and `report.json` is arithmetic over it. Sanitized results go to
`docs/evidence/jev-replay.json` with a ledger row when the pass has run.

## Not decided by this replay

Which use, if any, gets wired; where thresholds sit; whether the native TypeSafe
endpoint replaces OpenRouter. Each of those is its own decision after the numbers.
