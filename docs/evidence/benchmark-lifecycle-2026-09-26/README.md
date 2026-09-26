# Controller proof and lifecycle rehearsals — 2026-09-26

PR #96 remains **draft**. Independent source review covers the corrected behavior through
`cf43ac9`; **479 tests pass**. [Machine-readable evidence](summary.json) retains both the
initial failure and corrected checks. These are **zero-model scripted rehearsals**, not the
real-controller rehearsal pair requested for the benchmark, and not scored trials.

## Controller proof

The [local-recorder proof](controller-proof.json) passed on the existing native-auth host
with installed **Codex 0.153.4, requested `gpt-6-astra`, medium reasoning**. Both arms expose
only their five declared `mcp__arm` tools plus the same three inert MCP-resource readers.
Instructions, context, requested model and reasoning match. Context hashes include roles
and types, excluding only random message IDs. An initial over-strict hash failed on those
random IDs; its private receipt and request bodies are retained. No model request reached
an inference service. This does not establish a provider-resolved model revision.

The installed binary actually launched both arm servers in their own process groups. That
confirmed the source-review finding: killing only the controller group was insufficient.
The corrected runner registers PID/group/start time, stops the arm before the controller,
rejects late startup, then performs game cleanup. A detached in-flight child shutdown
regression passed. The proof helper handles spawn errors, interruption and a bounded exit
without waiting indefinitely on descendant-held pipes.

## Recorded game checks

- **Initial harness attempt — failed, retained.** The explicit MCP environment omitted
  user service-bus paths. Native construction/cooking completed, but pause and finish
  failed. The checker finding is not promoted to a passing run. The scripted stand-in
  also incorrectly continued after the pause error; it now stops on tool failures except
  deliberate placement probes. Recording: **28.067 seconds**.
- **Corrected harness — passed as scripted lifecycle/T1 evidence.** The new campfire's
  same simple-meal bill was observed at **3 while paused**, then **0**, with **3 native
  MealsCooked records**, no intervening bill edits and no other cooking bills. Normal
  controller exit, zero errors/unresolved calls. **13 inputs (including 3 controls),
  10 observations; 29.267-second recording.** All decisions were fixed script, not a model.
- **UI — passed as lifecycle/control evidence, T1 deliberately not attempted.** Five PNG
  screenshot replies, one selection click and four speed/pause controls succeeded. Hidden
  snapshots confirm **Normal → Fast → Superfast → Paused**. Replies contain images only,
  not hidden checker state. Normal exit and zero errors/unresolved calls. Recording:
  **10.867 seconds**. Text entry and a complete T1 via this wrapper remain unexercised.

Recordings, exact replies, hidden snapshots and original failure logs remain privately
retained with hashes in the summary. Recorded durations include runner capture padding;
scripted wall times/counts must not be compared with the earlier model-driven UI calibration.
The runner still emits `verifiedCompletion: false` pending external audit; the separate
summary audit qualifies the corrected **scripted** task, never a scored result. Zero model
usage in the stand-in is authored metadata, not a billing measurement.

## Remaining deployment boundary

The game host initially had no Codex CLI. A copy of the pinned binary was installed in the
isolated trial directory solely for real `--version` and bundled-catalog reads during the
scripted rehearsals; **no credentials were copied or billing route changed**. Native
controller authentication remains on its existing host. The runner assumes local game
files and X11 display as well as local Codex. Connecting those two hosts through a trusted,
reviewable transport is the next implementation step before the real-controller pair.
The cross-host controller/MCP/recording/lock/stop lifecycle has **not** been verified.

Staging game and display stopped; previous mod restored; **all 440 pre-existing saves
unchanged, no new saves**. All three recorded arm processes stopped and all local recording
copies match the runner hashes. #89 stays held. The earlier 53 rejected cell probes were
**post-task zone API checks**, not campfire-placement attempts; a placement-query follow-up
must not be justified by mislabelling that evidence.
