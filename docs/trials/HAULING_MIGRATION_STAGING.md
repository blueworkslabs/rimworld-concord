# Hauling migration — recorded scripted review

**Historical round-1 report.** See [final round / strict fallback](HAULING_MIGRATION_STRICT.md) for the current disposition; original failures below remain preserved.

2026-09-24 · [PR #73](https://github.com/blueworkslabs/rimworld-concord/pull/73) ·
[sanitized receipts and recording hashes](../evidence/hauling-migration-staging.json).

**Not cleared for merge or live staging.** Runtime `a372804`, corrected harness
`c5028b4`, pinned 4871. Independent reviews completed; 406 tests and mod compilation
pass. No character-model calls. The game and display are stopped; all 352 pre-existing
saves, including the original 285, are unchanged. Twenty-one recordings and full raw
receipts are retained privately; every local video hash matches the remote copy.

## Round accounting

Initial round 0 failed: no haul started because the fixture omitted serialized filter
health/quality ranges. The original recording is retained. Correcting the fixture and
its evidence assertions counts as **fix/recheck round 1 of 2**, despite no engine change.
Item counts, coordinates, quotas and pawn settings were unchanged in the replacement
fixture. Round 1 ran 18 cases in growing mode: **14 passed, 4 failed**. Two additional
strict comparison cases passed. Thus 21 recorded attempts total, 16 passes and 5 failures
including the invalid initial fixture. **One B1 fix/recheck round remains.**

## What passed

- Growing hold: one job picked up 10 then 20 and delivered exactly 30; strict used two
  jobs, 10 and 20. Source growth respected the first admitted cap; source shrink picked
  up three and released unused hold. Zero-extra case completed ten.
- Withdrawal happened after a genuine non-synchronous duplicate selection, while extra
  hold remained. The next pickup was skipped and the carried ten finished with the
  pre-exclusion flag. No new cargo was acquired after withdrawal.
- Mid-growth save/load preserved the same job's hold **30** and remaining trip budget
  **20**, then completed. This is not a new OS-process cold restore claim.
- Mixed stockpile: separate wood/component quotas completed; Beatrice, excluded from
  wood, completed a steel job and the stockpile's steel rose **0 → 30**.
- Archive: **10 credited**, **60 pre-agreement**, then **15 ordinary after retirement**.
  Credit stayed fixed. Zone-disallow produced the specified stop; re-tagging closed the
  previous archive and opened a new generation.
- Offer/completion/label assertions passed in growing and strict modes. Retained stills
  show clocked records, helper wording, the pre-agreement record and completion boundary;
  clicking **Show** moved the camera to the stockpile. Single-map inspection only, not
  cross-map provenance proof or a live character test.
- Components: native **60 in two jobs (40 + 20), 1,179 ticks**; ordered **60 in six jobs,
  three authored offers, 2,875 ticks**. No claim about live-model cost or general colony
  performance follows from this authored fixture.

All recorded cases had zero event gaps and no observed quota/consent/detector violation.
Missing branches are not thereby proved safe.

## Failed checks — retained, not renamed as passes

1. **Contention:** 25 was delivered by Pedro, but peak holders was one. Beatrice's
   already-running trip was pre-agreement; the case did not create competing admitted
   jobs. This does not establish the last-units concurrency invariant.
2. **Carried cargo plus source:** five were prepared and job 6 queued, but native code
   ended that job as `QueuedNoLongerValid`. Job 9 started with zero cargo and eventually
   delivered 30. That is not the intended admission branch.
3. **Dedicated pre-tag case:** the captured trip placed exactly 20 into the before
   bucket with zero credit, but no delivery filled the newly tagged quota. The combined
   drain-and-quota predicate timed out. Its emitted “trip did not finish” wording is too
   broad: it does not prove that the captured trip remained running. This fixture must
   establish remaining post-tag supply before requiring quota completion.
4. **Ordered wood:** only one offer, one completed ten-unit job within 17,943 ticks;
   native delivered 30 in one job / 374 ticks. **Not a completed matched pair** or an
   efficiency ratio. The ordered local opportunity path and pre-existing native trip
   must be accounted for before retrying the comparison.

The monitor's SSH connection ended during the long batch. The remote wood runner and
recording continued and finalized; no case was restarted. The component case was started
once after confirming the previous runner had exited. All recordings remain decodable
and hashed; the monitoring interruption is not omitted from the run record.

## Handoff

Clawd: repair the scenario preconditions and implement the already-listed required
retarget/nested cases before the **last** B1 fix/recheck round. If B1 is not clean after
that round, ship strict and park growing with this evidence; do not reset the ledger.
Strict must still pass the migration requirements. Rescue handover in the game,
cross-map clock provenance, candidate-site/multi-zone boundaries and the unimplemented
retarget/nested cases are not cleared by these results. Wrapper cost remains to measure.
The #71 inference-age, late-answer and lane-failure checks remain for the separately
frozen live run. No new live setup is signed here.
