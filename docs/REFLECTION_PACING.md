# Bounded reflection pacing

The optional `paced-v1` observer trial admits routine attention in four wall-clock intervals over five minutes (0–75, 75–150, 150–225, 225–300 seconds), with two additional reserve slots for pending locally captured `health` or `casualty` events. These classifications are explicit rules, not a model judgment about urgency. Native reactions do not wait for a slot.

Each interval admits at most one routine reflection. Unused intervals expire rather than accumulate; nothing creates an event or forces a thought. A health/casualty batch uses a reserve first, then an available routine slot if reserves are spent. Admission is checked again against the fresh event batch before advancing its cursor. A denied batch remains pending, and other eligible pawns/native work can proceed.

An admitted appraisal holds a slot because it might escalate. If it continues natively or fails before reflection, the slot is released. A reflection attempt consumes the slot before invoking its backend; rejection, failure or cancellation cannot refund it. Held work cannot start reflection after the overall window ends. An appraisal admitted near an interval boundary may complete in a later interval: this is interval admission, not a minimum spacing guarantee between completed thoughts.

The provider ceilings remain 12 Claude attempts (including proposals), 12 Jev appraisals and 6 reflections. Up to 18 model-dependent attention turns accommodate 12 appraisal turns plus 6 direct reflections, without raising those provider ceilings. Up to 100 native attention turns are separate. At exhausted model limits, observation and eligible native processing still continue within their own bounds.

The pacer uses a process-local monotonic clock. It is not a durable budget: the one-shot trial marker forbids replay/continuation and the separate provider ledgers remain non-rewindable. Cold restore performs no inference and preserves the recorded pacing trace. Production scheduling across sessions remains unimplemented.

## Operator verification

Build with `npm test`, synchronize the reviewed build, create the existing observer fixture through its locked launcher, and run `node scripts/run-observer-game.mjs CONFIG --paced --scripted`. The rehearsal uses 45 seconds with four corresponding intervals. Live runs omit `--scripted` and require the protected native-login/egress host; `--paced --cold` verifies the same trial without inference. Use new ledger and receipt paths for each authorized trial.

The paced trial also uses the current pending-goal reply path: an existing rescue request may receive a fresh standalone offer after ordinary haul completion. The historical observer trial remains unchanged. Therefore this follow-up is not a controlled comparison against the earlier observer trial.

Unit checks cover slot expiry, reserve separation, appraisal release, consumed failures, and admission-before-cursor consumption. Native/live results will be recorded separately; unit checks alone do not prove long-run character quality or better decisions.

## Verified result

The single live run used all six slots: reserve starts at 1.44/17.84 seconds and
routine starts at 23.34/75.84/151.03/225.95 seconds. All six reflections completed,
with nine total Claude attempts and no Jev calls. Five hauls delivered fifty steel;
a requested replacement completed rescue. All 273 sampled states were unpaused.
After the final slot was consumed, native observation continued to the boundary.
The 45-second scripted rehearsal left its first two routine intervals unused.
Both runs passed paired/cold restore, including the recorded pacing trace.
The earlier unit-evidence boundary still applies: no live appraisal release was
exercised in this zero-Jev run. See [sanitized evidence](evidence/reflection-pacing-live.json).
