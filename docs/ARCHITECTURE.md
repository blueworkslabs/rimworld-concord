# Architecture

Concord splits responsibility so that no model is ever trusted with authority. The
game executes and records, the coordinator decides who may do what and remembers
everything, and each model call only chooses among options it was given.

## Components

```text
 Minds (replaceable, tool-free)      Claude pawn/core calls · Jev appraisal · scripted backends
        ▲ perspective + menu   │ one validated choice
        │                      ▼
 Coordinator (TypeScript, SQLite)   perspectives · consent · attention · core scheduling · checkpoints
        ▲ observations, events, receipts   │ actions with IDs
        │                                  ▼
 Concord mod (C#, inside RimWorld)  shortlists · native jobs · action ledger · crew-log tab
        │
 RimWorld                           jobs, needs, pathing, skills, social memories, storyteller
```

**The mod** (`mod/`) observes each pawn's own facts, samples native events, builds
bounded shortlists of what is physically possible nearby, validates every requested
action again at dispatch, runs native jobs, and keeps a saved ledger of action
records. It also draws the read-only crew-log tab and owns decision-pause claims. One
file per capability: `Movement.cs`, `Hauling.cs`, `Rescue.cs`, `Production.cs`
(campfire and cooking), `Eating.cs`, plus `Awareness.cs`, `Casualties.cs`,
`FoodObservation.cs`, `SharedStatus.cs`, `DecisionPause.cs`, `CrewLog.cs`.

**The bridge** (`src/lab-bridge.ts`) is a file mailbox under
`$RIMWORLD_LAB_ROOT/concord/`. Operator actions (save, load, fixtures) go through the
lab harness, never through a model. Exactly one coordinator process holds the
lifetime lock.

**The coordinator** (`src/coordinator.ts`) serializes every operation. It hands out
identity-bound handles: `core()` can propose, withdraw pending offers, adopt counters
and answer requests; `pawn(id)` can decide, withdraw its own agreement, request a
fresh offer and stop eating. State lives in SQLite (`src/store.ts`): one state row, an
append-only event log committed atomically with it, and checkpoint records.

**Minds** receive a projection and return one structured choice:
scripted backends (`src/backends.ts`) for regression, Claude through the native CLI
for pawns and the core (`src/claude-decision.ts`), and Jev as an optional fast
appraiser (`src/appraisal.ts`). See [MODELS](MODELS.md).

**Trial ledgers** (`src/decision-trials.ts`, `TrialBudget` in `src/appraisal.ts`) are
separate SQLite files that count every model attempt. They never roll back with a game
save.

## The main loop

1. The coordinator ingests game state and new native events. Each event goes only to
   the pawn who experienced it and is routed to native behaviour, appraisal or
   deliberation ([ATTENTION](ATTENTION.md)).
2. The core, when a public change wakes it, sees an allow-listed view and proposes
   listed work, adopts a counter, asks one pawn a question, or waits ([CORE](CORE.md)).
3. The addressed pawn answers the offer: accept, refuse, counter or not now
   ([ACTIONS](ACTIONS.md)).
4. Acceptance persists an action ID, then dispatches it. The mod validates and runs a
   native job, and reports a receipt.
5. Receipts update agreement progress, the crew log and the core's view. Completion is
   whatever the receipt says, never what a model said.

## Invariants

### Consent

- Only the bound pawn's handle can answer an offer. Decisions are strictly validated:
  `accept`, `refuse`, `defer` ("not now") or `counter` with an alternative action.
- A counter executes nothing. If the core adopts it, it becomes a new offer that needs
  fresh consent; a thread allows at most two revisions.
- Replacing running work requires consent to the replacement and a confirmed stop of
  the old job before the new one is dispatched.
- Speech, topics and requests never create jobs. Concord-directed eating happens only when the pawn
  itself picks the `eat` option while answering a core question; native self-care
  can still eat independently.
- A model failure or timeout leaves the offer pending. It never turns into forced
  obedience or a fallback decision.

### Identity and deduplication

- Request IDs (transport) are distinct from action IDs (effects).
- An action ID is persisted before dispatch. The mod's saved ledger makes a repeated ID
  a no-op and rejects a reused ID with a different payload.
- After an uncertain dispatch, reconciliation asks the game's ledger before any
  re-dispatch of the same ID. There is no automatic retry of failed work.

### Timelines

- Every loaded game gets a fresh, unsaved epoch. Requests from an older epoch fail
  closed in the mod, and unknown external loads fail closed in the coordinator.
- A generation counter invalidates in-flight thoughts when the coordinator checkpoints
  or restores: offer decisions, reflections, encounter turns, core turns and answers are
  aborted and not retried. Late answers are discarded, never applied.

### Paired checkpoints

- A checkpoint pairs a paused game save (hashed) with the character state. It is only
  allowed when no action is in flight; between trips of a standing agreement is fine.
- Restore verifies the hash, marks the timeline as restoring, loads, and forks a new
  branch ID. Running core turns and in-progress answers become failed and running
  encounters are closed; nothing is retried.
- Cold restore is the same restore from a fresh process. Native pause-on-load advances
  one tick, so replay is not bit-identical.
- A database backup is only valid together with the saves it references.

### Knowledge

Each mind gets an explicit projection, never a spread of internal state:

- A pawn sees its own facts, needs (self-describing, unknown never zero), memories,
  outlook, messages addressed to it, its own shortlists, and explicitly shared facts:
  coarse Food/Rest bands of the crew, names of visible people, local food sightings.
- The core sees public and addressed information only: crew names, bands, agreements
  and receipts, messages and requests as attributed speech, grounded opportunities,
  food sightings. Never memories, outlooks or exact meters.
- The crew log shows an allow-list of messages and records, never reflections.

The full matrix is in [SOCIAL](SOCIAL.md#who-knows-what).

### Model isolation

Every Claude character call is a fresh CLI process with no action tools, no MCP
servers, no settings, no session persistence, a reduced environment and a fixed
model. `StructuredOutput` is a return-format mechanism, not an action tool. Jev
uses a protected HTTP transport; Luna's offline and ongoing decision routes use isolated native Codex app-server processes. Contextual schemas enumerate supplied choice IDs, and the coordinator revalidates
those choices before application. Counter-action payloads are a documented exception:
they use bounded strings, and fresh grounding is enforced when adoption creates an
offer, not when the counter is first recorded. See [MODELS](MODELS.md#isolation).

### Timing

Play is continuous by default; native routines keep running while a pawn thinks, with
a thinking badge over its head. Pausing the game at decisions is an explicit test
mode using owner- and epoch-scoped pause claims that expire on wall-clock time.

## Direction: native intents

The coordinator half of this architecture stays. The game half is changing: instead of
issuing ordered jobs from hand-built shortlists, the mod will turn accepted agreements
into tagged native intents (zones, blueprints, bills, designations) that pawns fulfil
through RimWorld's own work givers, restricted to the pawns who consented. Options will
come from the game's work scan, and perception from Harmony hooks on the game's own
events instead of 30-tick diffs. Receipts stay game-authored but become aggregate.
Rationale, consent mapping, trade-offs and the spike: [NATIVE_INTENTS](NATIVE_INTENTS.md).
Until then, everything above describes the current ordered-job model.

## Split-host trials

Live trials run the models on a host with the native logins and protected egress, and
the game on the lab host. The inference side reaches the lab over SSH; both sides
check they run the same build. Messages are line-delimited JSON, capped at 32,000
bytes per inference message and 16 MiB per receipt (`src/trial-wire.ts`), and each
inference lane is serialized (`src/inference-lane.ts`).

## Not built

No general remote API, no sandbox against a hostile operator or plugin, no full
perception model, no unattended inference, no campaign or gravship layer, no installed
OpenClaw plugin (the planned contract is in `adapters/openclaw/`), and no checkpoints
in the middle of an active job.
