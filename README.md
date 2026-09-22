# RimWorld Concord

**Shared fate, not shared will.**

An experimental foundation for an ancient AI core and three autonomous colonists. The core proposes strategy; each pawn decides whether and how to cooperate. Native RimWorld mechanics remain responsible for physical execution.

## Status

A bounded experimental vertical slice, not a playable campaign or unattended AI colony:

- A core proposes movement, bounded hauling or rescue; an identity-bound pawn accepts, refuses, or counterproposes.
- Accepted movement, hauling or rescue becomes a real native RimWorld job; refusals and counters do not execute it.
- Coordinator persists character memories, commitments and an ordered audit trail in SQLite.
- Duplicate action IDs do not cause duplicate effects; game reload creates a new epoch, rejecting old decisions.
- Quiescent checkpoints pair an immutable game save/hash with character state; restore forks a timeline.
- Bounded asynchronous decisions expose `deliberating` activity while native simulation can continue.
- Self-perspectives include native traits, skills, needs, surviving memories and direct relations.
- Selected native events are archived, routed and projected only into their owning pawn's experience stream.
- An expiring in-game thinking badge appears during proposal or event-triggered deliberation without pausing simulation.
- A bounded attention pump consumes captured events, coalesces repeated signals and applies pawn-owned responses; verified with scripted backends.
- A bounded Jev appraisal adapter is implemented against the documented API with mocked tests, one live synthetic fixture and two real-game live appraisals. Both game scores retained native behavior. See the [bounded live runner](docs/LIVE_APPRAISAL.md).

- A tool-isolated Claude Code Max backend completed one live pawn decision and real movement. A subsequent reliability trial completed event-triggered refusal in both paused and continuous modes, with paired and cold restore verified. See [live deliberation](docs/LIVE_DELIBERATION.md).

A subsequent [three-pawn negotiation trial](docs/NEGOTIATION.md) completed a live counter → revised offer → fresh acceptance → movement exchange. Three real self-views plus labelled authored preferences were checked over two sequential decisions each; the core replies were scripted. Paired and cold restore passed. This is not emergent-personality evidence.

[Bounded hauling](docs/HAULING.md) adds exact item/storage choices and pawn-owned consent for up to three trips, with withdrawal, needs and expiry stops. Scripted multi-trip/cold-restore checks and a live three-pawn negotiation retained both delivered supplies and a rejected trip. Active-job checkpoints and long-run character quality remain unproven.

[Bounded rescue](docs/RESCUE.md) adds one exact downed colonist / medical-bed agreement, with pawn-owned withdrawal and native validation. This is not capture or treatment. A bounded live [request and replacement trial](docs/ALTERNATIVE_REQUESTS.md) completed exact-bed rescue; broader judgment remains unproved.

The read-only [Concord crew log](docs/CREW_LOG.md) separates addressed messages from recorded outcomes and shows receipt-based agreement progress. Scripted native UI and game-only / paired / cold restore checks passed; private reflections are excluded. Future character, social and human-contact directions are recorded in the [playable plan](docs/PLAYABLE_DIRECTION.md).

Explicit [timing modes](docs/DECISION_TIMING.md) preserve human pauses and let Chitchat and DeepTalk queue without cancelling thought. Continuous play remains the default.

See [acceptance](docs/ACCEPTANCE.md) for measured results and limitations, and [roadmap](docs/ROADMAP.md) for what is not built.

## Layout

```text
mod/                  C# local game action bridge and saved action ledger
src/protocol.ts       Narrow action, observation and backend contracts
src/coordinator.ts    Proposals, identity binding, decisions, outcomes, checkpoints
src/store.ts          SQLite state, audit events and paired checkpoint metadata
src/lab-bridge.ts     Trusted staging transport and separate admin controls
src/backends.ts       Scripted decisions for repeatable mechanics tests
src/routing.ts        Native event attention routing
src/attention.ts      Bounded attention pump and reflection response contract
src/appraisal.ts      Jev question/response validation and separate trial budget ledger
src/claude-decision.ts Native Claude CLI with tool isolation and bounded trial accounting
scripts/lab/          Reused working lab controls; NOT a character tool surface
adapters/openclaw/    Integration contract; no installed OpenClaw plugin yet
docs/                 Design decisions, model research, provenance, evidence
```

## Local development

Node 22.13+ (validated on 22.23.2), npm, and Mono `mcs` for the mod:

```bash
npm ci
npm test
bash scripts/build-mod.sh /path/to/RimWorldLinux_Data/Managed
```

Reference assemblies come from an owned RimWorld 1.6 installation. Game/DLC binaries, assemblies, saves, databases and credentials are never committed. Node 22's SQLite implementation emits an experimental warning.

## Real-game test

The current mod activates only with `-rimworld-lab` and an explicitly configured `RIMWORLD_LAB_ROOT`; the save profile must match its `profile` directory. This is a development harness, not a portable end-user installer. See [lab setup](scripts/lab/README.md).

Deploy `mod/About`, `mod/Defs` and the compiled `mod/Assemblies` to the private lab's `game/Mods/Concord`, enable `blueworkslabs.concord`, and restart the game after mod changes. Preserve the original ModsConfig backup. Run the built coordinator on the same staging host:

```bash
export RIMWORLD_LAB_ROOT="$HOME/rimworld-lab"
python3 "$RIMWORLD_LAB_ROOT/bin/lab.py" start
bash scripts/run-lab.sh
```

The script acquires a lifetime process lock. Do not run another coordinator or manually manipulate the domain mailbox concurrently. It loads the disposable `lab-initial` fixture, writes receipts under `.runtime/`, and leaves the game paused. To verify a cold restore after a stop/start, use the same lock with `node dist/src/acceptance.js --cold`. Finish with `lab.py stop`; Android and RimWorld remain mutually exclusive workloads.

A copied lab-only shutdown save does **not** automatically become a paired Concord checkpoint. Restore through the coordinator using the checkpoint name, SQLite database and matching game save; copying only a `.rws` is insufficient. Checkpoints currently require completed/reconciled actions. Do not overwrite or prune referenced saves independently of their database.

## Authority and trust

Model backends receive only their own pawn's supplied perspective and proposal. Their typed response cannot choose another actor or access admin operations. Core handles can propose but cannot execute. The coordinator binds pawn identity; the game rejects invalid actors, epochs, duplicate payload mismatches and infeasible movement, hauling or rescue.

This is an application boundary, **not** a sandbox for hostile plugin code or the local operator. The file bridge and SQLite database are trusted local components. Future live runtimes must not inherit shell/file/admin access that bypasses the domain tools. `inspect()` and `LabBridge.admin()` are operator-only. Current perspective filtering is intentionally narrow, not a full sight/hearing/rumour model.

## Direction

Smooth continuous play is the goal. Pauses are appropriate for controlled tests or explicitly requested extended planning, not every model call. The planned cognition stack is native habits → fast appraisal → deliberate reasoning, with personality across all layers and direct escalation for significant conflicts. The in-game deliberation badge is implemented. An opt-in bounded attention pump consumes event routes. Native-client live decisions and reflections now have bounded paused/continuous evidence. Long-running operation and broader goals remain to be proved. See [attention consumption](docs/ATTENTION.md).

See [architecture](docs/ARCHITECTURE.md), [narrative](docs/NARRATIVE.md), and [model access](docs/MODELS.md).

The [interruption policy](docs/INTERRUPTIONS.md) distinguishes locally observed
rescue contradictions from missing shortlist information. Its bounded live
follow-up preserved a prose/action mismatch, not a completed live rescue.

[Explicit reflection choices](docs/INTENT_CHOICES.md) name their executable effects
and validate agreement scope. A single live follow-up produced matching choice
and explanation; broader consistency and pawn-originated alternatives remain open.
