# RimWorld Concord

**Shared fate, not shared will.**

An experimental foundation for an ancient AI core and three autonomous colonists. The core proposes strategy; each pawn decides whether and how to cooperate. Native RimWorld mechanics remain responsible for physical execution.

## Status

An experimental vertical slice, not a playable campaign or unattended AI colony:

- Pawns negotiate and carry out bounded movement, hauling, rescue, campfire construction and cooking. An opt-in bounded live core proposes grounded work; scripted planning remains a regression baseline.
- Nearby pawns can exchange one optional opener and reply; attributed speech does not authorize work or automatically change beliefs. See [social contract](docs/SOCIAL_EXCHANGE.md).
- Consent, native outcome checks and paired/cold restore are enforced below the model layer.
- The in-game crew log separates addressed messages, observed events and work records; private outlooks remain private.
- Optional outlook revisions can retain attributed received speech. Automated persistence/privacy, native retention and paired/cold restore have been verified in bounded trials. This is not proof of long-term personality.
- Claude has bounded real-game evidence; Luna has offline contract evidence, not a game backend. Sustained character quality remains unproved.
- Current focus: [a visible campfire/cooking loop](docs/CAMPFIRE_MILESTONE.md), with separately consented work and coarse shared-link Food/Rest telemetry. Scripted native resource-use and restart checks pass. Three live trials exposed a question/offer-link contract mismatch; a subsequent [six-call offline check](docs/CORE_CONTRACT_CHECK.md) passed with the corrected menu. A [short in-game follow-up](docs/CORE_FOLLOWUP.md) delivered three pawn replies, but one provider-turn-limit rejection and no work offers keep planning unproved. The [provider investigation](docs/PROVIDER_FAILURE_PROBE.md) reproduced an overlong-topic formatting repair and adds a narrowly traced core recovery rule, verified offline and exercised in a [mixed native follow-through](docs/RECOVERY_FOLLOWTHROUGH.md): one accepted repair, one rejected stream shape, and no work. After [identity-aware accounting](docs/PROVIDER_MESSAGE_ACCOUNTING.md), a [fresh native check](docs/IDENTITY_FOLLOWTHROUGH.md) accepted all six core turns and three pawn replies, including a split-event repair; still no work or observed eating. See [roadmap](docs/ROADMAP.md), [evidence](docs/ACCEPTANCE.md), [history](docs/HISTORY.md) and [diary](https://rimworld-concord.pages.dev/).

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

Model backends receive only their own pawn's supplied perspective and proposal. Their typed response cannot choose another actor or access admin operations. Core handles can propose but cannot execute. The coordinator binds pawn identity; the game rejects invalid actors, epochs, duplicate payload mismatches and infeasible movement, hauling, rescue or production.

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
