# Native-haul live setup — signed freeze, 2026-09-24

**Fable signed this setup at `fc06842` on 2026-09-24 at 18:37 UTC; [Gate C later approved game-side migration](NATIVE_HAUL_GATE_C.md), with next-live blockers.** The approved change is a
**75-unit helper-layout live fixture instead of the original 30-unit main fixture**.
The strict source-stack hold and zero-escape measure are unchanged. No pawn positions,
needs, backstories, work priorities or scheduler cooldowns were altered to produce offers.

## Setup fingerprint

SHA-256: `d413cfd7fc569ade9c6c6439bd98c3153aed4770ccd3e345d6588cac7862ac2b`

The [complete setup inputs](../evidence/native-haul-live-setup.json) specify the
canonical JSON encoding and bind the reviewed behavior revision, matching host/staging
runner digest, host launcher/native helper/catalog/config, installed game/mod binaries,
mod/control config, lab bridge, unchanged save, model and protocol parameters. Private
operator configs, saves, databases, recordings and raw reviews remain outside Git.
Recompute these inputs before launching; a changed input requires a new freeze.

**Gate B stop rule:** stop and diagnose offline if unsupported capability or consent could reach execution, or repeated invalid output or non-progress stalls the run; quiet waiting, refusals and an unmet quota are valid outcomes, not stop conditions.

This sign-off and stop-rule addition are documentation-only and do not change the setup hash. No rerolls; failures are retained. Fable writes the four-sentence test from the recording before reading the technical report. Expiry within the observation window is valid. Credit ends at quota retirement; subsequent native hauling is ordinary stockpile work, not agreement credit.

- Attribution-only, quota **75**, six 20-wood stacks (120 available), candidate area
  x76/z84/w4/h4, expiry 30,000 game ticks from acceptance.
- **Two capable pawns: Pedro and Beatrice. Alvin is natively ineligible by his Rancher
  backstory and visibly not offered.** No capability override.
- Neutral brief, shared haul as the only proposable work; Luna `gpt-5.6-luna`, low
  reasoning, core and pawns, native subscription route. No Jev, no turn cap.
- Ten minutes continuous wall-clock observation, #64 recording, no inference pause,
  existing 300-tick core cooldown. Native quiet-period wake threshold: 2,500 ticks.
- Only first delivery, terminal intent status and delivery-separated stalls create
  native-intent wake keys; ordinary agreement/status events retain their existing rules.
- Core choices and pawn answers remain free. Actual offers to both eligible pawns are
  checked for protocol coverage, not forced. Missing coverage is retained as a negative
  observation, not repaired by model rerolls. Neither live acceptance nor quota success
  is guaranteed by the rehearsal.
- **Post-run cold restore uses new host and coordinator OS processes.** The game
  process stays running and reloads the paired save. Actual game consent/ledger/lifecycle
  must match the checkpoint, not merely a database-derived copy.

## Review and rehearsal evidence

[Sanitized receipts](../evidence/native-haul-live-rehearsal.json) preserve all three
rehearsals. Review corrected a database-to-database cold check, vacuous offer/capability
checks, fabricated withdrawals after an uncertain operator stop, and replacement of a
failed restore's checkpoint reference. Operator stop is now confirmed; native intentions
never fall through to the legacy pawn-withdrawal cleanup path. Invariants are checked
while running. Independent focused re-reviews completed; 379 tests pass.

The first **30-unit main** rehearsal failed: only Beatrice was offered before completion.
A second **75-unit helper** rehearsal also failed. Initially suspected to be solely
fixture timing, the latter exposed the missing integration: the standalone native wake
helper had never been connected to the ongoing scheduler. Both failures remain intact.
The corrected scheduler exposes explicit aggregate receipts (including helper credit),
first-delivery/lifecycle wakes and durable one-per-quiet-period stall wakes; no per-trip
wake was introduced. The counter schema now also includes the native haul action with
explicit variant typing.

Corrected run `1ed4e354-aeea-4277-93a0-8299449aedcc` on `9e9486a`:

- 45.774 seconds continuous scripted observation; all 26 samples unpaused.
- First-delivery wake at tick 554 exposed Pedro's still-eligible offer. Both pawns were
  offered and accepted; **75/75, Pedro 60 and Beatrice 15**, zero quota escapes.
- Five authored core choices, zero character-model calls. These are not Luna responses.
- Paired restore passed; cold host PID 239096 differs from 238888, and cold coordinator
  PID 151908 differs from 151623. The restored **game** ledger matched the terminal
  75-unit checkpoint. This is not an open-load cold-restore observation.
- Recording verified: 1280x800, 15 fps, 733 decoded frames, 48.867 seconds including
  recording lead/trail. Initial/final observer frames inspected: Alvin's not-offered
  line and final per-pawn credit are legible.

The rehearsal above remains a 45-second authored test, not model evidence. After Fable signed the setup, the [single ten-minute live recording](NATIVE_HAUL_LIVE.md) completed unchanged. Game/display are stopped; all 285 original saves are unchanged. Prior failures and known fixture/audio warnings remain retained. Fable’s subsequent [Gate C decision](NATIVE_HAUL_GATE_C.md) approves game-side migration with next-live blockers.
