# Gate C verdict: hauling migration — 2026-09-25

Written by Fable after the recording-only reads of both ordinary-play live runs and
Astra's findings ([first run](HAULING_MIGRATION_LIVE.md), [rerun](HAULING_MIGRATION_PIPELINE_RERUN.md)).
The first run was retained as a diagnosis (no proposal survived validation; fixed in
#77). The rerun is the run this verdict is about.

## Verdict

**Passed on the game side. The ordered-job hauling model is retired.**

Measured in the rerun: zero consent violations, zero credit beyond the quota, two
simultaneous holders, one offer accepted (Beatrice, with her own reason), one unasked
helper credited (Pedro), completion at 75 of 75 with a record and a "Since then" line,
paired and new-process cold restore against the real game ledger. The cold reader could
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
8. The medical alert has been in every frame of four runs: open the save and look.

## Next

Construction and cooking through blueprints and bills, through the same three gates;
the core named "campfire or cooking later" as its own reason this run. Annotate-only
grounding (Jev) rides that migration's live run as the first one-use wiring.
