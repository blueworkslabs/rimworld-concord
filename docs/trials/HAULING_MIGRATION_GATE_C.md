# Gate C verdict: hauling migration — 2026-09-25

Written by Fable after the recording-only reads of both ordinary-play live runs and
Astra's findings ([first run](HAULING_MIGRATION_LIVE.md), [rerun](HAULING_MIGRATION_PIPELINE_RERUN.md)).
The first run was retained as a diagnosis (no proposal survived validation; fixed in
#77). The rerun is the run this verdict is about.

## Verdict

**Passed on the game side. Retirement of the ordered-job hauling model is authorized;
runtime deletion is pending the two-PR sequence below.**

Measured in the rerun: zero consent violations, zero credit beyond the quota, two
simultaneous holders, one offer accepted (Beatrice, with her own reason), one unasked
helper credited (Pedro), completion at 75 of 75 with a record and a "Since then" line,
paired and new-coordinator-process cold restore against the real game ledger
(the game process stayed running and reloaded the paired save). The cold reader could
name who was asked, who helped unasked, when the agreement ended and what followed.
Live checks from #71: seven required as-of prefixes present, none missing; failure
counts and causes on screen; late answers unexercised (not exercised, not failed).
Matched-pair trips and simulation cost come from the scripted evidence in #73.

Not passed on the crew side, which this gate did not measure: one acceptance, no
refusal, no counter, five idle minutes, follow-up questions asked before receipts.

## Deletion (authorized)

`Hauling.cs`, the ordered haul planning, the 35 % needs stop and the ordered-half runner
path, per [MIGRATION_HAULING](../MIGRATION_HAULING.md#retiring-the-ordered-haul).
Historical evidence and trial pages stay. The growing hold remains parked (B1 2/2).

Fable's review sequence: first port generic haul-based tests to rescue with runtime
behaviour unchanged, and give moves their own cancel kind. Astra reviews that PR;
green unchanged-behaviour checks gate the second, runtime-deletion PR. The deletion
includes haul-only runners/tests and ordered matched-runner halves. Frozen model-eval
fixtures stay legacy read-only data, never offered, planned or dispatched. Production
retains its own unchanged readiness checks until construction/cooking migrates. The
deletion PR records the actual footprint versus the original migration list.

## Follow-ups (none block the deletion)

1. Archive display shows removals and refreshes its timestamp ("60 arrived, 15 removed").
2. "Heard <name>" whenever a pawn's request wake produces no message to that pawn, not
   only when the core waits.
3. A pawn's own meal memory must not interrupt its in-flight answer about that meal.
4. No consumption follow-up question until the self-care receipt is completed or failed.
5. Core inputs over 24,000 bytes are trimmed oldest-first like reflections.
6. Design: a bounded re-wake when the core waited with proposable work and nothing has
   happened for a while.
7. Attention evictions (17) recur: diagnose the per-pawn buffer.
8. Medical alert: **inspection completed, 2026-09-25** (below). No treatment or fixture
   change made; care remains an ordinary-play follow-up.

## Next

Construction and cooking through blueprints and bills, through the same three gates;
the core named "campfire or cooking later" as its own reason this run. Annotate-only
grounding (Jev) rides that migration's live run as the first one-use wiring.

## Medical-alert inspection (paused game, 2026-09-25)

Astra opened the retained rerun handoff and the unchanged starting helper save on
pinned RimWorld 1.6.4871, without a coordinator or model calls. The alert tooltip
names **Beatrice**. Her Health tab shows minor asthma in both lungs; each lung's
tooltip says **"Needs tending now"**. Cataracts in both eyes and an old aching right-leg
gunshot scar are also present, but the asthma supplies the observed tending need.
The same asthma conditions are already present in the starting save; the paused
initial-load frame did not populate an alert, so it is not an alert-timing test.

Read-only save comparison confirms the same two asthma conditions (IDs 35/36) in
both saves: severity approximately 0.001 initially and 0.151833 at the rerun handoff.
The displayed minor asthma reduces each affected lung's efficiency by 10%; overall
breathing is 90%. The bridge's scalar `health: 1.0` did not establish absence of a
treatment need. This resolves the alert's source; it does not claim a tested care
path or justify changing Beatrice's established conditions.

Private screenshots and save hashes are retained outside the repository. The game
was inspected paused (with the normal load-time tick advance), then quit without
saving; no treatment, beds, priorities, pawn capabilities or original saves changed.
