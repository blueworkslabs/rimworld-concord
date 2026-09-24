# Native-haul staging smoke — partial, 2026-09-24

**Not a Gate C verdict.** Tested code `40589bd`, RimWorld 1.6.4871 rev600, assembly
SHA-256 beginning `082db1dd4f7f`. All game cases were scripted and recorded, with zero
character-model calls. [Aggregate evidence](../evidence/native-haul-smoke.json).

## Review and corrections

Independent read-only Codex review preceded staging. Confirmed defects were corrected
and focused re-reviewed: additional pickup accounting for pre-carried loads, stale lab
commands, load-time arrival deduplication, test preconditions and raw event retention.
Counteroffer coverage that was not implemented is now explicitly deferred. The first
real smoke exposed omitted nested arrays in Unity JSON; explicit receipt serialization
was corrected and re-reviewed before continuing. All original failures remain retained.
364 coordinator tests, pinned-assembly compilation, pickup-budget checks and launcher
lock/direct-invocation guards passed. These are not substitutes for gameplay evidence.

## Observed results

Seven available cases passed, with zero observed event gaps:

- Attribution-only: Pedro, an unaccepted helper, delivered and received credit for all
  30 wood. Alvin accepted; Beatrice refused and received no credit. No quota escapes
  or consent violations were recorded.
- A stale-timeline lab command was rejected.
- A haul candidate was created and discarded without reserving quota.
- Exclusion removed a queued tagged job without changing the quota ledger.
- An excluded pawn's queued start was rejected without a credited delivery.
- A second acceptance could not change an existing quota. This is **not** a counteroffer test.
- Game save/reload preserved an open intent with 60 delivered and 15 reserved, including
  its credit/drop history and zero unattributed/removal totals. It then completed at 75,
  with zero reserved, escapes or violations. This is **not** cold or paired coordinator restore.

The initial serialization failure, the subsequent exclusive-fixture failure and a
startup-lock rejection before a case began are separately retained, not counted as passes.

## Fixture blocker and remaining work

The unchanged Alvin has the `Rancher43` backstory, which disables `ManualDumb` work.
RimWorld removes Hauling priority on load. The sole-Alvin exclusive case therefore
finished its observation window with 0 delivered and the intent still open. Native
capability was respected; this is not evidence that consent filtering failed.
An initial suspicion of a work-priority index mismatch was rejected after checking the
backstory and load behavior. No priority-map change was made.

The design's sole-Alvin exclusive and meal cases need a capable accepting pawn. The
recommendation, **not yet adopted**, is Pedro accepting, Beatrice refusing, Alvin
unanswered. No backstory, capability or test role was silently changed. Meal trip count
and resumption remain unverified. Also pending: live offers/counters, matched ordered
halves, cold/paired restore, the full concurrent/escape/cleanup matrix, forced partial
merge/opportunistic replacement, work-options and patch-cost measurements.

Game and display were stopped at handoff. All 285 pre-existing saves are hash-unchanged.
Raw events, snapshots, saves, recordings and review transcripts remain private.
