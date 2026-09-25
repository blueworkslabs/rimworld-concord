# Hauling migration — ordinary-play live freeze (unsigned)

2026-09-25 · **Prepared for Fable's signature; no live run started.**
[#73](https://github.com/blueworkslabs/rimworld-concord/pull/73) is merged at
`ba2ee7a`, strict as the migration configuration. Growing stays parked at B1 **2/2**.
This is a new ordinary-play setup, not an extension of the signed intent-only spike.

## Concrete setup

SHA-256: `1f23ad7e7e780ec42f428db456f058f38d8423d2b12279bedf3e77d6b1d82445`

[Canonical hash inputs](../evidence/hauling-migration-live-setup.json) bind the merged
behavior, host/staging runner digest, launchers, native helper/catalog/config, game/mod
binaries, controls, lab bridge, unchanged save and protocol. Recompute before launch;
any changed executable input needs a new freeze. Raw saves/configs/receipts stay private.

- **Ordinary play, strict attribution only.** Native tagged-zone hauling replaces old
  ordered hauling; rescue, construction and cooking remain under their existing
  conditions. No Jev wiring, new threshold, completion-report link or legacy deletion.
- Unchanged helper-layout save `lab-concord-nh-helper-20260924` (same source as the
  spike): six 20-wood stacks, **120 available**, candidate pile x76/z84/w4/h4,
  **quota 75**, expiry **30,000 game ticks** from acceptance. The operator names one
  `WoodLog` entry, **shared wood pile**. No new pawn/need/position/backstory/work-priority
  edits, no forced role, no quiet-base rewrite.
- **Two capable haulers: Pedro and Beatrice. Alvin remains natively incapable of
  hauling by his Rancher backstory.** The initial observer record says he is not
  offered; his other agency is unchanged. Candidate geometry and exact entry ID are
  in the fingerprint. The brief treats all three as equals, lists shared bodily needs,
  local supplies and optional work, allows ask/propose/wait, respects refusal/deferral,
  and does not require finishing the pile or keeping anyone busy.
- Luna `gpt-5.6-luna`, **low** reasoning, native subscription for core/pawns,
  unchanged prompt limits, no Jev, no turn cap or automatic rerolls.
- **Ten minutes** continuous wall-clock observation, #64 uncut observer recording:
  1280×800, 15 fps, no game audio; no inference pause. 300-tick core cooldown,
  2,500-tick delivery-separated native stall wake; 960-second outer safety deadline.
- Band-only wakes consume silently unless something is offerable or Food/Rest worsens
  to urgent (first/unknown urgent readings wake conservatively). Exact E2 replay
  silences **3, 6, 13**, preserving **4, 5, 7**, including Beatrice's question opportunity.
- Offers and pawn choices remain free. Missing offers to either capable pawn are
  retained as negative protocol coverage; refusal, deferral, quiet waiting and unmet
  quota are valid outcomes. No live fixture adjustment, forced acceptance or reroll.
- **Post-run cold restore means new host and coordinator OS processes.** The game
  process stays up and reloads the paired save; compare its actual ledger to the
  retained checkpoint baseline. Save a new handoff and stop game/display afterward;
  verify all then-pre-existing save hashes and copied recording hashes.

## Review and actual-runner rehearsal

[Sanitized evidence](../evidence/hauling-migration-live-rehearsal.json).
Independent reviews of final urgent policy `3aad097` and executable-harness fix
`d84232d` are clear. **412 tests pass**, direct-launch/held-lock guards stop before
bridge access, and CI/Pages are green on merged main. The earlier helper-cancellation
test failure is retained, not erased by the passing full-suite run.

Review caught a real integration gap: the ongoing driver checked only inference
`ready`, bypassing silent consumption. It now runs silent bookkeeping through the
same refreshed coordinator admission/result handler. A separate recorded
`--hauling-migration` protocol configures ordinary play; it cannot select growing or
exclusive participation. Historical `--native-haul` intent-only behavior remains separate.

Run `37e9e209-8622-45e6-825d-477578877e43`:

- **46.230 seconds**, 27 samples, all unpaused. Four authored core choices,
  two authored acceptances, **zero model calls**.
- Both capable pawns offered and accepted. **75/75 wood: Beatrice 55, Pedro 20**;
  zero recorded consent violations or quota escapes. Completion at tick 1439;
  later ordinary work appears separately in the observer's “Since then” record.
- Initial menu included **construction plus native haul**, no ordered hauling.
  Other work was not authored/executed in this rehearsal; cooking/rescue still need
  their usual prerequisites, and their earlier acceptance evidence remains separate.
- First-delivery wake observed at t623 and terminal wake at t1492. The later band
  change coincided with agreement closures; this recording does not isolate silent
  band-only consumption. Silent/urgent behavior has mock and exact-input replay
  evidence. No stall occurred before quota completion.
- Paired restore passed. Cold host PID **463886** differs from
  **463583**; cold coordinator **173942** differs from
  **173662**. Actual game ledger matched the terminal checkpoint. This is
  **not** an open-cargo cold-restore observation.
- Recording: **49.333s**, 1280×800/15fps,
  verified against remote SHA. Initial/final observer frames inspected: native
  incapability, completion attribution, waiting status and ordinary-afterward record
  readable. Prior Show/label/colour acceptance remains separate; no new Show click.

Staging is stopped; all **405 pre-existing saves** are unchanged. The rehearsal
succeeded on the first attempt with this setup; historical strict/growing failures
remain preserved in the earlier migration reports.

## Launch and verdict gates

**Fable signs this fingerprint before launch.** The review workflow requires an
actual-scheduler recorded zero-model rehearsal and game-ledger cold restore before
freezing; those steps above are complete. This document is not a live result.

Stop and diagnose if unsupported capability or consent can reach execution, an
invariant fails, or repeated invalid output/non-progress blocks the run. Do not
classify valid refusal, quiet waiting or an unmet quota as a retry reason.

Gate C retains [every migration measure](../MIGRATION_HAULING.md#gate-c-will-measure):
zero consent/quota escapes; who was asked/helped/when it ended/what followed;
matched trips/ticks and simulation-cost evidence kept distinct from scene findings.
**#71 must be checked live** against saved input ticks, intervening receipts and
publication entries:

1. Every stale narration has its as-of prefix: **zero unflagged**.
2. Every failure has its content-free cause and visible **per-lane counts**.
3. A late answer is retained as **lapsed**, never agreed/unfulfilled/withdrawn; frozen
   meaning: “Answered yes after completion; no agreement started.” Preserve other
   answer/end reasons as applicable.

An unobserved branch is **not exercised live**, not passed. Failure makes this a
retained diagnosis, not a scene; no reroll. First deliver the uncut recording to
Fable for the four-sentence cold read; release technical findings **after** that read.
Fable's verdict comes before the deletion PR (`Hauling.cs`, ordered haul planning,
35% needs stop). Completion-report-to-receipt linking also remains after this run.
Multi-map remains deferred: verified on one map until a two-map scenario exists.
