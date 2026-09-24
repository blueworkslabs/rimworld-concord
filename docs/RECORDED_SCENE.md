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
model calls. Its scripted eat choice selects the nearest listed stack (still subject
to all execution checks). Its actions are not part of the live scene. Historical three-minute
operation remains `luna-ongoing-v1`.

Run using `node scripts/run-ongoing.mjs /absolute/operator-config.json --recorded`
(add `--scripted` for the rehearsal, or `--cold` after full restart). The existing
locked launcher is mandatory. Each game/cold receipt is exclusive to the run ID.
All private model perspectives and raw operator diagnostics stay off the public video
and out of published evidence; publish public speech/core input and actual outcomes.

## Video review

After capture, use the existing two-pass Gemini 3.8 Flash method: video only, then
unchanged first answer plus sanitized public receipts. No expected events in pass one.
If the original exceeds the helper's 10 MB input bound, use a full-duration 5 fps,
1280×800 H.264 review copy at CRF 24; preserve both hashes and label the derivative.
It is not a highlights edit. This can miss brief text and does not establish the
readability of every frame in the 15 fps original. If that copy still exceeds the
bound, defer automated review rather than trim events or relax the transport guard.
No model rerolls; failures and unverifiable claims stay in the report. The original
uncut clip remains the human feedback artifact.

## Result

[Watch the uncut 15 fps recording](https://rimworld-concord.pages.dev/watch/luna-continuous/).
It is silent, 10:04 including paused setup/end padding, 13.9 MB. Browser video controls
allow scrubbing after the player loads the complete original. The static host ignored range requests in delivery checks, so the watch page buffers the unchanged file once. The original MP4 remains downloadable; no edited highlights or required viewer questionnaire.

**Actual outcomes:** Alvin chose and consumed 12 berries, Pedro 11, then Alvin another
16: **39 food items** across three actions. Six topics linked to the first two meals
resolved; the broad brief stayed open. Beatrice's returned eating choice was rejected
before dispatch (`option-not-current`); the exact native reason it left the shortlist
is not known. Native samples separately show Beatrice ingesting around 06:51–07:04 and
Food recovery by about 07:06. Those samples do not establish an exact amount or source,
and this was not a newly accepted model-directed action.

There were **15 core + 18 pawn attempts**: 13 applied core turns, one failed core answer,
one deadline-cancelled core thought; nine returned replies and nine continued-native
reflections. Eight replies were delivered; Beatrice's rejected eating reply was not.
No work offer, campfire or cooking job followed. Asking Pedro about building was speech,
not an offer or consent. No operator rerolls; a new event can still wake a later turn.

The failed core answer proposed adding more topics than the eight-active-topic capacity.
Offline validation of the original answer against its original view reproduces
`Core topic limit`. This is a context/interface limitation, not a transport outage;
it is retained and not repaired by this PR. Two follow-up communication topics stayed
open even though Pedro's earlier meal was confirmed, illustrating lingering bookkeeping.

**Grounding remains mixed.** Current need-band descriptions in checked core turns match
the supplied telemetry, and the core distinguishes earlier testimony from later status.
But some topic sentences cut off mid-clause, one contains an unexpected multilingual
fragment, and later text calls Beatrice's present need uncertain despite fresh satisfied
telemetry. Alvin's “safe to eat” wording is stronger than an eligibility guarantee.
This single run is not a causal before/after test of source separation.

The practical scene has long quiet/wandering intervals and changing local food access.
Characters can say food is unavailable locally while other sightings report it; that
is not automatically a contradiction or proof that the map has no food. Native food
selection is independent of the explicit pawn-owned eating interface. No new search,
travel or memory-of-supplies capability was added for the scene.

**Verification:** all 456 sampled states unpaused, about 59.6 ticks/second; recording
reported zero dropped/duplicated frames. Paired/cold restore preserved outcomes and
core state with no new calls; native subscription usage remained unchanged. Known
character usage 211,649 tokens, with cancelled usage unknown—not an API cash estimate.
356 coordinator checks, six transport checks and independent review passed; 151 historical
database files and 83 evidence files unchanged. Staging stopped.

The first scripted capture rehearsal recorded a valid range rejection but failed its
meal-completion assertion; it is preserved. The nearest-option rehearsal completed a
12-berry meal, recording and paired/cold restore with zero model calls. Neither is
part of the live video.

[Full public evidence](evidence/recorded-scene.json). Public core inputs and original
core answers include the failed answer; private pawn inputs/reflection prose are excluded.

### Video-review result

Gemini's video-only pass recovered all three meal quantities, the later food-access
problem and long quiet intervals. It also invented a combined quotation, confused
some ticks and called a yellow map object a search/survey overlay. The receipt pass
corrected some transcription errors but misleadingly headed Beatrice's sequence
“query and refusal,” despite her stale eat choice being rejected by the coordinator.
Neither pass is an authoritative transcript.

The full-duration 5 fps copy was 8.0 MB; original 15 fps video remains unchanged. Calls took
25.1 and 49.4 seconds, with about US$0.073 reported total cost. Both original answers
and author adjudication are [preserved](evidence/recorded-scene-video-review.json).
No UI or gameplay change was made from their suggestions.
