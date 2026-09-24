# Roadmap

Forward-looking only; past results are in [HISTORY](HISTORY.md) and the
[trial ledger](trials/README.md). Direction agreed with the project owner and team on
2026-09-24.

## Where we are

The "watchable scene" phase delivered what it set out to test:

- a compact observer panel and recording pipeline ([pilot](evidence/observer-recording-pilot.json));
- two-pass video feedback, useful as a navigation aid but not an authority
  ([calibration](evidence/video-feedback-pilot.json));
- native Luna for the core and pawns in continuous, event-driven play with no lifetime
  turn cap ([integration](evidence/luna-ongoing-integration.json));
- source-separated core prompts and precise eating diagnostics
  ([evidence](evidence/fresh-facts.json));
- a [ten-minute recorded Luna scene](RECORDED_SCENE.md#result): continuous interaction
  works, 39 berries eaten on receipts, no work or cooking.

The scene also showed where the limit is. Local food access, stale rejections and
agreements that die at the first interruption are not model failures: they come from
the way the mod drives pawns with one-off ordered jobs while RimWorld's own planner is
also running them. [NATIVE_INTENTS](NATIVE_INTENTS.md) explains this and the new
direction: **steer the game's own planner instead of driving pawns.**

## Next phase: work with RimWorld's planner

### Ground rules

- **The coordinator stays.** Consent, receipts as truth, projections, the core,
  attention, checkpoints and model isolation are unchanged. The change is on the game
  side.
- **Consent stays per agreement.** Native intents are tagged with their agreement, and
  only pawns who accepted it take it on. Work priorities belong to each pawn; the core
  never sets them, and a refusal never silently turns off a work type.
- **No new hand-built capabilities** on the ordered-job model. Fixes only; it remains
  the regression baseline until each native replacement matches it.
- Continue from the last phase: continuous play, Luna first with logged escalation,
  restraint without arbitrary caps, the setup frozen before live runs, and recordings
  for review.

### Committed next work, in order

**1. Learn the internals (about a week)**

Decompile the owned RimWorld 1.6 assemblies on the lab host (never committed) and write
a short internals note confirming the job tracker, the humanlike think tree, work givers
and work settings, designations, zones and bills, reservations, and interactions and
thought memories. Details are in
[NATIVE_INTENTS](NATIVE_INTENTS.md#learning-the-internals). Done when the note answers
where to hook events, how to build options from work givers, and how to restrict tagged
work to consenting pawns.

**2. Spike: one native-intent agreement**

No coordinator changes; the same campfire fixture with ordinary work priorities
switched back on.

- Harmony hooks for job start and end (with end reasons), ingestion and social
  interactions, feeding the existing event stream.
- A generic option list from work givers for the three pawns.
- One agreement, "haul wood to the stockpile, up to 30", as a tagged zone with an
  eligibility filter, receipts from the native haul jobs.

Measured against the recorded scene: stale rejections, idle or wandering time, whether
agreed work resumes after a meal without a new model call, whether receipts reconstruct
delivered totals, simulation speed, and **consent violations, which must be zero**.
Scripted first, then one recorded live run.

**3. Decide, then migrate one capability at a time**

If the spike wins: hauling, then campfire construction and cooking through blueprints
and bills, then rescue through the native rescue job. Each migration keeps the
coordinator contract, adapts receipts and topic closure to aggregate progress, and is
verified against the ordered-job baseline before that baseline is retired. If it loses,
we record why and revisit the direction before building anything else.

**4. Decisions to make during the spike** (see
[open decisions](NATIVE_INTENTS.md#open-decisions)): the per-agreement eligibility filter,
what colony infrastructure the core may see, topic closure on aggregate receipts, and
whether checkpoints during running agreements become allowed.

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
