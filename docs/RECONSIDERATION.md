# A commitment reconsidered

## Perception and agency

The native mod exposes a pawn-owned `casualties` observation: epoch, tick, map,
12-cell square radius, and up to eight visible free colony mates considered by
the scan. A downed living colonist not already in bed (excluding inherently
immobile life stages) contributes identity, name and position. Fog and line of
sight are checked. This is not a diagnosis, urgency estimate or access to the
patient's thoughts. Perception is independent of rescue job availability.

First sighting emits a pawn-addressed `casualty` event with the observed subject
ID. It routes directly to deliberation, superseding an older thought. Native
reactions do not wait for inference. The observer/subject notice survives game
saves: leaving sight does not erase it or repeatedly trigger the same alert.
Locally observing that subject no longer needing this help rearms detection.
An unseen recovery and relapse is not inferred. As with existing event capture,
observation currently runs on the selected map. Broader retention and multi-map
perception policies remain future work.

The pawn may continue or withdraw its own hauling/rescue intention. Withdrawal
alone does not authorize a replacement action. In this experiment the scripted
core can offer rescue only after a successfully applied withdrawal has settled,
with neither an active intention nor executable commitment remaining. A fresh
rescue observation and fresh consent are required. Failure, expiry, initial
refusal and operator shutdown are not pawn-chosen switches.

## Attention bounds

`AttentionPump` retains the original `maxTurns` mode for existing experiments.
Alternatively supply `maxNativeTurns` and `maxModelTurns` (each 0–100, at least
one positive), plus concurrency and optional pawn selection. A model-dependent
claim counts against the model bound even when appraisal selects native work.
Native continuations use their own bound. A fresh-state route guard prevents a
new significant event from upgrading an already selected native-only claim.
Provider calls retain their independent durable ledgers; turn bounds are not
billing limits. Counts include failed/unavailable claims conservatively.

## Fixed focused experiment

- One actor and one anesthetized colony mate in a disposable authored save.
  Steel, storage and bed geometry place the patient outside initial local view,
  but along the actor's hauling route. This is **discovery of an existing
  casualty**, not a newly inflicted injury or spontaneous emergency.
- No authored personality or relationship overrides. Existing self-facts apply.
- Initial optional three-trip hauling negotiation while paused. At most one
  exact hauling counter revision; unsupported alternatives retained, not used.
- Continuous play afterward, at most 120 seconds, with early completion only
  once the branch settles and at least 15 seconds have elapsed.
- Attention queues until the actual local sighting. One model-dependent
  attention claim, up to 96 native claims, one actor/concurrent thought. This
  deliberately focuses on the stimulus and is **not** general autonomous
  attention scheduling or a comparison against the prior 48-turn trial.
- At most one reflection; direct casualty escalation normally bypasses Jev.
- Only settled pawn-chosen withdrawal permits the optional rescue offer.
  At most one exact rescue counter revision for the same patient. Every
  acceptance, refusal, counter, cancellation and failure remains in evidence.
- Fresh immutable ceilings: six Claude Max attempts, 0.60 USD reserved
  API-equivalent usage (not subscription cash charges); at most four Jev
  appraisals, 0.008 USD reserved. Unused allowance remains unused. No rerolls.
- Completed hauling trips/steel and rescued patients count separately. Record
  discovery, intention/job at reflection, raw response, actual outcomes, timing,
  paused samples, limits and any operator stop. An active agreement is not
  necessarily an active native trip by the time a slow answer returns.
- Host draining and game cancellation precede quiescent paired saves. Cold
  restore uses no inference; initial fixture and historical ledgers stay intact.

## Operator entry points

After building and deploying the mod while stopped, prepare the disposable copy
using `RIMWORLD_LAB_ROOT=/absolute/lab bash scripts/run-reconsider-lab.sh fixture`.
The launcher owns the exclusive coordinator lock for its entire lifetime and
sets an operator-use marker; direct TS entry points reject invocation before
transport. The marker is not a sandbox against a local shell user.

`node scripts/run-reconsider-game.mjs /private/config.json --scripted` runs a
zero-inference rehearsal. Config includes absolute `labRoot`, `remoteRepo`,
`ledger`, `jevLedger`, `scratchRoot`, `receipt` and a validated `sshTarget`.
Scripted-only `scriptedReflection` selects `continue` or `withdraw`. Omit
`--scripted` only for the separately authorized live run on the native-login,
protected-egress host. Use `--cold` with the same config/mode after a full game
restart. The host verifies remote build parity and records a one-use start
marker; provider ledgers must be fresh for a new run.

This finite descriptive trial does not establish personality, relationship
causation, sustained planning, treatment or a live strategic core.
