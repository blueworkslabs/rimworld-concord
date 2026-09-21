# Bounded attention consumption

The operator can now start a finite attention pump which observes native events,
coalesces repeated signals, invokes an injected appraisal/reflection backend, and
applies a pawn-owned response. Scripted fixtures verify mechanics; later finite trials add live appraisal and deliberation. See the dated acceptance evidence for each run’s results. This is not
yet a live AI colony, general planner, or automatically installed background service.

## Processing and authority

`AttentionPump.poll()` reconciles outcomes and ingests new events without waiting
for inference. It starts eligible pawn work up to its concurrent/total-turn limits.
Defaults are two concurrent turns and twelve scheduling attempts per pump instance;
these are operational limits, **not persistent billing quotas**. The operator must
continue polling while it runs. `stop()` cancels and drains its work; `drain()` waits
without cancellation. The pump does not select pauses itself. A coordinator configured for pause-at-decision acquires game-owned claims during deliberate inference; continuous mode remains the default.

Each pawn shares one decision slot between explicit proposal decisions and attention
reflection. Active coordinator commitments defer new attention until their outcomes
are reconciled; native jobs alone do not block reflection. This increment does not
interrupt accepted jobs or implement standing-intention replacement.

- Routine job events are acknowledged without model calls.
- Pending need signals of the same kind are collapsed to the latest value. Every
  interrupting memory/health event is retained in the batch; repeated mundane Chitchat is coalesced. Original captured
  events remain in the audit/experience archive.
- Need-only batches go through the injected appraiser. A reflection score below
  0.5 retains native behavior; a higher score proceeds to reflection. This remains
  an uncalibrated policy threshold, not a correctness probability.
- Memory/health reflection bypasses appraisal. Interrupting events also bypass the default 300-tick cooldown; background Chitchat obeys it.
- A new interrupting event observed during attention cancels that pending result.
  The next turn sees the new event and retained experiences. Fresh game observation
  also happens before applying a response, even if no concurrent poll occurred.

`AttentionBackend.reflect()` gets only its pawn's own state, coalesced events and
at most eight of its pending proposals. The strict response is either
`{kind: "continue", reason}` or `{kind: "proposal", proposalId, decision}` where
`decision` is the existing accept/refuse/counter contract. A proposal outside that
captured view is rejected. A new raw action, actor override or admin operation is
not allowed. Only acceptance dispatches the supported move; counters remain
recorded alternatives, not automatically executed jobs.

New core proposals do not themselves generate native events. Use an explicit pawn
decision or let a subsequent eligible event prompt attention. Self-originated goals,
new actions and full negotiation are later work.

## Durability and failure

A per-character cursor and `running` receipt are persisted **before** calling a
backend. This is at-most-once automatic attempt per captured batch, not guaranteed
completion. Timeout, invalid response, interruption or an interrupted process does
not silently repeat that batch. A later event can prompt fresh reflection using
retained experience. Failed attempts are audited; nothing forces pawn obedience.

The coordinator marks unfinished receipts interrupted on reopen. Paired game saves
include attention cursors and the last sixteen attributed reflections, as well as
existing memories/commitments. Restoring a checkpoint cancels pending work and
rejects late results from its discarded timeline. A restored older checkpoint may
legitimately revisit earlier experiences: any live backend must use an independent
non-rewindable billing ledger, such as `TrialBudget`, rather than these cursors.

Native capture remains bounded (256 events globally, 64 experiences per pawn).
If an unconsumed non-native experience is evicted, `attention-gap` reports it.
The pump does not reconstruct missing history. Routine native execution continues.

The existing blue thinking badge covers the deliberative part of attention as well
as explicit proposal decisions. Appraisal-only work does not display the badge.
Its lease and matching activity/epoch cleanup still apply. The operator activity
list includes the whole reserved decision slot, including appraisal.

## Verification

`npm test` covers coalescing, direct escalation, cooldowns, view isolation, forged
responses, real action-contract dispatch through the fake bridge, stale-result
rejection, deadlines, cancellation, claim recovery, paired restoration, finite
concurrency and explicitly reported retention gaps.

For the actual game, build then run `bash scripts/run-attention-lab.sh` with
`RIMWORLD_LAB_ROOT` set. It acquires the exclusive coordinator lock and loads the
disposable `lab-initial` fixture. Native events must trigger scripted appraisal and
reflection; acceptance must complete a native movement job and refusal must create
none. It also checks live ticking, reopen and paired restore, writing private
receipts in `.runtime/`. After stopping/restarting the game, run the same script
with `--cold` to verify persistence in a fresh process. Stop the lab at handoff.

A subsequent [bounded live-appraisal trial](LIVE_APPRAISAL.md) used two real Jev
calls on captured food and mood events. Both selected native continuation. Four
other, directly escalated reflections used a scripted backend. The first [live deliberation trial](LIVE_DELIBERATION.md) completed an explicit proposal decision. Its event-triggered reflection was cancelled by a newer Chitchat memory; no model answer or second action was applied. Completed live reflection was unverified at that point. A later reliability trial completed it in paused and continuous modes with cold restore; model judgment quality, long-running operation and unattended billing remain unverified. That trial exposed a routing limitation: every acquired memory was treated as interrupting. The subsequent [timing policy](DECISION_TIMING.md) distinguishes known mundane Chitchat from conservative interrupting cases; historical receipts are unchanged.
