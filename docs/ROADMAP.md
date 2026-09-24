# Roadmap

Forward-looking only; past results are in [HISTORY](HISTORY.md) and the
[trial ledger](trials/README.md). Direction agreed with the project owner and team on
2026-09-24.

## Where we are

The "watchable scene" phase delivered the tools and a first recorded trial, not yet
proof of sustained, understandable coordination:

- a compact observer panel and recording pipeline ([pilot](evidence/observer-recording-pilot.json));
- two-pass video feedback, useful as a navigation aid but not an authority
  ([calibration](evidence/video-feedback-pilot.json));
- native Luna for the core and pawns in continuous, event-driven play with no lifetime
  turn cap ([integration](evidence/luna-ongoing-integration.json));
- source-separated core prompts and precise eating diagnostics
  ([evidence](evidence/fresh-facts.json));
- a [ten-minute recorded Luna scene](RECORDED_SCENE.md#result): continuous interaction
  works, 39 berries eaten on receipts, no work or cooking.

The scene exposed local food access and stale choices alongside prose and topic
bookkeeping failures. The code also stops agreements on interrupted steps. One-off
ordered jobs alongside RimWorld's own planner are a structural limitation worth
testing; the exact causes of the historical eating rejections remain unknown, and a
new game interface will not by itself fix model grounding. [NATIVE_INTENTS](NATIVE_INTENTS.md) explains the new
direction: **steer the game's own planner instead of driving pawns.**

The native-haul spike now has [partial scripted staging evidence](trials/NATIVE_HAUL_OFFERS.md):
Pedro-based exclusive work, offers/counter/paired restore, and native meal resumption
pass (75/75 delivered, resumed three ticks after eating). The matched ordered meal
observed 15/75, with an explicitly retained measurement failure and offline rescore.
[Follow-up instrumentation](trials/NATIVE_HAUL_INSTRUMENTATION.md) observed a real
drafting cleanup drop, fresh-coordinator restore and scoped patch timings. [Reservation-policy reruns](trials/NATIVE_HAUL_CONTENTION.md) now show unaccepted
Beatrice contributing 20 of 75 wood and two overlapping holders, without changing pawn
behaviour. Earlier contention interpretations are void because one job monopolized
quota. The [live harness and setup hash](trials/NATIVE_HAUL_FREEZE.md) now have a recorded
zero-model rehearsal and real coordinator-process cold restore. Two earlier coverage
failures exposed missing native core wake integration and remain retained. Fable signed the
75-unit helper-layout setup and the [single frozen live recording](trials/NATIVE_HAUL_LIVE.md)
is complete. The recording-only read is complete; [receipt-backed findings](trials/NATIVE_HAUL_LIVE.md#technical-findings--released-after-the-recording-only-read) expose offer bookkeeping, stale narration and attention failures. Fable [approved game-side migration](trials/NATIVE_HAUL_GATE_C.md); three fixes block the next live run, and rare boundary checks remain. The options-menu measurement is a WoodLog-only subset.

## Next phase: work with RimWorld's planner

### Ground rules

- **The coordinator architecture stays.** Consent, receipts as truth, projections,
  the core, attention, checkpoints and model isolation retain their responsibilities.
  Narrow protocol, routing, receipt and lifecycle adaptations support the new game side.
- **Consent stays per agreement.** Native intents are tagged with their agreement. A
  pawn that refused or deferred it never does its tagged work; pawns who were never
  asked may still pitch in (whether tagged work is exclusive is measured in the spike).
  Work priorities belong to each pawn; the core never sets them, and a refusal never
  silently turns off a work type. Withdrawal still binds; helpers are credited as
  helpers, not fabricated acceptances.
- **The destination is unchanged.** The goal is still the recorded scene from
  [VISION](VISION.md#what-watching-should-feel-like). The new game side is a means,
  and success is measured against that goal, not parity with the old model.
- **No new hand-built capabilities** on the ordered-job model. Fixes only; it remains
  the regression baseline until each native replacement matches it.
- **No prescribed plot.** Cooperation, disagreement and raw-food alternatives all
  count; cooking and refusals are never manufactured requirements.
- Continue from the last phase: continuous play, Luna first with escalation only when
  justified and logged (automatic routing remains unimplemented),
  restraint without arbitrary caps, the setup frozen before live runs, and recordings
  for review.

### Committed next work, in order

**1. Learn the internals (about a week)**

Decompile the owned RimWorld 1.6 assemblies on the lab host (never committed) and write
a short internals note confirming the job tracker, the humanlike think tree, work givers
and work settings, designations, zones and bills, reservations, and interactions and
thought memories. Details are in
[NATIVE_INTENTS](NATIVE_INTENTS.md#learning-the-internals). Done when the note answers
where to hook events, how to build options from work givers, how to keep refusing pawns
off tagged work, what the constant think tree can take over mid-agreement (fleeing,
mental breaks, drafting), and **how every new event kind is routed** (job start and end
→ native, ingestion → native, social interaction → queued, downed → interrupting), so
the first live run isn't a wake storm.

**2. Spike: one native-intent agreement**

No coordinator planner rewrite; the same campfire fixture with ordinary work priorities
switched back on, plus necessary adapter, routing and agreement-lifecycle changes.

- Harmony hooks for job start and end (with end reasons), ingestion and social
  interactions, routed per the internals note before they reach the event stream.
- A generic option list from work givers for the three pawns.
- One agreement, "haul wood to the stockpile, up to 30", as a tagged zone, run in two
  variants (exclusive to accepting pawns, and attribution-only), with receipts from the
  native haul effects, not job-end reasons alone. Enforce the shared 30-unit cap across
  helpers and in-flight jobs; a stockpile zone alone does not encode it.

Historical references: delivered totals from the integration checkpoint (#38: 40 wood
in 4 trips), and idle/wandering time and simulation speed from #64. Neither measured
meal resumption; use matched scripted ordered-job/native-intent scenarios for that and
stale haul rejections, and matched settings before claiming performance improvement.
**Consent violations (including refused, deferred or withdrawn tagged work) must be
zero.** Script both variants, quota/receipt accounting, meal resumption, expiry and
paired/cold restore; measure event wakes, cancellations and buffer gaps too. Then one
recorded live run with its variant/setup/duration frozen beforehand. The usual rule
applies: if unsupported capability or consent could reach execution, or repeated
invalid output or non-progress stalls the run, stop and diagnose offline. Quiet waiting
and successful raw-food alternatives are valid, not stop conditions.

**3. Decide, then migrate one capability at a time**

**Decided 2026-09-24: the spike wins on the game side; migrate.** Verdict, blocking
fixes before the next live run, and closed decisions:
[NATIVE_HAUL_GATE_C](trials/NATIVE_HAUL_GATE_C.md). The hauling migration goes through
the same three gates: [MIGRATION_HAULING](MIGRATION_HAULING.md). **Gate B signed
2026-09-24**; implementation is next. Growing hold has a two-fix-round bound with strict
fallback, and the migration's live run must measure the #71 corrections.

If the spike wins: hauling, then campfire construction and cooking through blueprints
and bills, then rescue through the native rescue job. Each migration keeps the
coordinator contract, adapts receipts and topic closure to aggregate progress, and is
verified against the ordered-job baseline before that baseline is retired. If it loses,
we record why and revisit the direction before building anything else.

**4. Decisions to make during the spike** (see
[open decisions](NATIVE_INTENTS.md#open-decisions)): exclusive versus attribution-only
tagged work, whether the core may propose untagged designations, topic closure on
aggregate receipts, and whether checkpoints during running agreements become allowed.
Already decided: colony-built infrastructure (stockpiles, blueprints, bills,
designations) is colony-public knowledge; loose things stay sightings.

### In parallel: Jev, offline

Unchanged, and not on the critical path. Replay an appraisal battery over the existing
outlook and speech banks; report Jev's choice and confidence next to Claude's and
Luna's, agreement, and counterfactual avoidable calls. Include consequential events
that must not be missed and validate thresholds on held-out cases. Logged
recommendations only.

## Later experiments

- **Standing commitments in the think tree**: a `ThinkNode` that consults cached
  agreements, so an idle pawn prefers the work it agreed to, with no model call at tick
  time.
- **Native social consequences**: refusals and broken promises as thought memories that
  affect mood and opinion.
- **Pawn-owned work preferences**: an explicit pawn choice to change its own work
  priorities, shown in the crew log.
- **More work, from the game's work givers** (mining, growing, treatment, defence)
  instead of new hand-built capabilities.
- **Core planning pauses** for substantial planning, under an operator policy: visible,
  released on completion or timeout, never bypassing consent.
- **Jev in the loop**, one use at a time and only after offline evidence.
- **Pawn-to-pawn offers**, **human contact** (suggestions to the core, letters,
  comms-station conversations), **unattended operation** (after its own scope and
  spending decision), the gravship campaign, an installer and an OpenClaw operator
  plugin.

## Known gaps

- The live core has not yet proposed construction or cooking; no live work has
  followed self-care.
- Agreements don't survive interruptions: after a meal, stopped work doesn't resume.
- Options are limited to what a pawn sees within 12 tiles; food visible but not
  locally available caused rejections.
- Explanations still carry stale facts at times; prose grounding is unscored in
  production.
- The crew log doesn't explain why coordination stopped.
- Correcting or retracting retained speech is untested.
- Two early provider errors (before the formatting recovery) remain unexplained.

## Maintenance policy

- Trial budgets stay centralized in `src/decision-trials.ts`; historical policy names
  and allowances are never reused or changed.
- New evaluation code goes in `trials/`; older runners in `src/` move only when touched
  for another reason.
- Every trial gets a ledger row and sanitized evidence; contracts change in the topic
  documents, not in trial write-ups.
- Decompiled game code, like game assets, never enters the repository.
