# Pawn awareness and appraisal

## What exists

The mod exports **self facts** for each current-map colonist: native traits, skill levels, needs, surviving thought memories (including the referenced pawn ID when present), and direct relationships. These are native game facts, not generated biographies or omniscient access to another character's thoughts. An operator snapshot contains all pawns; a decision/appraisal backend receives only its bound pawn's facts, character state and relevant proposal/event.

A sampler runs every 30 game ticks and when the local state bridge is polled. It records job-definition changes, health/food/rest/mood band changes (five bands), and newly observed native memory objects. First observation after load establishes a baseline; existing memories appear in self facts but are not fabricated as new events. This is **not exhaustive social logging**: events between samples, changes merged into existing memories, removed pawns, remote maps, hearing, sight and rumours are not yet covered.

The game saves a ring of 256 events and a monotonic sequence number. Coordinator `observe()`/`reconcile()` ingest them, audit sequence gaps and retain the last 64 experiences per character. Durable audit events retain earlier captured experiences; model views do not inherit the whole audit. Cursor and character state checkpoint together. Polling the same events is idempotent; restoring an older checkpoint restores its cursor and experiences. If the consumer falls behind the ring, it reports missing data rather than inventing it.

## Routing versus action

Job changes route to native behaviour, need-band changes to appraisal, and new memories/health-band changes directly to deliberation. These are deliberately coarse initial heuristics, not a calibrated significance model. The route is recorded on the experience. No background loop automatically calls a model or forces an action.

`Coordinator.appraise(pawn, seq, backend, signal)` can assess an eligible appraisal event using only that pawn's perspective. A validated reflection score at or above 0.5 marks it for deliberation; otherwise native behaviour continues. This provisional threshold needs evaluation. Significant events already routed directly to deliberation cannot be downgraded through this method. Late results cannot modify a restored timeline. Appraisal cannot dispatch jobs; proposal acceptance remains a separate pawn decision.

`JevAppraiser` builds a documented System One request using one `noul` question. The value is a reflection score, **not a calibrated confidence of correctness**. It validates returned model, answer range and reported cost. Its authenticated transport is injected by the operator, not supplied to the pawn. No credentials are stored in source or passed through a character tool.

The separate SQLite `TrialBudget` reserves USD 0.002 for each attempt, allows at most three calls by default and has a default USD 0.02 ceiling. At the checked price and 32k context this is conservative; recheck provider pricing before live use. Reservations are never released, even on failure or cancellation, because an uncertain response may still be billable. Reported cost is recorded separately; a pricing overrun locks further attempts. Keep this ledger outside game checkpoint rollback. It limits future submissions, not what an external provider can charge for an already submitted request. No retries or unattended polling are enabled.

## Visible deliberation

A small blue ellipsis badge appears above a pawn during proposal deliberation. It carries a bounded wall-clock lease (decision timeout plus grace), clears on completion/failure, and expires after a crashed coordinator. Matching activity IDs and timeline epochs prevent stale clears. Badge state is ephemeral, not saved. Native jobs and game time continue unless the operator has paused the game. The badge currently represents **proposal deliberation**, not all pending attention records or strategic core planning.

## Verification and remaining scope

Unit tests cover ownership filtering, event deduplication/gaps, checkpoint cursor rollback, stale appraisal rejection, indicator cleanup, malformed provider output, conservative spending reservations and provider pricing overruns. Real-game acceptance covers populated self facts, captured/routed native job events, continued ticking with a visible badge, and paired save/reload. New-memory detection, health-band changes and long-run retention are not claimed as induced real-game acceptance cases yet.

Live Jev inference has not been verified. A general LLM backend, attention scheduler, rich conversation/negotiation, standing intentions, core planner and OpenClaw plugin are still future work.
