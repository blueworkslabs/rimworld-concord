# Deliberation timing and interruptions

Continuous play remains the default. `new Coordinator(store, bridge,
{mode: 'pause-at-decision'})` selects an explicit testing mode, not an automatic
judgment that a scene is dramatically important. Pausing and interruption policy
solve different problems; a successful paused test does not prove continuous play.

## Game-owned pause claims

The bridge's optional `setDecisionPause` capability is operator/coordinator-only.
Each claim has a pawn owner, UUID, game epoch and wall-clock lifetime, at most two
minutes. Up to three claims coexist. Releasing one cannot release another owner's
claim, and an old-epoch command is rejected after reload.

The mod adds a small visible `Window` with RimWorld's native `forcePause` flag.
It **never writes `CurTimeSpeed`**. The player-selected speed and any other native
pause source remain independent. A human pause before or during deliberation stays
paused when the final claim disappears; a selected running speed resumes only when
all force-pause sources permit it. The camera remains usable and the notice is
movable. Claims are transient and not saved into a colony checkpoint.

The coordinator releases its claim in `finally` on completion, invalid output,
timeout or interruption. If the transport/coordinator disappears, the game bridge's
Unity `Update` expires the claim using wall time, including while simulation is
paused. A game reload clears old claims. An actual OS/game hang still requires
operator recovery; the expiry mechanism is not an external watchdog.

The pause applies to deliberate inference, not fast appraisal. Native execution
resumes after the result is validated/dispatched and the pause claim is released.
Movement completion is reconciled separately. Continuous mode issues no pause claims.
An operator's explicit checkpoint/save pauses remain separate from these claims.

## Queueing versus invalidation

The first policy refinement is intentionally narrow and evidence-based:

- Native job changes remain routine, and need changes retain their appraisal route.
- A `Chitchat` memory can prompt background reflection, but does **not** cancel a
  current explicit decision or reflection. New experiences stay beyond the current
  attempt's cursor, for the next eligible turn. Repeated Chitchat in one batch is
  coalesced; the bounded original experience/audit records remain intact.
- Background reflection respects the ordinary cooldown (default 300 simulation
  ticks). It does not require another Jev call merely to be eligible.
- Health changes and other, unfamiliar memory types still conservatively supersede
  pending thought. Explicit proposal decisions now perform the same fresh event
  check before applying their result as event-driven reflection.
- Pawn ownership, current proposal/commitment, epoch and native action feasibility
  are still checked. A new valid intention is not a claim of completed movement.

This is not a complete relevance model. Health improvements and some harmless
unknown memories may still interrupt unnecessarily. Nor is urgent native survival
behavior implemented by this change: it remains the game's responsibility. Further
policy work should distinguish contextual invalidation from merely noteworthy news,
using recorded cases rather than relaxing all stale-result checks.

## Repeatable tests and checkpoints

`src/pause-acceptance.ts` is a no-inference real-game test. Run its compiled output
under the exclusive coordinator lock with the normal lab configuration. It checks
stable ticks under overlapping claims, wrong-owner release, human pauses, orphan
expiry and reload, and captures an operator-test screenshot.

`run-claude-game.mjs` accepts `timingMode: "continuous" | "pause-at-decision"` in
its private operator configuration. The driver hashes **all compiled coordinator
modules** locally and remotely before game operations, rejecting partial/stale
builds. Deploy before running; a successful local build alone is insufficient.

The live runner now saves an immutable paired checkpoint after its first completed
explicit decision, before attempting reflection. It atomically records the
checkpoint's database, stage, state and game-save reference in a mode-specific
manifest. Another checkpoint follows completed reflection. Partial results are
written before later checks. Cold mode can verify the latest completed stage with
no inference; an early-stage checkpoint must never be reported as completed
reflection. Old mixed-result receipts remain historical evidence, not overwritten
successes.

The separately authorized `reliability-v1` Claude trial permits **four** native Max
attempts, reserving USD 0.10 API-equivalent usage each, USD 0.40 total. This is not
cash billing. The prior Claude and Jev ledgers are unchanged. The new ledger binds
its policy identifier and limits on disk: reopening cannot silently increase the
allowance or substitute a new trial name. No automatic retries or unattended loop.

See [acceptance](ACCEPTANCE.md) for actual measured paused/continuous outcomes and
cold-restoration results; the existence of a test runner is not proof it passed.
