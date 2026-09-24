# Native-haul offers and meal staging — partial, 2026-09-24

**Scripted evidence, not a Gate C verdict or live-model run.** This continues the
[original smoke checks](NATIVE_HAUL_SMOKE.md) with role sheet v2 and PR #69. RimWorld
1.6.4871 rev600 remains pinned (`082db1dd4f7f`); original failures are retained.
The [sanitized evidence](../evidence/native-haul-offers.json) links run IDs and raw
receipt hashes. These are individual scripted observations, not a complete matrix.

> Historical helper/overlap and concurrent-quota cases do not establish contention:
> the old policy reserved all remaining quota. See the corrected-policy
> [contention reruns](NATIVE_HAUL_CONTENTION.md). Other observations retain their scope.

## Review corrections

Independent read-only Codex review preceded deployment and covered subsequent
substantive corrections. Native exclusions are durable until the game confirms them;
uncertain acceptance retains the agreement and reconciles actual game standing without
another pawn decision. Pending exclusions also hold already-issued ordered work.
Withdrawn obligations do not become completed because somebody else meets the quota.
Configured native mode excludes legacy ordered-haul offers; the ordered baseline uses
a separate, unconfigured coordinator. The paired checkpoint requires an open intent
with an active reservation, not a delivery that may already close the quota.

374 coordinator tests and the pinned-assembly mod build passed. These checks are not
substitutes for gameplay proof. Raw reviews, saves, recordings and full events stay private.

## Observed functional checks

- **Exclusive:** Pedro delivered 30 wood; no other pawn received credit.
- **Two accepting pawns, quota 30:** delivered exactly 30, no overshoot. The observed
  delivery was one load; this does **not** prove two overlapping in-flight loads.
- **Core offers:** Alvin was not offered hauling, with the visible reason; Beatrice
  refused; Pedro countered 20, the core adopted it, and Pedro accepted. A paired
  checkpoint preserved an open intent with 20 reserved and zero delivered. It then
  completed at 20, credited to Pedro. This is not cold-process restore.
- **Attribution with revised roles:** Pedro delivered 30; Beatrice did not help. The
  helper-observation check failed and remains unproven for this role sheet. Earlier
  original-role helper evidence is not relabeled as this run.
- **Withdrawal:** walking withdrawal delivered nothing; carrying withdrawal finished
  its 30-wood trip and recorded `finishedAfterExclusion`.
- **Already carrying:** 20 against quota 5 was rejected at admission; 10 against
  quota 30 completed at 30 with no escape.
- **Deliberate quota fault:** 60 placed against quota 5 was honestly reported as 60,
  with 55 overshoot. This is detection evidence, not normal admission behavior.
- **Arrivals:** direct spawn 3 and unhooked merge 2 were recorded as five unattributed
  arrivals, separately from 60 intentional deliveries.
- **Partial expiry:** expired at 60/75, released reservations, retained the 60 credit.
- **Cleanup test invalid:** its runner reported pass, but inspection showed the haul
  had already finished and the interruption ended `Wait_Wander`. There was **no
  incidental drop**. The original receipt is retained; the check now requires an
  actual `HaulToCell` interruption and positive incidental quantity. No corrected
  gameplay pass is claimed; a reliably triggered cleanup drop remains outstanding.

## Meal calibration and native result

The first five-wood layout allowed native opportunistic pickup to combine the stacks
into two loads, not fifteen trips. Spacing the stacks ten cells apart produced fifteen
five-wood deliveries, but the quota still finished before eating at Food 0.33.

On the pinned build, the fixture's raw berries become native food candidates below
Food **0.12**, not the ordinary want-to-eat threshold of 0.30. The final matched save
starts Pedro at **0.13**, with eighteen stacks of five wood, spaced at least ten cells
apart, and quota 75. No capability, backstory, food preference or native pickup rule
was changed. Both native and ordered meal halves use that same input save.

The corrected native meal run passed:

- First native work started at tick 4, **1 tick after run start**.
- Pedro delivered **15 wood in three trips**, then ate at tick 1723.
- The intent remained open with **60 wood unfinished**.
- Another tagged native haul started **3 ticks after eating**, without a model call.
- The extended run completed **75/75**, all credited to Pedro, last delivery at tick
  **10042**, approximately **170 seconds** of observation. No quota escape or consent
  violation occurred. This is run `b708d596`, not an inferred completion from resumption.

The check reconstructs deliveries at the meal event's tick. A later snapshot can already
contain the resumed job's reservation, leaving zero *free-to-reserve* quota despite
unfinished work. The earlier false failure from conflating those quantities is retained.

## Matched ordered baseline

The main baseline delivered **30/30**, with one authored offer and three ten-wood
receipts. First ordered work began 124 ticks after start.

The meal baseline used the same calibrated save but native Hauling disabled. In the
600-second window it delivered **15/75**, from three authored offers. Pedro ate at tick
1339 and first began ordered hauling at 1768: **1765 ticks from run start**, or **429
ticks after eating**. There was no pre-meal ordered work, so this is **work initiation,
not resumption**. Native began after one tick and resumed existing work after three.
These are single scripted comparisons, not model-latency or statistical estimates.

The ordered-meal runner originally failed because it matched `ConcordHaul` instead of
the actual job def `Concord_Haul`. That failure and its raw receipt are unchanged. The
timings above are an explicitly labeled **offline rescore** of those retained events
using the reviewed exact-name correction, **not a gameplay rerun or new passing run**.
The shortfall is real: quota was not met. There were no stale rejections or stop
receipts; 388 polls had no grounded offer option. Authored offer counts are only
estimated core-offer turns for a hypothetical live run, not measured inference cost.

All these staging cases made **zero character-model calls** and reported zero event
gaps. Independent code-review model calls are separate.

## Remaining verdict boundaries

No live inference or Gate C approval is claimed. Revised helper participation,
overlapping two-pawn reservations, actual cleanup placement, cold
coordinator restore, forced opportunistic replacement/partial merge, work-options and
isolated patch-cost measurements remain outside the passing evidence above. In
particular, the cost of the broad `Job.SetTarget` patch has **not been measured**.

Staging was saved to a new handoff save and stopped; all 285 original save hashes are
unchanged. Logs retain a `Job_0` destination-reservation reference warning already
present in the original fixture. This is not a warning-free-load claim. No character
capability or backstory was changed. Both stacked PRs remain draft pending remaining
coverage and the frozen attribution-only live run; Fable owns the Gate C verdict.
