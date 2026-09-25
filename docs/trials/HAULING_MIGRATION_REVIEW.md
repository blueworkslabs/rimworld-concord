# Hauling migration: pre-staging review

2026-09-24, [PR #73](https://github.com/blueworkslabs/rimworld-concord/pull/73).
Author revision `0f7e10f`; base `61817af`. This is a **source/offline review**, not a
scripted-game result. The [signed freeze](../MIGRATION_HAULING.md) is unchanged.

## Re-review and scripted staging, 2026-09-24

The original findings below are retained as history. Fable's later B2 disposition
supersedes the proposed deferral: a job predating an intent's tag is ordinary
pre-agreement work relative to that intent, including across retargets; it is not
credited, counted against quota, or trimmed. The comparison is the durable job start
tick against tag creation tick. Same-tick attachment is rejected before mutation and
may be retried on the next tick, rather than misclassifying an unadmitted load.

Re-review fixes at `a372804` include immutable cleanup job IDs (native pooling clears
IDs), release of old bounds on a pre-agreement retarget, atomic rescue ownership and
restart recovery, captured-trip draining, immutable crew-entry map provenance and
receipt event times. Focused independent reviews completed; 406 tests pass and the
mod compiles against pinned 4871. These are not live-model results.

Initial recorded scripted round 0 failed with no haul starts and no delivery. The
fixture omitted the serialized health and quality filter ranges; pinned `ThingFilter`
loads zero-valued ranges when absent. The untouched recording and receipt are retained.
Correction `c5028b4` restores normal full ranges in a new fixture with the **same**
item counts, positions, quotas and pawn settings. It also requires a genuinely pending
duplicate selection, exact pre-agreement bucket reconciliation and exact matched totals.
This fixture correction counts as **B1 fix/recheck round 1 of 2**, not a free reroll.
Round 1 is complete but not clean: see the [recorded staging results](HAULING_MIGRATION_STAGING.md). No live run authorized.

## Original pre-staging disposition (superseded by the re-review above)

**Not cleared for deployment or staging.** Independent mod and coordinator reviews
completed. The initial 395 tests passed despite the issues below. Review corrections
pass 397 tests and compile against the pinned 4871 assemblies; they do not establish
gameplay correctness. Direct runner invocation and an already-owned launcher lock
both fail before mailbox access. No game, display, Android or model run was started.
The staging assembly hash still matches the pinned build.

### Blocking findings for Clawd

1. **Tagging an existing stockpile misses running trips.** `IntentState.Accept` attaches
   the tag without admitting existing `HaulToCell` jobs. Both new pickup/duplicate guards
   fall through to native behavior when no hold exists. A pawn already walking to a
   source or carrying a 30-unit load can therefore deliver 30 into a newly tagged
   quota-10 intent; placement reports the escape after the fact. This affects strict
   and growing modes and re-tagging. Jobs already collecting when their pawn becomes
   excluded also need coverage. Decide the attachment boundary before implementation:
   admit eligible existing trips atomically within quota, or defer/reject attachment
   while incompatible trips are in flight. Do not trim carried cargo, hide the extra as
   ordinary work, or treat a later detector as the guarantee. **Fable:** deferring the
   tag with a plain reason is the smallest fallback when a whole carried load cannot
   fit; it is a recommendation, not a new signed policy.
2. **Pending rescue handover loses ownership.** The accepted rescue is stored as stopped,
   while withdrawing the old haul clears the pawn's intention. During draining the pawn
   cannot withdraw the rescue, and competing work/patient/bed claims can be admitted.
   Later dispatch can overwrite a newer native intention. Keep the pending rescue owned,
   withdrawable and conflict-visible; revalidate ownership before dispatch. A restart
   between consent persistence and withdrawal must also finish stopping the old
   coordinator agreement. Persistent exclusion transport failures must not prevent the
   handover deadline from being processed. Native dispatch still validates cargo,
   capabilities, patient/bed and ordered commitments; this is not a claim that those
   game-side checks are bypassed.
3. **Clock provenance is not event-local.** Both crew-log views convert receipt ticks
   using the currently viewed map. Switching longitude changes an old receipt's hour.
   Carry/resolve the event map before conversion; unknown map provenance must not be
   guessed from the viewer. The freeze requires the event's relevant map.
4. **Named branch coverage remains incomplete.** Withdrawal-after-duplicate-selection
   currently observes only carrying; mid-growth save/load compares aggregate holds,
   not this job's pending extra and durable budget; the mixed-zone case does not prove
   the refusing pawn hauled an unrelated third def. These cases now explicitly fail
   coverage instead of silently passing. Source-mutation tests additionally need exact
   job/first-pickup receipts to distinguish the guarded pickup from later legitimate
   growth. The four already-listed retarget/nested-failure cases remain unimplemented.
   A wood-only comparison is not the full frozen matched pair; add the component half,
   exact matched quantities and measured trip counts. UI/clock/show-button and rescue
   handover game cases still need actual recorded evidence.

### Corrections in this review

- Preserve the original zone label/colour across presentation-owner transfer, and
  refresh the remaining def label when a non-owning tag retires.
- Reconcile the last archive delta before re-tagging closes that generation.
- Preserve historical native-only permissions when opening or restoring an old store
  that has `nativeHaul` but no new scope flag.
- Distinguish requested rescue dispatch from a confirmed `started` game receipt.
- Stop the runner on observed invariant/detector violations during polling; retain
  each completed case immediately and report final capture/pause failures.
- Require actual quota completion in matched baselines, overlap in the contention
  case, and both item quotas in the mixed case. Missing intents are not completion.
- Correct the fixture description: its existing mixed stockpile already accepts the
  items, so ordinary hauling **can** start before tagging. Nearby pairs are candidate
  geometry, not proof of duplicate pickup.

## Round ledger and next step

**Initial scripted run: not started. B1 fix-and-scripted-recheck rounds used: 0/2.**
These are pre-staging review corrections, not a passing round 0. No safety or consent
boundary was exercised in the game. Strict fallback does not resolve the existing-zone
attachment issue, which is shared by both modes.

Clawd: resolve the blocking admission/handover/provenance paths and add reliable branch
receipts/checks on this draft PR, then independent re-review and recorded scripted
staging. The two-round limit and all retained-failure rules remain in force. No live
setup is frozen or authorized by this review; #71's live verification stays pending.
