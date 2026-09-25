# Native construction — scripted review

PR [#89](https://github.com/blueworkslabs/rimworld-concord/pull/89), 2026-09-25.
**Partial scripted verification, not Gate C acceptance. No model calls.**
Current status: [second review](#second-review--removal-accounting-and-fixture-boundaries)
closes the cancellation/deconstruction and queued-withdrawal gaps; replacement and
queued-forced restore remain unexercised. #89 stays draft.

## Initial review (historical, through `83cc543`)

The following results and blockers describe the initial pass. The second-pass
section below supersedes its current-status claims, not its retained outcomes.

### Reviewed changes

Independent review identified accrued work being relabelled after withdrawal and
unsettled work being lost on retirement. Those are corrected, along with mutation
before unsupported-definition rejection and truncation of the accounting ledger.
Durable records are no longer discarded when the display window advances.

The first recorded staging attempt at `856b87a` stopped immediately because Unity
omitted the nested receipt arrays. The failure remains retained; missing arrays
were not treated as zero contribution. Corrected `8ec40a9` emits the arrays
explicitly. All 460 offline tests and pinned-assembly compilation pass. Focused
independent re-review covers these corrections and the runner safeguards below.

### Recorded results

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

### Coverage is narrower than the 17 case titles

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

### Patch-cost limits

All thirteen ledger costs remain pending. Current values omit several postfix and
finalizer bodies; the deposit wrapper includes native transfer time; the `active`
counter often means only the global active flag. They are partial observations,
not full overhead, dispatch-inclusive cost, or a colony slowdown measurement.
Timing is now disabled in `finally`, including a failed check.

The original failure, corrected attempts, recordings and proprietary save/assembly
inputs remain retained privately; public evidence contains only sanitized receipts.


## Second review — removal accounting and fixture boundaries

Author revision `532e483` added pending removal classification, more scripted
branches and broader timing. Independent review found that deferring classification
also deferred work settlement until the frame had disappeared. The corrected mod
settles current-frame work **before destruction**, while preserving the deferred
cause classification. Aborted lab faults and pending transition state are cleared
on load and in scenario cleanup. Timing covers wrapper/factory and inactive paths,
with native deposit time separately reported. It does not include all measurement
bookkeeping or Harmony dispatch; nested timings are not exclusive.

Corrected mod revision `8cbdc59` passes 460 offline tests and pinned compilation.
The later runner-only `92eab1e` enables the ordinary scanner's work type while
paused before creating the queued candidate; it does not interrupt the unrelated
current job or force admission. Focused independent reviews cover both corrections.
An unchanged cancellation test failed once during the review (459/460); its log is
retained, followed by successful full 460-test runs. The final runner-only change
also passes TypeScript build and both construction launcher guards.

### Retained setup failures

- The first case 7 attempt at `d1b3fac` made only seven wood available globally.
  Native full-cost resource admission prevented any delivery. It was operator-stopped
  and retained, not counted as a normal runner pass or completed failure. The retry
  leaves seven wood nearby and a full-cost distant stack available, outside the
  initial nearby-pickup radius. No native capability or consent rule is bypassed.
- Case 12 at `8cbdc59` failed: the real build designator rejected Stool over a
  Campfire frame as **“Space already occupied.”** The tagged campfire lacks native
  replacement tags. Same-def placement is rejected as identical; permitted
  coexistence is not replacement. Independent pinned-source and definition review
  found no ordinary native replacement fixture for this supported carrier. This
  remains **unexercised**, not a passing replacement test; no god-mode or direct-wipe
  substitute was used. The case requires a scope/fixture disposition before full
  acceptance. An overlapping blueprint while removal is pending is a temporal
  heuristic, not general authenticated player-call provenance.
- The first case 15 attempt observed carried withdrawal, excluded attachment and
  current-frame withdrawal, but then failed to create the ordinary queued candidate
  with its work types disabled. Its recording and raw receipt remain separate from
  the corrected runner retry.

### Timing interpretation

The corrected basic build produced hook-body observations for nine of thirteen
methods. B2, B3, B7 and B12 had zero calls in that sample and remain unmeasured.
B8 separates 32.5 microseconds of wrapper body, 7.0 of factory body, and 101.1 of
native transfer. These are one-build totals, not stable per-call benchmarks.
The quiet untagged all-Concord/detached-Concord comparison returned about
59.54–59.63 ticks/s in all four arms: capped throughput, **inconclusive for slowdown**.
Incoming mode 1 and all 25 Concord-owned patched target methods were restored;
that whole-mod count is not the thirteen-method construction ledger ceiling.


### Second-pass results and preservation

- **Case 1 passed:** Pedro delivered 20 wood and built the campfire; final work
  reconciled and zero recorded violations. The timing sample is from this run.
- **Case 7 passed after fixture correction:** blueprint cancellation, cancellation
  and ordinary deconstruction of separate frames holding seven wood, and removal
  of an actively worked frame. The last boundary preserved 14.642102241516113 work;
  ordinary deconstruction was not labelled replacement.
- **Case 15 passed after paused-priority correction:** carried withdrawal, exclusion
  during attachment, finish-frame withdrawal preserving earlier accepted work, and
  removal of a queued ordinary candidate without disturbing its unrelated current
  job. Queue job 12 was removed while `Wait_Wander` job 4 remained current. This does
  not independently prove every reservation/reentrancy branch in the signed case.
- **Case 9 passed on the current mod:** blueprint and frame before/after views matched
  in-process and in fresh bridge processes (parent 195188, children 195229/195345).
  Continuation built successfully with 200.99615478515625 total work. The revised
  runner accepts either native completion or an honestly reconciled native failure;
  the initial review's failed continuation is unchanged, not reclassified or rerolled
  to obtain a favourable result on that old build.
- **Case 12 failed setup** as described above: actual player replacement unexercised.
- **Case 13 failed overall:** direct scanner-forced Beatrice delivery and construction
  completed with the forced/uncredited classification, but the requested queued job
  started immediately behind idle work. The strict queued precondition rejected it.
  Pinned `TryTakeOrderedJob` may start a requested queued order immediately when the
  current job is idle. Arrange genuinely non-idle work before testing persistence;
  queued forced restore and real-menu prioritized continuation remain unexercised.
- Supplemental **case 18 passed its measurement/configuration checks**, with the
  capped interpretation above. It is not an additional construction acceptance case.

Eleven of the seventeen construction case names have not been run across these two
review passes. Nearby rechecks, shared work, explicit failure, fate/forbid, transition
faults, two-site delivery and generation branches still require their named evidence.
Replacement needs a supported-scope disposition, not a bypass of native placement.
Full handler costs also remain incomplete for zero-call and active paths.
The private player log retains eight `Job_0` destination-reservation reference
warnings on helper-fixture loads; the same warning is present in the prior pass.
This is not a claim that the game log is warning-free.

All **428 saves** present at the start of this second review are unchanged. The first
fixture attempt added one save; the corrected session preserved all 429 then-present
saves and added ten. Eleven new checkpoints are retained. Previous mod bytes were
restored; game and display are stopped. All **nine uncut recordings** match remote
hashes. No model calls. The [second-pass sanitized receipts and recording hashes](../evidence/native-construction-review-round2.json)
keep all eight completed runner invocations and the separately operator-stopped
fixture attempt. Original first-review evidence remains untouched.
