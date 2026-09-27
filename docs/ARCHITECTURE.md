# Architecture

Concord splits responsibility so that no model is ever trusted with authority. The
game executes and records, the coordinator decides who may do what and remembers
everything, and each model call only chooses among options it was given.

Status: everything on this page is implemented unless marked otherwise. Inline labels
summarise the evidence; per-capability detail (scripted-tested, mock-tested,
live-verified) is in the README status table and the linked topic docs.

## Components

```text
 Minds (replaceable, tool-free)      Claude CLI · Luna (Codex app-server) · Jev appraisal · scripted
        ▲ perspective + menu   │ one validated choice
        │                      ▼
 Coordinator (TypeScript, SQLite)   perspectives · consent · attention · core scheduling · checkpoints
        ▲ observations, events,    │ ordered actions with IDs;
        │ receipts, intent views   ▼ intent accept / exclude / stop
 Concord mod (C#, inside RimWorld)  shortlists · ordered jobs · haul intents + Harmony hooks ·
        │                           action ledger · crew-log tab · perception · player actions
        │                                  ▲ perceive · placement · act (no Coordinator)
        │                                  │
        │                           Harness arm (MCP server) ◄── external Codex controller
        ▼
 RimWorld                           jobs, work givers, needs, pathing, skills, social memories, storyteller
```

Two paths reach the game. The **character path** (coordinator, minds, consent) is the
rest of this page. The **harness path** lets an external agent perceive and act like a
player, minus draft; it bypasses the coordinator entirely ([HARNESS](HARNESS.md)).

**The mod** (`mod/`) observes each pawn's own facts, samples native events, builds
bounded shortlists of what is physically possible nearby, validates every requested
ordered action again at dispatch, runs native jobs, and keeps a saved ledger of action
records. For hauling it keeps tagged stockpile intents and their ledger, and Harmony
hooks record job and haul transitions. It also draws the read-only crew-log tab and
owns decision-pause claims. Harmony is a declared dependency (`mod/About/About.xml`,
never bundled); `Concord.cs` applies the patches at startup. Files:

- `Concord.cs`: the bridge mailbox and its op dispatch, the saved world state, the
  256-event ring, native sampling and the state export.
- Ordered work: `Movement.cs`, `Rescue.cs`, `Production.cs` (campfire and cooking),
  `Eating.cs`.
- Native hauling: `NativeIntents.cs` (tagged zones, intent ledger, lab-only test ops),
  `IntentPatches.cs` (Harmony hooks on job start/end, hauling, ingestion and
  interactions), `HaulBudget.cs` (per-trip pickup arithmetic).
- Observation and UI: `Awareness.cs`, `Casualties.cs`, `FoodObservation.cs`,
  `SharedStatus.cs`, `DecisionPause.cs`, `CrewLog.cs`.
- Harness: `Perception.cs` (read-only snapshot), `HarnessActions.cs` (player actions,
  placement query, saved receipts), `HarnessNarration.cs` (receipt-backed narration).

**The bridge** (`src/lab-bridge.ts`) is a file mailbox under
`$RIMWORLD_LAB_ROOT/concord/`: one JSON request, one response, serialized. Operator
actions (save, load, pause, fixtures) go through the lab's control script
(`bin/lab.py`), never through a model. Exactly one process holds the lab lock
(`concord/coordinator.lock`): a coordinator, or a benchmark pair script whose harness
arm servers refuse to start without it.

| Bridge op | Used by | Effect |
|---|---|---|
| `state` | coordinator | Full state export: pawns, action receipts, events, intents, stockpiles, clock, crew log |
| `move`, `rescue`, `build`, `cook`, `eat` | coordinator | One ordered job under a persisted action ID; returns the receipt |
| `cancel` | coordinator | Cancels one owned ordered action, or tombstones one never dispatched |
| `intent-accept`, `intent-exclude`, `intent-stop` | coordinator | Admit a pawn to a stockpile intent (the first acceptance tags the zone), exclude a pawn (refusal, deferral, withdrawal), operator stop |
| `crew-log`, `activity`, `decision-pause` | coordinator | Publish the crew-log report; thinking badge; pause claim |
| `perceive`, `placement` | harness | Read-only snapshot; native placement check. No state export, no job reconciliation |
| `act` | harness | One player action with a saved receipt ([HARNESS](HARNESS.md#actions)) |
| `lab-*` (about 29) | trials, operator | Lab-only fixtures and probes (zones, stacks, drafting, message history); never offered to a model |

**The coordinator** (`src/coordinator.ts`) serializes every operation. It hands out
identity-bound handles: `core()` can propose, withdraw pending offers, adopt counters
and answer requests; `pawn(id)` can decide, withdraw its own agreement, request a
fresh offer and stop eating. State lives in SQLite (`src/store.ts`): one state row, an
append-only event log committed atomically with it, and checkpoint records.

**Minds** receive a projection and return one structured choice:
scripted backends (`src/backends.ts`) for regression, Claude through the native CLI
for pawns and the core (`src/claude-decision.ts`), Luna through the native Codex
app-server for the core and pawns in ongoing mode (`src/codex-decision.ts`), and Jev
as an optional fast appraiser (`src/appraisal.ts`). See [MODELS](MODELS.md).

**The harness** (`src/harness/`; implemented, scripted-tested, and used in the scored
phase-1 benchmark) is the second path. An arm server (`trials/harness-mcp-server.ts`)
exposes MCP tools `observe`, `look`, `act`, `time` and `report_done` to an external
Codex controller and talks to the mod through the same bridge (`perceive`, `placement`,
`act`); the UI arm (`trials/ui-mcp-server.ts`) offers screenshots, clicks and keys
instead. Neither touches the coordinator, its consent machinery or its database. See
[HARNESS](HARNESS.md).

**Ledgers** (`src/decision-trials.ts`, `TrialBudget` in `src/appraisal.ts`, and the
`luna-ongoing-v1` ledger in `src/ongoing-usage.ts`) are separate SQLite files that
count every model attempt. They never roll back with a game save.

## The main loop

1. The coordinator ingests game state and new native events. Each event goes only to
   the pawn who experienced it and is routed to native behaviour, appraisal or
   deliberation ([ATTENTION](ATTENTION.md)).
2. The core, when a public change wakes it, sees an allow-listed view and proposes
   listed work, adopts a counter, asks one pawn a question, or waits ([CORE](CORE.md)).
3. The addressed pawn answers the offer: accept, refuse, counter or not now
   ([ACTIONS](ACTIONS.md)).
4. Acceptance is persisted before any game effect. Ordered work (move, rescue, build,
   cook) gets an action ID, then is dispatched; the mod validates, runs a native job and
   reports a receipt. A stockpile haul is admitted instead (`intent-accept`): pawns fill
   the tagged zone through their own hauling work, and progress returns as the intent's
   aggregate view (delivered, quota, per-pawn credit, status), not per-job receipts.
5. Receipts and intent views update agreement progress, the crew log and the core's
   view. Completion is whatever the game reports, never what a model said.

## Invariants

### Consent

- Only the bound pawn's handle can answer an offer. Decisions are strictly validated:
  `accept`, `refuse`, `defer` ("not now") or `counter` with an alternative action.
- A counter executes nothing. If the core adopts it, it becomes a new offer that needs
  fresh consent; a thread allows at most two revisions.
- Replacing running work requires consent to the replacement, a confirmed exclusion
  from the old stockpile haul and empty hands before the new work is dispatched
  ([ACTIONS](ACTIONS.md#replacement-handover)).
- Refusal, deferral and withdrawal of a stockpile haul bind in the game: the pawn is
  excluded from that intent, and the exclusion is retried until the game confirms it.
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
- Intent admissions and exclusions are keyed by intent and pawn, persisted before they
  are sent, and resent until the game's intent view confirms them. While a pawn's
  exclusion is unconfirmed it gets no new offer and no ordered dispatch.

### Timelines

- Every loaded game gets a fresh, unsaved epoch. Requests from an older epoch fail
  closed in the mod, and unknown external loads fail closed in the coordinator.
- A generation counter invalidates in-flight thoughts when the coordinator checkpoints
  or restores: offer decisions, reflections, encounter turns, core turns and answers are
  aborted and not retried. Late answers are discarded, never applied.

### Paired checkpoints

- A checkpoint pairs a paused game save (hashed) with the character state. It is
  refused while any pawn holds an ordered-job or eating commitment; between meals of a cooking
  agreement is fine. A stockpile haul holds no commitment, so a checkpoint while its
  intent is open is allowed: the save carries the mod's intent ledger, and queued
  exclusions stay in the character state.
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
  food sightings, the colony clock and the configured stockpile hauls with their
  aggregate progress. Never memories, outlooks or exact meters.
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

## Native intents and ordered jobs

Two execution models coexist.

**Hauling is a native intent** (implemented; scripted-tested on the real game; Gate C
passed on the game side in ordinary live play, crew-side follow-ups open). The operator
freezes a list of stockpile hauls (`configureNativeHauls`); the core offers them as
`haul-zone` actions. The first acceptance tags the stockpile in the game; accepted pawns
fill it through RimWorld's own hauling work givers, others may help and are credited as
helpers, and the mod's ledger reports aggregate progress. Harmony hooks record job and
haul transitions next to the 30-tick sampling. The ordered haul was retired in
[#80](https://github.com/blueworkslabs/rimworld-concord/pull/80): `haul-zone` is the only
haul action, and a store or checkpoint holding an old ordered `haul` fails to open or
restore rather than being migrated (`tests/retired-actions.test.ts`). Details:
[ACTIONS](ACTIONS.md#stockpile-haul), [MIGRATION_HAULING](MIGRATION_HAULING.md),
rationale and consent mapping in [NATIVE_INTENTS](NATIVE_INTENTS.md).

**Move, rescue, build, cook and eat stay ordered jobs** from hand-built shortlists,
with action IDs and per-job receipts. The native construction/cooking migration was
superseded by phase 2 ([PHASE2](PHASE2.md)); it is not implemented.

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
in the middle of an active ordered job.
