# Hauling migration — final B1 round and strict fallback

2026-09-25 · [PR #73](https://github.com/blueworkslabs/rimworld-concord/pull/73) ·
[receipts and recording hashes](../evidence/hauling-migration-strict-fallback.json).

**Growing parked; strict selected; migration not cleared for merge/live.**
B1 has used **2/2** permitted fix/recheck rounds. Independent review preceded both
recorded attempts; coordinator checks pass (406 tests), pinned 4871 mod compilation
passes. No character-model calls. Staging is stopped, all **377 pre-existing saves**
(including the original 285) are unchanged, and **22 recordings** are hash-verified.

## Review and exhausted B1 budget

Clawd's `c98f3ea` corrected the first-round fixture/precondition problems. Independent
review found further false-pass/failure risks: the second tag was newer than the job
and therefore pre-agreement there; SetTarget emitted before native haul-mode change;
ordered work could overcommit when step registration was skipped; and retarget cargo
conservation needed explicit evidence. Corrections at `b98d060` establish both tags
before the test job, start the initial trip into the intended pile, account ordered
steps before calculating remaining work, and verify total spawned/carried wood.

The final growing recheck then failed **before scenario assertions**: quiet-base
preparation ended a native job, the game returned it to its pool and cleared its
`def`, and the lab receipt subsequently dereferenced that cleared field. Six failed
case recordings were retained before the batch was stopped. None is a runtime pass
or proof of a growing-hold quota violation. Nonetheless round two was not clean, so
the signed strict fallback applies. **No third growing round.**

The receipt-only fix at `7dec73a` snapshots the name before cleanup. Independent
review traced the pinned pool path and checked the fix. It was deployed after
shutdown for **strict-only** checks; this does not reset the B1 ledger. Growing code
and prior successful experiments remain retained but are not cleared for shipment.

## Strict checks: 15/16 passed

- Exact quota and source-bounded trips passed. Two capable pawns held overlapping
  reservations: Pedro 10, Beatrice 15 for quota 25. Alvin remained ineligible.
- A job admitted with 5 already carried delivered 10. The strict runner infers the
  additional 5 from delivery minus initial cargo; it does not provide a separate
  strict pickup-count receipt.
- Native retarget transferred a carried 10 as **1 to the first pile, 9 to the second**;
  the remaining hold was 9 and credit followed placement. With destination quota 1,
  the 9-unit remainder went aside instead, the captured job succeeded and total wood
  was conserved. The SetTarget receipt's mode is the pre-update mode, not a claim
  about the later native aside mode.
- Pre-tag work stayed in the before bucket (Beatrice 60; 20 carried at tagging),
  then a separate post-tag quota of 10 completed. Archive, zone-edit stop, re-tag and
  structured crew-log checks passed.
- **Mixed-item coverage failed:** both quotas completed (wood 20, components 10),
  and steel stock increased 0→30, but no steel trip was observed for the wood-refusing
  Beatrice. This is not evidence that refusal blocked steel; it does not prove that
  named branch either. Original failing receipts/recording remain intact.
- No observed quota/ledger/pickup-bound/unadmitted-retarget detector events and no
  native-event gaps in these strict cases. This is not exhaustive coverage.

## Matched quantities, same frozen fixture

| Item | Native strict | Ordered | Native ticks | Ordered ticks |
|---|---|---|---|---|
| Wood | 30, 2 jobs (20+10) | 30, 3 jobs, 2 authored offers | 252 | 897 |
| Components | 60, 3 jobs (20 each) | 60, 6 jobs, 3 haul offers + 2 moves | 959 | 1942 |

These are scripted trial observations, not model-efficiency forecasts. Both halves
keep the existing fixture and frozen quotas. Ordered work has its original priority/
needs behavior; no ordinary hauling was counted in its delivered totals. Forty wood
units are outside the ordered model's reachable observation overlap and explicitly
excluded from the matched quantity. The components pair has no such excluded supply.
Handler timing samples are retained in the evidence; these **strict** samples do not
measure active growing-hold behavior, dispatch overhead or colony-wide performance.

## Remaining work and ownership

Clawd: establish the missing refusing-pawn/third-item evidence in strict mode, retain
strict as the migration configuration, and finish the remaining migration acceptance
work. In-game rescue handover, event-map clock behavior and the next live verification
of #71 remain pending. Prior single-map UI/Show evidence is not a cross-map test.
Growing nested callback termination and pending-extra cases are parked, not passed.
Retirement of ordered hauling and the Gate C live freeze remain separate gates.
Fable owns direction/verdict; no fresh live run or migration sign-off is implied.

Original round-1 evidence remains at [the earlier staging report](HAULING_MIGRATION_STAGING.md).
