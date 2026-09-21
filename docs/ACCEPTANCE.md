# Foundation acceptance — 2026-09-21

## Environment and scope

Real RimWorld 1.6.4871 with Biotech and Odyssey on the existing shared Linux staging VM, Intel-accelerated virtual graphics, isolated lab profile. Three-pawn 150×150 fixture. All decisions below are scripted; no live model or paid inference was invoked.

The game bridge compiles against the installed game's actual assemblies using Mono. TypeScript coordinator runs on Node 22.23.2 with SQLite.

## Results

- 21 local automated checks pass: actor binding, acceptance/refusal/counterproposal, strict response scope, narrow perspective, interruption outcomes, lost-response reconciliation, bounded timeout, timeline restore/cancellation, duplicate saves, active-checkpoint refusal, reopen, corrupted checkpoint rejection and routing policy.
- Real game: refusal produces no job; a forged core actor is rejected by the game bridge.
- Real game: accepted Goto job moves Alvin (`Thing_Human405`) from (82,80) to (90,80), with `completed` receipt and observed destination.
- Identical action replay does not grow the execution ledger; changed payload with the same ID is rejected.
- Native ticks advance during a 4.5-second delayed decision, while `activity()` reports deliberating. The blue ellipsis badge above Beatrice was visually verified in a real-game screenshot.
- A timed-out backend leaves its proposal pending, without imposing a new pawn job.
- An out-of-map destination yields `failed` and releases the commitment.
- Paired checkpoint restore removes future memories/proposals, cancels in-flight decisions, rejects old epochs and leaves the game paused.
- Fresh game/coordinator process restore is checked separately for pawn identities, character memories, a fresh epoch and paused state.

Raw compact receipts are under [evidence](evidence/). Local generated SQLite databases, paired game saves and the screenshot remain private runtime artifacts, outside Git. The original lab baseline's approximately 60 TPS measurement is not a new performance benchmark for a full agent colony.

## Boundaries

Native interruption and lost-response behavior are covered with controlled coordinator tests; no combat, injury or network fault was deliberately induced in the real-game trial. Core authority is enforced by the model-facing handles and trusted dispatch; this is not protection against arbitrary hostile code running as the lab OS user. The bridge actor field is supplied by the trusted coordinator, never by model output.

No live inference, whole-map perception filter, narrative quality, gravship travel, structure planning, full colony economy or OpenClaw plugin is claimed. The Jev adapter uses mocked responses in tests; an authenticated transport and live evaluation remain unverified. Checkpoints are quiescent only. A supported production daemon/installer, unattended quotas, long-run retention and upgrade migrations remain future work.

## Public baseline configuration check

The real-game and cold-restore receipts were regenerated after replacing deployment-specific paths and host checks with explicit environment/profile configuration. Both C# mods were rebuilt against the owned local game assemblies. No live inference or private account configuration is included.

## Pawn-awareness increment

- Native self facts populate the perspective; selected native job changes are captured and routed into the owning pawn's experiences.
- Per-pawn privacy, deduplication, ring-gap reporting, saved cursor rollback and stale appraisal rejection have automated coverage.
- Thinking badges have bounded lifetimes, identity/epoch-scoped cleanup and continue-live simulation; the real-game screenshot was visually inspected.
- Real-game paired restore and a full process restart preserve the new character experience records as well as existing memories.
- Jev question/response validation and the independent conservative trial ledger have mocked tests for invalid answers, cancellation, uncertain charges, reopen and pricing overrun. No paid call has been made.
- Native memory acquisition, health changes and badge expiry after a process crash are implemented but not deliberately induced in this real-game trial. See [awareness limits](AWARENESS.md).
