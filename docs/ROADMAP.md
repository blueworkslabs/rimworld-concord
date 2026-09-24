# Roadmap

Forward-looking only; past results are in [HISTORY](HISTORY.md) and the
[trial ledger](trials/README.md). Direction agreed with the project owner and team on 2026-09-23.

## Next phase: a colony scene worth watching

We have the individual pieces: consent and negotiation, live hauling, rescue and
eating, attributed speech, private outlooks, and an event-driven core that follows up.
What's unproven is **sustained, understandable coordination**. The goal of this phase
is one meaningful recorded scene of about ten minutes
([VISION](VISION.md#what-watching-should-feel-like)) that a person can follow, and an
honest assessment of what worked before we expand further.

### Ground rules

- **No prescribed plot.** Cooperation, disagreement and a raw-food alternative all
  count. A cooked meal is not required, disagreement is never manufactured, and a lack
  of refusals is not by itself evidence of broken agency.
- **Continuous pawns.** Routine decisions happen while the colony keeps running.
  Pauses are deliberate, visible and explained (see [later](#later-experiments)).
- **Luna first, escalate when justified.** The target default for pawns and the core is `gpt-5.6-luna`
  through native Codex; more capable models (Terra, Sol) are used for turns that need
  them, and every escalation is logged.
- **Restraint without arbitrary caps.** No fixed turn counts for ongoing play. Calls
  stay event-driven, with cooldowns, usage and latency tracking, and detection of
  repetitive non-progress. Common sense applies; waste is a bug. Historical trial
  allowances stay untouched.
- **Receipts and consent stay authoritative** over everything new here: Jev
  recommendations, video summaries and model explanations are inputs, never authority.
- **Freeze before running.** A scene's setup is fixed before its first live run, and
  results are judged across runs, not per run.

### Committed next work, in order

**1. Compact observer UI and a recording pilot — scripted pilot completed**

The compact sidebar and 75-second recording passed native checks. The single final
baseline/capture pair ran at 59.04/59.57 game ticks per second; the silent 15 fps MP4
was 1.89 MB with no reported duplicated/dropped frames. This is a small performance
sample and author inspection, not human usability or live-model evidence. See
[the evidence](evidence/observer-recording-pilot.json) and [controls/protocol](CREW_LOG.md).
The first two-pass video review is complete (below); Luna and ongoing scheduling now have a first continuous integration result (below).

- The colony stays the main view. The full-screen text window becomes a compact strip
  or sidebar showing: who is speaking to whom; intentions (topics and who raised them)
  versus confirmed outcomes; disagreements with their quoted reasons; each pawn's
  activity and coarse needs; and what everyone is waiting on (thinking, blocked,
  paused, out of budget). Full history stays expandable, messages stay on screen long
  enough to read, and private thoughts stay private. No polish beyond that.
- Screen capture at 1280×800, 15–30 fps MP4 (at 2–4 Mbps, roughly 150–300 MB per ten minutes;
  estimates to verify in the pilot).
  Measure its effect on simulation speed before relying on it. Keep uncut recordings,
  label inference pauses and edited excerpts, and move recordings off the staging host.
- A **60–90 second scripted pilot**, with no character-model calls, checks basic UI readability and recording performance. Use the resulting clip
  to calibrate the review pipeline below; this does not establish human usability
  or an engaging live scene.

**2. Feedback from recordings — first calibration completed**

Gemini 3.8 Flash received the uncut MP4 through protected OpenRouter. Two successful
responses cost a provider-reported $0.01662606 and took 11.7/14.9 seconds. The video-only
pass recovered the eating/refusal sequence and correct food-item count, but invented
an extra message and misread quotes/ticks. The receipt check caught those, then added
an unsupported explanation for the invented message. The operator's informal feedback
was positive; no general usability claim follows. [Full evidence](evidence/video-feedback-pilot.json).
Keep this as a timestamped navigation aid with checked receipts, not an authority.
No UI change is justified solely by the model's contrast/font opinions; assess denser,
longer footage next. The gateway's expired local certificate was renewed after an
initial retained TLS failure; no unprotected route was used.

- **People**: a playable recording with scrubbing and speed control, plus quick
  timestamped notes ("lost me here", "why did they stop?", "interesting"). Occasional,
  not homework. This replaces screenshot cold reads.
- **Models**: Gemini through the existing protected OpenRouter route, verified end to
  end for video input first. Two passes: video only (what happened, when, what was
  unreadable), then a cross-check against receipts (what was missed or invented). Model
  summaries triage footage; they can't establish whether people find it followable or
  engaging.

**3. Luna live, and sustained scheduling — first integration completed**

The explicit ongoing mode has no lifetime turn ceiling. Native Luna ran eight core
attempts and eight pawn attempts over three minutes of unpaused native play. Seven
core turns applied; the final one was cancelled at the observation deadline. Beatrice
ate 9 berries and three linked topics resolved, while the broad brief stayed open.
Alvin's first choice failed a fresh-state check; a later urgent-hunger event permitted
a new question, but its native eating action also failed availability checks. No work
or cooking followed. Initial schema failures, offline diagnosis and the corrected run
are all retained. Paired/cold restore passed. [Evidence](evidence/luna-ongoing-integration.json).

**Retained-case assessment completed:** a six-answer offline Luna/Terra comparison
found stale explanations in both, despite correct receipt-backed closures. It does
not justify automatic escalation; Luna remains default. The historical eating
receipts combine several validation predicates, so their exact failure causes remain
unknown. A mock proves portion growth alone can reject an otherwise identical choice,
not that it caused the old failures. [Protocol and result](ONGOING_GROUNDING.md).

**Input/diagnostic changes implemented:** current records, testimony, available
choices and dated planner interpretations are separate in core prompts. Eating
revalidation and native dispatch retain specific first-failure diagnostics, without
relaxing checks. Eight scripted native rejections consumed nothing; a valid chosen
meal consumed 16 food items. The final checkpoint's six failures, completed meal and
topic dates survived cold restart. [Evidence](evidence/fresh-facts.json).

**Recorded scene completed:** ten minutes of continuous Luna play, three receipt-backed
eating actions (39 berries), one stale eating rejection, no work/cooking. One core
answer exceeded active-topic capacity; another was cancelled at the deadline. Native
self-care and quiet periods continued. Paired/cold restore passed. This is not a
controlled prompt comparison or proof of general planning. [Video and findings](RECORDED_SCENE.md#result).

**Next decisions:** use the recording to assess whether the crew is understandable;
consider food-seeking beyond currently local options and handling accumulated open
communication topics. Do not manufacture cooking or disagreement. Cleaner inputs
still do not guarantee grounded prose. Calibrate any automatic routing on separate
held-out cases; escalation remains unimplemented and no Sol comparison has run.


- A native Codex backend for pawn and core calls with the same guarantees the Claude
  route has today: tool isolation, cancellation, persistence and accounting, verified in
  the game rather than assumed from a model-name swap. Core questions, answers and
  reflections now have live evidence; other modes remain unverified through this
  adapter ([MODELS](MODELS.md#routes)).
- An escalation policy (when a core or pawn turn goes to Terra or Sol), logged per turn.
- A usage policy for ongoing play in place of fixed trial allowances, and a review of
  the hard-coded limits that don't fit sustained play: three core questions in total,
  one per pawn, sixteen core turns per lifetime.
- Pawns and the live core in continuous mode.

**4. One recorded colony scene**

- Candidate setup: scarce berries plus raw food that pawns avoid eating raw, using the
  existing haul, build, cook and eat capabilities, so coordinating has real value.
  Verify the raw-food effect in the game's definitions first. A candidate, not a
  prescribed plot.
- Several recorded runs of about ten minutes, reviewed as in step 2. Define
  whether duration means wall-clock or active simulation time before running; keep
  pause intervals and timestamps so both remain measurable.
- Then stop and assess what worked before expanding.

**Questions for the review** (for learning, not pass/fail gates):

- Did a plan form between them, or did everyone solve it alone?
- Were there consequential pawn choices, and were they self-initiated or responses
  to a core offer/question? Record requests, counters, refusals and conditional
  offers without treating every response as independent initiative.
- Could a viewer follow intentions, disagreements, outcomes and waiting from the
  recording alone?
- What did the core try, and where did it stall?

**Stop and diagnose offline** if unsupported capability or consent could reach
execution, or repeated invalid outputs/non-progress prevent the scene from proceeding.
Preserve rejected choices and prose errors without retrying for a preferred answer.
If needs remain unresolved across runs despite relevant available work, investigate
why it was never proposed. A successful raw-food alternative alone is not a stop condition.

### In parallel: Jev, offline

Fable's proposal: use Jev as a real fast layer (many questions against one state, with
confidence) instead of a single yes/no. First slice, offline only:

- Replay an appraisal battery over the existing outlook and speech banks. Report Jev's
  choice and confidence next to Claude's and Luna's, the agreement rate, and how many
  model calls might have been avoided at high confidence for "keep current activity".
  These are counterfactual estimates, not measured live savings; use each case's
  actual eligible choices and explicit assessment labels.
- Include consequential events that must not be missed, and validate any threshold on
  separate held-out cases. Agreement with another model isn't correctness, and high
  confidence isn't proof.
- Output is logged recommendations only. Nothing in the game changes until the data
  supports one specific use; then one use at a time.

## Later experiments

- **Core planning pauses.** For substantial planning (building, defence) the core may
  request an explicit pause under an operator-controlled policy: the reason and
  expected duration are shown, the pause is released on completion or timeout, and it
  never bypasses pawn consent. Tested separately from ordinary asynchronous decisions.
- **Jev in the loop**, one use at a time and only after offline evidence: native
  continuation for high-confidence, low-stakes cases; semantic grounding checks on
  replies; topic bookkeeping before core turns; social salience of native chatter;
  model routing; highlight detection in recordings.
- **Pawn-to-pawn offers** (a pawn proposing work to another, with the recipient's
  consent).
- **Human contact**: suggestions to the core, letters, comms-station conversations.
- **More actions**: general construction, treatment, defence, work priorities.
- **Unattended operation**, only after its own scope and spending decision.
- The gravship campaign, an installer for players, and an OpenClaw operator plugin.

## Known gaps

- The live core has not yet proposed construction or cooking; no live work has
  followed self-care.
- After-meal resumption of deferred work is not automatic.
- Explanations still blur units and sources at times; prose grounding is unscored in
  production.
- The crew log doesn't explain why coordination stopped.
- Two early provider errors (before the formatting recovery) remain unexplained.
- Correcting or retracting retained speech is untested.
- Useful live-core planning has only run with the game paused during model calls; the
  one unpaused live-core run had all core outputs rejected.

## Maintenance policy

- Trial budgets stay centralized in `src/decision-trials.ts`; historical policy names
  and allowances are never reused or changed.
- New evaluation code goes in `trials/`; older runners in `src/` move only when touched
  for another reason.
- Every trial gets a ledger row and sanitized evidence; contracts change in the topic
  documents, not in trial write-ups.
