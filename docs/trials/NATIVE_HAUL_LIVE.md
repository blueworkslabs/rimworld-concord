# Frozen native-haul live recording — 2026-09-24

The single approved Luna run is complete. **Fable delivered the recording-only four-sentence test at 19:09 UTC; [Gate C approves game-side migration](NATIVE_HAUL_GATE_C.md), with three fixes required before the next live run.** No rerolls or runtime changes were made.

[Download/watch the uncut original MP4](../../diary/assets/recordings/native-haul-live-2026-09-24.mp4) · [Recording and preservation evidence](../evidence/native-haul-live-recording.json) · [Signed freeze](NATIVE_HAUL_FREEZE.md)

The silent 1280×800, 15 fps original is 10:04.600 including setup/end padding, 14,465,082 bytes, with 9,069 decoded frames and no reported dropped or duplicated frames. The continuous observation lasted 601.494 seconds; all 374 sampled states were unpaused. Video SHA-256: `0c39d89d035f2ceebed2b36bf184a590520410c0b71b7d1be8ae97bdb43378dd`.

Paired and separate-process cold coordinator restore passed against the actual game ledger. The game process stayed up for cold restore, as frozen. No additional inference was made for restore. Staging is now stopped and all 285 original saves are unchanged.

The full technical audit, returned choices, rejected/unavailable requests, deadline cancellation, raw game events and checkpoints are retained privately. Outcome commentary was withheld until Fable completed the recording-only read; the subsequent findings below do not amend that read. Successful capture/restore is not a clean-model-behavior claim or Gate C approval. No automated video reviewer has been called ahead of Fable.


## Technical findings — released after the recording-only read

[Sanitized receipt excerpts and offline checks](../evidence/native-haul-live-findings.json). These are Astra’s technical findings, not Fable’s verdict. No new game or model calls were made. The original video and raw receipts are unchanged.

### What the game established

The native intent reached **75/75 at tick 2510: Pedro 40, Beatrice 35**, with two simultaneous reservation holders, zero quota escapes and zero consent violations. Only Beatrice’s acceptance became an in-game agreement. Pedro’s 40 units were helper participation, not work under an accepted agreement. The ledger retained that distinction; the observer did not explain it clearly.

Native ingestion hooks recorded **Alvin 18 berries at t16264, Beatrice 16 at t20205, Pedro 18 at t21513**. Only Beatrice’s meal was a model-chosen self-care action; Alvin and Pedro ate natively. Thus 52 food items were consumed, but not 52 model-directed items.

### Pedro answered; the coordinator lost the distinction

Pedro was offered the intent and returned `accept`. The coordinator’s exact rejection was **`Intent already closed: met`**. Fresh-state validation correctly prevented acceptance of already-completed work. The harness then retired the pending offer with the generic reason **`Decision unavailable; no retry`** and status `withdrawn`. His returned answer remains in the host receipt but not the proposal’s decision field or the visible dialogue.

This was neither refusal nor pawn withdrawal. The correct human account is “answered yes after the shared work had already finished; no new agreement started.” The generic withdrawal also polluted the core’s records: `agreementProgress` supplied **`agreed:1, unfulfilled:1, delivered:40`** for this never-accepted offer. The model repeatedly described an unfulfilled withdrawn agreement. This is a substantive bookkeeping/projection defect, not merely awkward dialogue.

### The two contradictions are stale output, not fabricated input facts

- **Beatrice’s meal:** the core snapshot at **t20100** genuinely said `started, consumed:0`. Native ingestion occurred at **t20205**. The core’s “receipt records no consumed food-items” message appeared at **t21034**, after the receipt on screen had updated. Its input was true when captured and false by publication.
- **Pedro’s hunger:** the next snapshot at **t21242** genuinely labelled him `urgent`. He ate at **t21513**. The question published at **t22166** still called that telemetry fresh and urgent, despite his now-satisfied state.

Continuous inference needs to expose observation age and handle materially stale narration; pausing the game is not required to establish this defect. These examples are not evidence that Luna ignored a completed receipt or satisfied telemetry already present in its input.

**Beatrice’s eating topic did close.** The next core turn (input t21242, publication t22166) resolved the self-care topic and its two linked follow-ups using the completed 16-item receipt. They remain resolved in final and restored state. The later food-status questions are separate topics, not evidence of a permanently open eating task.

There is another grounding error: the model repeatedly called the progress snapshot’s current `tick` the time when Beatrice’s haul completed, producing changing completion dates long after the fixed t2510 final placement. Observation time is not event time.

### Ordinary hauling and the medical alert: evidence limits

After quota retirement the records show successful native `HaulToCell` jobs for **both** Beatrice and Pedro. They do not retain post-retirement placement counts or destination cells. Therefore the exact split of the remaining 45 is **not established**; successful job-end events must not be converted into invented delivery quantities. The 75-to-120 counter and missing credited/ordinary explanation are a real legibility gap, not quota over-delivery.

The candidate zone is x76/z84/w4/h4, but that operator coordinate is not a substitute for making it visible to a viewer. The precise medical-alert trigger/affected-pawn set was not recorded. Both endpoint summaries report health 1 and no downed pawn; that does not establish absence of injuries or explain the alert. The retained save contains pre-existing conditions, but no claim about the exact alert cause is justified from those summaries.

### Negative observations the harness pass does not cover

**Six reflection requests failed before reaching a model.** Replaying only request construction on the exact archived inputs reproduces `Context too large`: **24,130–24,763 UTF-8 bytes against the existing 24,000-byte prompt limit**. Ownership checks pass. No limits were relaxed and no inference was retried. The wrapper hid these causes behind `Decision unavailable`, and no backend attempt rows were reserved for them.

The coordinator also recorded **16 attention-buffer evictions** of unprocessed food/rest/mood events. The 64-entry per-pawn experience buffer overflowed; this is distinct from bridge transport loss. No `native-event-gap` transport warning was recorded. Native game activity kept progressing, but the cognitive/event pipeline was not clean.

The stop guard counts three consecutive failed/interrupted results. Successful core turns were interleaved with these reflection failures and reset that count; the guard did not fire. There was no unsupported execution or simulation stall. Nevertheless, “the run finished” must not conceal repeated per-lane failures; this is a diagnostic/guard limitation to carry into the next phase.

There were **14 core and 19 pawn wire requests**, but **14 core and 13 pawn backend attempts**, with **26 returned choices**. Thirteen core turns applied; the final core thought was cancelled at the observation deadline. Known usage is **164,347 subscription tokens**, cancelled usage unknown; no API cash-price estimate or Jev calls. The 13 applied core choices comprise two work offers, four questions and seven waits. Repetitive “nothing available” narration is real; after the intent closed, the frozen intent-only configuration deliberately provided no further work to propose.

### Handoff

The native haul/consent ledger and terminal paired/new-process coordinator restore passed their stated checks. This does not establish character quality, observer legibility, a clean attention pipeline, rare boundary coverage or general migration readiness. Fable owns Part D and Gate C. Prior scripted helper/meal/withdrawal evidence remains separately labelled; it is not silently substituted for unobserved live choices. No fixes or second live run were performed during this findings handoff; both PRs remain draft.
