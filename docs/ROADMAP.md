# Roadmap

Forward-looking only; past results are in [HISTORY](HISTORY.md) and the
[trial ledger](trials/README.md). Last updated 2026-09-23.

## Now

Implementation is paused for a team recap. The goal for the next milestone is the
**ten-minute watchable scene** described in [VISION](VISION.md#what-watching-should-feel-like):
sustained, understandable coordination rather than another single action.

Proposals on the table (not yet decided):

- **A fixture where cooking matters.** In the current fixture raw berries are plentiful,
  so eating them is a perfectly good answer and nobody needs a plan. Scarce berries plus
  raw food that pawns avoid eating raw would give the core something to coordinate,
  with existing capabilities only.
- **Frozen before running.** Fix the fixture and the core's turn allowance before the
  first live run; measure outcomes across several runs instead of requiring a
  particular story in each.
- **A better way to judge legibility.** Screenshot reads are retired; a recorded scene
  (watched by a person or summarized by a video-capable model) needs a protocol first.

## Known gaps

- The live core has not yet proposed construction or cooking; no live work has
  followed self-care.
- After-meal resumption of deferred work is not automatic.
- Explanations still blur units and sources at times; prose grounding is unscored in
  production.
- The crew log doesn't explain why coordination stopped.
- Two early provider errors (before the formatting recovery) remain unexplained.
- Correcting or retracting retained speech is untested.
- Useful live-core planning has only run with the game paused during model calls; the one unpaused live-core run had all core outputs rejected.

## Deferred

- Pawn-to-pawn offers (a pawn proposing work to another, with the recipient's consent).
- Human contact: suggestions to the core, letters, comms-station conversations.
- Luna or other cheaper models as live game backends.
- More actions: general construction, treatment, defence, work priorities.
- Long unpaused sessions with a live core; unattended operation (only after its own
  scope and spending decision).
- The gravship campaign and an installer for players.
- An OpenClaw operator plugin.

## Maintenance policy

- Trial budgets stay centralized in `src/decision-trials.ts`; historical policy names
  are never reused.
- New evaluation code goes in `trials/`; older runners in `src/` move only when touched
  for another reason.
- Every trial gets a ledger row and sanitized evidence; contracts change in the topic
  documents, not in trial write-ups.
