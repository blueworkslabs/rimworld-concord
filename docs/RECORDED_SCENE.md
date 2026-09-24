# First continuous recorded Luna scene

Protocol: `luna-recorded-scene-v1`. Frozen before inference; one run, no rerolls.
This is an integrated observation, not a controlled comparison with the older prompt.

## Setup

- Existing campfire-v2 fixture: three unchanged characters, 225 raw berries with
  corrected health, no ready meals, no prebuilt campfire. Ordinary work priorities
  disabled; native self-care continues. This is an authored test colony, not a campaign.
- Existing neutral core brief: consider shared needs and local supplies; questions,
  optional work and waiting all valid. Raw eating is a legitimate alternative to cooking.
- Native Codex Luna for core, pawn replies, proposal decisions and reflection. No Jev,
  Terra, Sol or automatic routing. Character tools remain absent; game receipts and
  fresh-state validation determine what executes.
- Current source-separated prompt and diagnostic checks from PR63. No changes to
  diets, portion admission, observation range, personality or consent.

## Timing and recording

- Ten minutes of wall-clock observation at normal native simulation speed, not ten
  in-game minutes. No inference pauses or turn-count cap. Existing event-driven
  admission, 300-tick cooldown and repeated-failure stops remain. Quiet is valid.
- A 16-minute whole-run deadline leaves room for setup, drain and checkpoint checks.
  Pending thoughts are cancelled at observation end; operator shutdown is not refusal.
- 1280×800, 15 fps, silent H.264 MP4, compact observer panel and visible live label.
  Capture begins while paused just before simulation starts and ends just after it
  pauses. Keep the whole clip; startup/end padding remains labelled by the frozen protocol.
- Abort on recorder failure or premature exit; retain partial media and receipts.
  At least 512 MiB free; file ceiling 256 MiB. Recorder cleanup is bounded and awaited.
- Retain wall-clock sample times, native start, recorder start and frame metadata.
  Video offsets from process spawn are approximate, not frame-exact synchronization.

## Assessment decided in advance

1. Record every attempted/returned/applied decision, validation rejection, native
   outcome and pending action cancelled at the deadline. Never count spoken intent as work.
2. Check claims about current needs, replies, capabilities and completion against the
   exact supplied perspective and receipts. Preserve errors; schema validity is separate.
3. Measure sampled simulation speed, pauses, latency, token usage, repetition and
   quiet periods. Capture overhead has only the earlier small pilot as a baseline.
4. Check legibility from the actual uncut recording. Optional timestamped human notes;
   no compulsory retelling. No success quota for meals, disagreement or chatter.
5. Save/restore and cold restart without more inference; verify outcomes, topic state
   and non-rewindable usage. Stop staging and copy media off afterward.

A scripted 45-second recorded rehearsal uses the same capture/cleanup path but no
model calls. Its actions are not part of the live scene. Historical three-minute
operation remains `luna-ongoing-v1`.

Run using `node scripts/run-ongoing.mjs /absolute/operator-config.json --recorded`
(add `--scripted` for the rehearsal, or `--cold` after full restart). The existing
locked launcher is mandatory. Each game/cold receipt is exclusive to the run ID.
All private model perspectives and raw operator diagnostics stay off the public video
and out of published evidence; publish public speech/core input and actual outcomes.
