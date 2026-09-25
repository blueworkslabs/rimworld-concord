# Attention evictions (post-Gate-C item 7) — diagnosis

Source: the [pipeline rerun](HAULING_MIGRATION_PIPELINE_RERUN.md) (run `25bcdc7e`), which
reported **17 unprocessed-event evictions**: memory 1, rest 6, mood 2, food 5,
intent-ordinary 3. Method: the audit store only (`native-event` with its recorded route,
and attention cursor moves), replayed by
[`scripts/attention-eviction-replay.py`](../../scripts/attention-eviction-replay.py).
The replay reproduces the run's 17 exactly. Cursor movement is taken as recorded, so this
answers "what would the buffer have lost", not "what would the pawns have thought". No
game or model was run; staging files were copied read-only.

## What filled the buffer

Each pawn keeps its last 64 experiences. In this run:

| Pawn | Experiences | Native | Appraisal | Deliberation |
|---|---|---|---|---|
| 405 | 582 | 563 (96.7%) | 14 | 5 |
| 408 | 589 | 569 (96.6%) | 11 | 9 |
| 411 | 557 | 538 (96.6%) | 13 | 6 |

Native job churn (`job-start`, `job-end`, `job`: about 550 per pawn) turns the buffer
over roughly every 3,000–4,000 ticks. Every lost experience was evicted 2,900–4,100 ticks
after it arrived, because the oldest entry was always the one removed, whatever it was.

## Why they were still unconsidered

- **16 of 17 were appraisal-routed** (rest, food, mood need bands and `intent-ordinary`).
  The ongoing runner has **no appraiser** (`attend(…, undefined)`,
  `attentionCandidates(…, false)`), so a backlog of only appraisal items never makes the
  pawn a candidate. Such items are considered only when a significant (deliberation) event
  starts a reflection that happens to cover them. Pawn 405's cursor stayed at seq 551 from
  t10,556 to t26,694 while up to five need changes waited; no pawn reflected at all
  between t11,520 and t29,601.
- **3 of 17 were `intent-ordinary`**, which is missing from `NATIVE_KINDS` and so fell to
  the default appraisal route. By the documented rule, native-intent hooks are texture and
  receipts, never a per-event wake. The archive line already reports ordinary arrivals.
- **1 of 17** (pawn 405's quiet Chitchat memory, seq 148) was deliberation-routed but lost
  to lane contention. With one inference lane alternating between the core and three pawns,
  405 (which had just reflected, started at t2064) lost the tie-break to 408 and 411 and to core
  turns, and the memory was evicted at t5591 before 405's next turn.

## Fixes in this PR (separate commits)

1. `intent-ordinary` routes native (and is listed in the
   [routing table](../RIMWORLD_INTERNALS.md#routing-for-new-event-kinds)).
2. On overflow, the buffer evicts the oldest native or already-considered experience
   first. An unconsidered one is only evicted, and counted as a gap, when nothing else is
   left.

| Replay | Lost | Max unconsidered waiting per pawn |
|---|---|---|
| As run | 17 | 4 |
| `intent-ordinary` native | 14 | 4 |
| Both fixes | **0** | 5 |

## What this does not fix

Retained is not considered. Without an appraiser, a pawn whose backlog is only need-band
changes still waits for a significant event before anyone looks at them; the fix only stops
them being silently destroyed in the meantime. Whether the live runner should run an
appraiser, or whether Food/Rest band changes should be native texture for pawns (the core
already reads bands from shared status), is a design choice for Fable, not part of this
fix. The Chitchat case is lane scheduling, not buffering.
