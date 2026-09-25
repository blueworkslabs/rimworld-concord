# Native construction — initial scripted review

PR [#89](https://github.com/blueworkslabs/rimworld-concord/pull/89), 2026-09-25.
**Partial scripted verification, not Gate C acceptance. No model calls.**

## Reviewed changes

Independent review identified accrued work being relabelled after withdrawal and
unsettled work being lost on retirement. Those are corrected, along with mutation
before unsupported-definition rejection and truncation of the accounting ledger.
Durable records are no longer discarded when the display window advances.

The first recorded staging attempt at `856b87a` stopped immediately because Unity
omitted the nested receipt arrays. The failure remains retained; missing arrays
were not treated as zero contribution. Corrected `8ec40a9` emits the arrays
explicitly. All 460 offline tests and pinned-assembly compilation pass. Focused
independent re-review covers these corrections and the runner safeguards below.

## Recorded results

- Original basic-build attempt: **failed**, required receipt arrays absent.
- Corrected basic-build attempt: **passed**. Pedro delivered 20 WoodLog, completed
  the campfire at tick 745, and received 200.99615478515625 recorded work, including
  the final increment. One blueprint-to-frame transition, zero recorded violations.
- Restore case: **failed overall**, because subsequent native construction failed.
  Blueprint and frame same-process and fresh-process game-view comparisons all
  matched their retained pre-save baselines (parent 190121, children 190220/190362).
  After continuation, native construction failure at tick 730 retained 20 WoodLog
  delivered and 119.79903411865234 work; refunds remain “not recorded.” This is not
  evidence of a mismatched restore. No reroll was made to obtain a successful build.
- Fifteen other named cases were not run in this review pass. Full acceptance is pending.
- Sanitized [receipt and recording hashes](../evidence/native-construction-review.json).

The previous mod was restored after the failed first attempt and all 423
pre-existing saves were unchanged. The corrected attempts used a separate retained
staging directory and uniquely named saves. Final shutdown also restored the previous
mod; all 424 saves present before that second start were unchanged. Across the whole
review, all original **423 saves** are unchanged and five new saves are retained.
Game and display services are stopped. All three uncut recordings match remote hashes.

## Coverage is narrower than the 17 case titles

The runner now rejects wrong-stage checkpoints and unexercised partial-material,
shared-job, pre-tag and blocked-conversion assertions. It uses Beatrice, not
hauling-disabled Alvin, for the hauling-only refusal half, verifies native priorities,
keeps a second acceptance during carried-load withdrawal, stops on observed consent
violations, and aborts after a failed case. No character capabilities were changed.

**Runtime attribution blocker:** `DestroyMode.Deconstruct` does not prove player
replacement. The native ordinary deconstruct designator uses the same mode for a
frame; some build-designator replacements first cancel their old frame. The current
“replaced by the player” cause is therefore unreliable. Fix and verify both paths
within the signed patch ceiling before merge.

Remaining acceptance work must be explicit before merge:

- Case 4: demonstrate the actual nearby extension/recheck, not merely absence of
  a tagged delivery plus another site's frame.
- Case 5: reconcile per-pawn work with native frame deltas, including final increment
  and the failure-before-increment boundary.
- Case 7: arrange genuinely partial material supply, not a fully supplied frame.
- Case 13: queued/restored forced provenance, ordinary continuation after the forced
  job, and no stamp leakage; direct scanner orders do not prove menu interaction.
- Case 14: absent/ambiguous successor and exception-unwind branches remain outside
  the ordinary transition observation.
- Case 15: current finish-frame withdrawal, queued/reserved candidates, rejection
  without disturbing unrelated current work, and cleanup reentrancy.
- Case 16: checkpoint **between** two deposits, then observe the next effect after
  restore; persisting two completed deposits alone is weaker evidence.
- Case 17: an effect after retagging and same-def physical replacement, not only
  immediate empty-generation assertions.

Paired/new-process claims refer to comparing the restored **game view** with its
retained checkpoint. A fresh bridge process is not a game-process restart or proof
of future coordinator construction state, which belongs to the later slice.

## Patch-cost limits

All thirteen ledger costs remain pending. Current values omit several postfix and
finalizer bodies; the deposit wrapper includes native transfer time; the `active`
counter often means only the global active flag. They are partial observations,
not full overhead, dispatch-inclusive cost, or a colony slowdown measurement.
Timing is now disabled in `finally`, including a failed check.

The original failure, corrected attempts, recordings and proprietary save/assembly
inputs remain retained privately; public evidence contains only sanitized receipts.
