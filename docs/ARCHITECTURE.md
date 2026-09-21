# Architecture and accepted decisions

2026-09-21 baseline. New repository explicitly requested; the old rimworld-gm repository remains intact.

## Components

1. Native C# mod owns physical action validation and saved execution receipts.
2. Standalone TypeScript coordinator owns event order, character state, proposals, commitments, decisions and paired checkpoints. One local process writes through the bridge.
3. Replaceable decision backends consume bounded perspective objects; no game/admin handles are passed to them.
4. Optional thin OpenClaw integration will provide operator controls and possibly isolated decision execution. It is not the simulation's state database or clock.

The human is initially an observer/test director, communicating through the core when desired. Debug interventions are separate from in-world agency. Direct possession is deferred.

## First action contract

The core creates a proposal for a known pawn. Only the bound pawn handle can decide it. Strict response validation permits acceptance, refusal or a counterproposal; additional fields such as a forged actor/action are rejected. Acceptance persists an action ID before dispatch. An uncertain transport outcome retains that ID; reconciliation queries the game ledger before any retry. Action receipts distinguish started/completed/failed/interrupted. A counterproposal is recorded for further discussion, not automatically executed.

The mod currently supports only movement on the current map. It rejects unavailable, downed, mentally breaking or drafted pawns, and unsafe/unreachable destinations. Native game behavior may interrupt an accepted job. Completion means reaching the requested cell, not merely receiving a tool response. The core does not possess the mod transport; actor checks supplement rather than replace coordinator identity binding.

## Continuity

Each saved game has a persistent world ID and a fresh, nonserialized epoch for every loaded GameComponent. Request IDs are distinct from action IDs: retrying an action cannot accidentally consume an old transport response. Saved action records deduplicate effects in that timeline.

SQLite commits character state and audit events atomically. Checkpoints currently require no active commitments. The coordinator cancels pending inference, saves the paused game under a unique name, hashes it and stores the corresponding character snapshot. A crash before checkpoint metadata exists leaves an unusable orphan, never a falsely complete pair. Restore verifies the save hash before loading, marks the binding invalid during transition, restores memories and forks the branch ID. Unknown external loads fail closed. Native pause-on-load advances one tick; no bit-identical replay claim.

Audits retain discarded branches for operators; character views derive only from the active state, not all historical events. A DB backup and its referenced immutable game saves must be retained together. Active-job checkpoints, database migrations beyond schema 1, retention and crash-recovery UX are deferred.

## Three speeds of cognition

- Native habits/needs/job execution continue during ordinary deliberation.
- Fast appraisal assesses bounded contextual choices; Jev is a candidate, not a dependency.
- Deliberation handles negotiation, novelty and planning, and may later establish bounded standing intentions.

All layers should use consistent traits, relationships, commitments and relevant memories. No confidence score can prevent explicit significant-event escalation. Immediate native reactions and later reflection can both be scheduled for one event. Selected native events now feed the routing policy. See [pawn awareness](AWARENESS.md) for sampling, retention and perception limits. Routing produces attention records, not autonomous actions. Jev appraisal has a bounded adapter and mocked tests; live transport validation and standing-intention execution remain pending.

Live play is the target. The activity API drives an expiring visual badge above deliberating pawns. Activity IDs prevent an old completion from clearing a newer badge; epoch validation rejects clears from discarded timelines. Expensive calls must be bounded/cancellable, stale results revalidated, and backend failures must not turn into forced obedience. Current fallback leaves the proposal pending and native behavior unchanged. Extended planning pauses should be explicit and visible, not an invisible default for every decision.

## Scope boundaries

There is no general remote API, hostile code sandbox, full pawn perception system, autonomous core planner, OpenClaw plugin runtime, live model integration, campaign or gravship-control layer in this slice. These should be added incrementally against the same authority and timeline invariants.
