# Hauling migration — live recording, 2026-09-25

**The single signed run and Fable's recording-only cold read are complete. Technical
findings are released below; Fable's Gate C verdict is pending.** No rerolls or
runtime changes were made. This is not a clean live-migration acceptance result.

[Download/watch the uncut original MP4](../../diary/assets/recordings/hauling-migration-live-2026-09-25.mp4)
· [Recording and preservation evidence](../evidence/hauling-migration-live-recording.json)
· [Signed freeze](HAULING_MIGRATION_LIVE_FREEZE.md)

The original is **10:04.467**, including recording lead/trail; 14,228,095 bytes,
1280×800 at 15 fps, silent, 9,067 decoded frames. The capture log reports
**zero dropped frames and one duplicated frame**. SHA-256:
`b2c281ab7ecff69afb98546d341ca42f0daa3eb3cfd54292d060e4c8523b1368`. The local copy matches the retained remote original.
Continuous observation lasted **601.262 seconds**; all 372 sampled game
states were unpaused.

Paired restore and cold restore in **new host and coordinator OS processes** passed
against the retained checkpoint and actual game ledger. The game process stayed up
and reloaded the paired save. Cold restore made no additional inference calls;
project accounting was unchanged. Staging is stopped after a new handoff save;
all **407 pre-existing saves** are unchanged. The signed executable fingerprint
still matches after the run.

All exact input snapshots, returned choices, failures, cancellation records, game
receipts, databases and checkpoints are retained privately. No automated video review
was requested ahead of Fable. The original recording and preservation metadata remain
unchanged by this audit.

**Read order:** uncut recording → Fable's four-sentence read → technical findings →
Gate C verdict → deletion PR. Unexercised branches remain explicitly unexercised,
not passed. Growing remains
parked at B1 2/2. No legacy deletion or completion-report-to-receipt linking has begun.

## Technical findings — released after the recording-only read

Fable's [original read](https://discord.com/channels/1083662512806965308/1467116597645676546/1552966444105342987)
and [continuation](https://discord.com/channels/1083662512806965308/1467116597645676546/1552966446730969126)
remain as posted. Her sampled-recording tally and the complete receipt tally below
are different evidence, not a retroactive correction to her four sentences.
[Sanitized audit evidence](../evidence/hauling-migration-live-findings.json) binds
the retained inputs, outputs, publication records and offline checks by hash.
No private pawn perspectives or reflections are exported, and no new inference ran.

### Why no offers appeared

**The model did try to propose work three times. All three returned proposals were
rejected before publication.** The core had native-haul opportunities in **19/19**
input snapshots, and construction in **15/19**. Asking was not its only legal action.

| Zero-based turn / input tick | Returned action | Rejection on the exact saved input |
| --- | --- | --- |
| 5 / t8044 | Offer Beatrice the shared wood haul | `Offer requires nonclosed action topic`: the action linked to an opportunity ID that was neither an existing topic nor created by its topic updates |
| 11 / t22503 | Offer Pedro the shared wood haul | `Core topic limit`: eight active topics would become nine |
| 17 / t34013 | Offer Alvin construction | `Core topic limit`: eight active topics would become ten |

Each selected opportunity **was present in that exact input**. The failures concern
the combined topic/action contract, not a missing work menu. Offline revalidation of
the original bytes reproduces each error; it neither applies a repaired choice nor
proves that a later offer would be accepted or complete.

Two other returned choices also exceeded the topic limit: turn 13's wait (nine active)
and turn 15's question (eleven). The final turn, 18, was interrupted at the observation
deadline without a returned choice. Overall: **19 attempts; 13 applied (11 asks, two
waits); five invalid outputs; one deadline cancellation**. The receipt flags
`passed`/`inferencePassed` mean the harness completed and at least one core turn
applied, not that every inference or Gate C condition passed.

The topic-closure problem is now consequential. At t22503, three of the eight active
topics describe already-receipted eating follow-ups (Pedro's follow-up question and
answer, Alvin's follow-up answer), yet their `topicClosures` permit no closure. This
is the completion-report-to-receipt linking gap already queued after the run. It
contributes to saturation; it does **not** make every valid offer impossible, since
offers can use existing topics or a null action link without adding another topic.

### What the questions and answers meant

- **Beatrice's “no hauling target” has a projection explanation.** Her two answer
  snapshots (t2170 and t19226) have empty ordinary hauling options and supplies;
  the proposed shared-zone candidate was in the core's menu, not a delivered offer
  in her answer view. An `ask` supplies speech/eating choices, not work consent.
  No offer opened the candidate intent, so there was no tagged pile counter to show.
  Her answer is not a refusal of a received haul offer. The work question sounded
  like an offer while crossing neither the offer nor consent boundary.
- **The core also confused the distinction.** Applied topic prose after her second
  reply says she “was offered” work and later calls the offer deferred. The typed
  proposal ledger is empty, and Beatrice's haul opportunity remains available.
  This is a planner interpretation error, not actual refusal/deferral enforced by code.
- **Alvin did generate the first missing reply.** He chose bounded eating. Between
  its t741 snapshot and t1074 validation, the required portion increased **12 → 13**;
  `Eating revalidation: portion-increased` rejected it before the reply was published
  or a self-care job began. Raw output is retained. This is not unanswered model silence
  and is not the late-haul-answer branch.
- **Beatrice's plea was received, not lost.** The t19523 answer is present in the next
  t19634 core input. Its returned wait explicitly acknowledges the food request and
  lack of a listed food action. Wait is silent, so no acknowledgment reaches the
  journal. It is a request in ordinary speech, but **zero typed requests** were created;
  this answer route cannot turn prose into a job or an automatic conversation turn.
- The full ledger has **11 questions and ten published answers**, versus the cold
  read's sampled eight/eight. Three pawn-chosen eating actions completed: Pedro 11
  berries, Alvin 16 and 11. Beatrice's separate **native** ingestion consumed 18 at
  **t25279**, without a coordinator self-care action. Her visible start of eating and
  the later consumption receipt are different moments.

### #71 live checks and observer gaps

1. **Receipt-age prefixes: live pass within the frozen scope.** Independently join
   the four native ingestion receipts to exact input ticks and publication ticks.
   Across **32** published questions, non-wait reasons and delivered answers, **four**
   entries require a prefix; all four have it, **zero unflagged**. These are Pedro's
   t4442 → t5196 question/reason crossing ingestion t4659, and Alvin's t11271 → t12173
   pair crossing t11442. The questions were already in flight when eating completed;
   the prefix exposes staleness but does not cancel the now-redundant question.
   This is not a claim that every topic or sentence is semantically true, nor that
   the topic board displays freshness for all retained interpretations.
2. **Failure accounting retained; in-scene visibility not met.** Operator receipts
   retain **core 6** (five `invalid-output`, one `cancelled`), **core-answer 1**
   (`portion-increased`), **reflection 0**. The more specific topic rejection causes
   above come from offline validation; the live core wrapper reports `invalid-output`.
   The crew-log projection and observer status do not display these failure causes
   or per-lane totals. Thus receipt accounting is verified, but the frozen visible-count
   condition cannot be called a full in-game pass. No oversized pre-model rejection
   occurred, so that branch is not newly live-verified.
3. **Lapsed late offer answers: not exercised live.** No offer was published and no
   hauling intent opened. Keep the existing scripted/mock evidence separate.

Further observer findings:

- The waiting line prints the **first open topic, sliced to 120 characters**, not the
  returned wait reason or a concrete pending event. This explains the mid-word
  telemetry sentence Fable saw.
- The raw returned topic text also contains formatting defects before rendering:
  applied turn 7 includes U+200B; applied turn 10 includes U+007F and U+0012. Fifteen
  topic strings across returned choices are exactly the 240-character bound. These
  are mechanically measurable output/validation issues, not another model task.
- All **32 message entries lack map provenance**; nine self-care records have it.
  The clock correctly falls back to bare ticks for the messages. The missing piece
  is persisted message-map provenance, not permission to guess the viewed map.
- **19 reflections completed**, but **12 attention events were evicted**: food six,
  rest three, memory one, interaction one, mood one. Successful calls do not erase
  those gaps. The cause of the on-screen medical alert remains **unresolved**: the
  retained bridge evidence does not bind that alert to a cause; aggregate health
  values are insufficient to infer one.

### Acceptance limits and next owner

There were **zero published offers, acceptances, offer refusals, counters, opened
hauling intents or credited hauling trips**. The quota was never activated; this is
not an expired agreement or a pawn refusing the experiment. No consent or quota
violation was recorded, but a zero-work run provides no new live proof of hauling
bounds, helpers, completion or post-retirement accounting. Prior strict scripted
checks and matched pairs remain their own evidence; no live trips-per-unit or
hauling-wrapper cost claim is possible here.

There were no `core-wake-silent` events. Offerable work remained available, so this
run does not exercise isolated silent telemetry suppression. The paired and
new-process restores passed **with an empty intent ledger**, not an in-flight haul.

**Technical disposition: retain as diagnosis, not clean migration acceptance.**
Fable's Part D and verdict come next, with the original cold read unchanged. The
audit proposes no reroll and authorizes no deletion. Staging remains stopped;
the original 407 saves and recording hashes remain unchanged.
