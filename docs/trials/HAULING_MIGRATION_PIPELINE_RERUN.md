# Hauling migration — pipeline-corrected rerun, 2026-09-25

## Authorization and unchanged setup

Fable’s [Part D disposition](https://discord.com/channels/1083662512806965308/1467116597645676546/1552972709065924719)
classified the [first live run](HAULING_MIGRATION_LIVE.md) as retained diagnosis, not a
scene: Gate C did not pass and no deletion was authorized. She directed six pipeline
corrections followed by one rerun of the same frozen setup. The original recording,
cold read and findings remain intact. This is the separately identified authorized
rerun, not an erased or relabelled first attempt.

[PR #77](https://github.com/blueworkslabs/rimworld-concord/pull/77) merged at
`e436933d349942d4e1062acb2768ef4a224e8875` after independent review, corrections and
focused re-review. **423 tests passed**; the independent focused suite passed 98.
Corrections cover explicit consumption-report receipt binding, capacity-aware topic
schemas, existing-open-only action links, grounded rejection causes through the native
relay, visible failure counts and heard/wait status, and eating-count revalidation.
These checks were offline; the rehearsal below is authored-only. Live coverage must
be established from the retained scene, not inferred from either.

[Public freeze projection and rehearsal evidence](../evidence/hauling-migration-pipeline-rerun-freeze.json)
records the reviewed runtime and hashes. Full canonical setup inputs remain private;
the public projection is deliberately not itself the canonical fingerprint input.

- New setup SHA-256: `ac88cea172160541a20a6a280e398ae7273ac82852e77efce7736ffd064e3d4f`.
- Same helper save and **75 wood** quota; strict, attribution-only native hauling in
  ordinary play, with rescue, construction and cooking unchanged.
- Pedro and Beatrice capable; Alvin natively incapable, no capability override.
- Same native Luna at low, no Jev, no model-turn cap, ten-minute continuous window,
  #64 recording protocol and failure stop rule. No additional rerolls.
- Same #71 live checks: receipt-age prefixes, causes and per-lane visible failures,
  lapsed wording if a late offer answer occurs. Unexercised branches remain gaps.
- Same cold restore: new host and coordinator processes, game process stays up and
  reloads the paired save. No inference during restore.

## Recorded zero-model rehearsal

Run `78fc3693-d3ae-474d-a752-2c68a3d49f3c`: both capable pawns received and accepted
authored offers, 75/75 credited, and paired plus new-process cold restores matched
the retained game ledger. Zero model calls. The original 49-second rehearsal video
is retained privately, SHA-256
`7b326f19ca8692f7ead4038f15132bf4f071ccc8ea47ee7bde76f4b930eaeb3e`.
This is not evidence of what the live model chooses.

## Live evidence

**The one authorized rerun and Fable’s recording-only cold read are complete.
Technical findings follow below; her Part D and verdict remain pending.**

[Watch/download the uncut original MP4](../../diary/assets/recordings/hauling-migration-pipeline-rerun-2026-09-25.mp4)
· [Preservation metadata](../evidence/hauling-migration-pipeline-rerun-recording.json)

Run `25bcdc7e-c6c3-40bc-8f95-f9659afc1e10`: **10:04.867**, 14,143,927 bytes,
1280×800, 15 fps, 9,073 decoded frames, silent. Capture reports zero dropped frames
and one duplicated frame; both are retained in the original bytes. SHA-256:
`9ea5f3bcc6cd00b03096515b43127dcc4a01ad54aec07ae80da640a6f96c12cf`.
Remote and copied-file hashes match. Continuous observation lasted 601.766 seconds;
all 371 sampled states were unpaused.

Paired and new-process cold restores passed against the retained checkpoint and
the actual game ledger. Host process 551655 → 566669; coordinator 177691 → 178643.
The game process stayed running and reloaded the checkpoint. No inference was
added during cold restore. These are preservation checks, not a Gate C verdict.

Staging is stopped after a new handoff save. All **409 pre-existing saves** are
unchanged, and the executable fingerprint matches after the run. Exact requests,
responses, failures, accounting, game receipts, databases, checkpoints and capture
logs remain private and intact. No further scene was run.
Read order stays: uncut recording → Fable’s recording-only read → technical findings
→ verdict. Growing remains parked at B1 2/2. No deletion PR.


## Technical findings — after the recording-only read

Fable’s [read](https://discord.com/channels/1083662512806965308/1467116597645676546/1552988077025136692),
[continuation](https://discord.com/channels/1083662512806965308/1467116597645676546/1552988080242303089)
and [request for findings](https://discord.com/channels/1083662512806965308/1467116597645676546/1552988087288725576)
remain unchanged. [Sanitized receipt audit](../evidence/hauling-migration-pipeline-rerun-findings.json)
binds this analysis to retained inputs, events, accounting and saves by hash.
No gameplay, model calls or runtime changes were made for this audit.

### The wood totals: gross handling is not net stock

The quota ledger is exact: **75 credited = Beatrice 40 + Pedro 35**, four credited
placements, no recorded escapes, overshoot or consent violations. The intent opened
at t25017 and completed at t26173, with two simultaneous reservation holders.
Only Beatrice received an offer and accepted; Pedro was an unasked attribution-mode
helper, not a second consenting participant. Alvin remained natively ineligible.
The live both-capable-pawns-offered measure is therefore **not met**, even though
both contributed. There was no late offer answer, refusal or withdrawal to test.

The archive records **60 gross ordinary arrivals and 15 removed**, not 60 net new
wood. The sequence after completion is +5 at t26686, +20 at t26978, +20 at t27493,
−15 at t27500, then +15 at t27526. Hence **75 + 60 − 15 = 120**.
A read-only XML count independently confirms 120 loose wood in the original fixture
(six stacks of 20) and 120 in the final handoff (75 and 45, both inside the pile).
No extra supply or quota credit is needed to reconcile the totals.

The removal is a **net-count reconciliation receipt**, without a pawn or source
identity; it is not a directly attributed pickup record. Pedro’s final ordinary
15-unit placement follows it by 26 ticks, in native haul job 1417, which lasted
30 ticks. This is consistent with restacking/rehandling, but the exact origin of
those carried units was not instrumented and is not asserted as proven.

**Presentation defect:** `Since then` sums gross per-pawn arrivals but omits
`ordinaryRemoved`, making 135 look like conserved stock. Its upsert also retains
the first line’s timestamp, t26707, even after the displayed total grows to 60
from the t27526 event. Thus the displayed time is not the time of that final total.
Both the removal and update-time semantics need a disposition; the quota itself
was not exceeded.

The missing helper line **does exist and is visible**: at **7:16** in the original
video, “Pedro is helping with the shared wood pile (not asked).” Its record tick
is t25716; his first credited placement was t25660. This supplements the sampled
cold read, not a change to that read.

### Why the core waited

The core made **15 scheduled attempts: 13 applied (ten asks, two waits, one offer),
one pre-model context rejection and one observation-deadline cancellation**.
There were no topic-capacity, action-link or other returned-output rejections in
this run. Ten answer attempts produced eight published answers and two cancellations.
The one work decision accepted. Fifteen reflections completed; none failed.

At input t8572 (143.536 seconds into observation), the core had eight opportunities,
including both haul candidates and construction, but chose wait: everyone was fed
and no new work or question was needed, in its stated reason. At t18728 (313.938 s),
Alvin’s food-band change woke it; four opportunities remained, but it chose wait
again. Pedro’s subsequent band change woke the t22464 turn (376.594 s), which asked
Alvin. Alvin’s answer then woke the t23712 turn that proposed Beatrice’s haul.

This is **model choice plus event-driven scheduling**, not an empty menu or a
five-minute inference. Tick passage, changing opportunities and the core’s own
prose are not wake causes. The urgent-exempt telemetry suppression did not silently
consume any wake in this run (zero `core-wake-silent` events); opportunities kept
the observed band-change wakes eligible. A waiting label can therefore persist
without new model work. The label still names an open topic rather than a concrete
pending event, and closed/planner prose is not itself a promise to take action.

### What was cancelled and what was too large

- Alvin’s first consumption-report answer began from t1840 and was interrupted by
  the native meal-related **AteWithoutTable** memory at t1980 (event 110).
- Beatrice’s consumption-report answer began from t7944 and was interrupted by the
  same native memory type at t7964 (event 446).
- Those are deliberate interruption-policy outcomes, not two refusals or missing
  meal receipts. The status exposes only `cancelled 2`; the concrete event causes
  are retained in the operator trace, not linked or timestamped on screen.
- Core turn 13’s **input** at t30061 is **24,183 UTF-8 prompt bytes**, 183 above the
  unchanged 24,000-byte limit. Offline reconstruction reproduces `Context too large`.
  It never reached inference and generated no output. Earlier 19-input regression
  checks could not establish that a new live trajectory would stay within the limit.
- Core turn 14 began at t35218, 590.823 seconds into observation, following Pedro’s
  worsening-to-urgent food band. Its in-flight request was cancelled at the fixed
  deadline. There was no returned answer and no retry.

The **10:03** video frame shows the final visible counts: core 2 (`context-too-large`
1, `deadline` 1), core-answer 2 (`cancelled` 2). Counts survived restore and did not
reset on unrelated successes. Visible totals now work; “cancelled” still lacks the
specific triggering event or a time in the presentation. A context-input failure
also sits under the broad “Core outputs failed or rejected” heading.

### Repeated consumption questions and Pedro’s plea

All four eating choices completed: Alvin 12, Pedro 11, Beatrice 11, Alvin 15.
All four follow-up questions explicitly bound the correct `reportSelfCareId`.
Their input snapshots still had the meal `started` with zero consumed, so the core
was legally able to ask **during** eating. Alvin’s first and Beatrice’s questions
arrived before meal completion; Pedro’s and Alvin’s last crossed completion while
inference ran and were correctly prefixed. Typed linking prevents unrelated topics
from borrowing receipts; it does not make repeated “did you consume?” questions
useful or restrict them to completed meals.

Pedro’s t26648 hunger/tiredness reply appears in the next t26857 core input and in
that turn’s `heard` list. The core **asked Alvin**, instead of waiting or answering
Pedro. The new “heard Pedro; waiting on …” status is conditional on a **wait** action,
so this case never enters that display branch. The message was not lost; the patch
covers waits, not acknowledgement of every pawn message when attention turns to
someone else. His answer snapshot had no eating option. No typed request was made;
ordinary speech does not automatically dispatch food, rest or another conversation.

### Frozen measures and remaining limits

- **Game mechanics observed live:** exact 75 credit, zero recorded consent violations,
  zero escapes/overshoot, two concurrent holders, unasked helper credit and completion.
  Four credited jobs; 1,156 ticks from intent opening to completion. Attribution is
  not proof of two accepted offers. No refusal, withdrawal or late-answer branch occurred.
- **#71 receipt-age scope:** independently join retained native receipts and intent
  deliveries to inputs/publication ticks. **31 published dialogue/reason entries,
  seven requiring prefixes, seven flagged, zero unflagged.** This does not certify
  semantic truth of all topic prose or the core’s causal story about future cooking.
- **#71 failure presentation:** all four call failures have retained causes and final
  visible per-lane counts, including the pre-model rejection. The cancellation event
  causes require the trace; the recording shows only the category. Fable’s readability
  concern remains. Late offer-answer wording was **not exercised live**.
- **Matched/performance scope:** retain the earlier scripted matched pairs and timing
  evidence separately. This 75-unit scene is not a fresh controlled ordered/native
  comparison or a measurement of patch overhead.
- **Attention:** 17 unprocessed-event evictions remain: memory 1, rest 6, mood 2,
  food 5, intent-ordinary 3. Fifteen successful reflections do not erase those losses.
- Message-map provenance and the topic-text/character-quality follow-ups remain
  open. The medical alert’s cause remains **unresolved**: no alert-source telemetry
  was retained, and the visual alert alone does not identify a patient or condition.

**Fable’s Part D/verdict next.** This establishes live mechanism evidence and names
remaining presentation/cognition limitations; it does not pre-empt her Gate C
verdict or authorize a deletion PR or another run.
