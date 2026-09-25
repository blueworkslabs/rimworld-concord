# RimWorld Concord

**Shared fate, not shared will.**

An experimental RimWorld mod about an ancient AI core and three colonists. The core
watches, reasons and proposes. Each colonist decides for themselves. Whatever they
agree to is carried out by ordinary RimWorld jobs, and the game's receipts, not the
models' prose, decide what actually happened.

Site and dev diary: <https://rimworld-concord.pages.dev/> · Vision: [docs/VISION.md](docs/VISION.md)

## Status

An experimental vertical slice in a private lab, **not a playable mod or an unattended
AI colony**. Live-model observations remain finite and pre-declared, with no model-choice rerolls.
The new ongoing policy has no arbitrary turn ceiling; historical trial allowances
remain unchanged.

| Capability | Native mechanics | Live-model evidence |
|---|---|---|
| Move to a nearby grounded cell | yes | yes |
| Haul an exact stack (≤10 per trip as offered, ≤3 trips) | yes | yes, including core-proposed work |
| Rescue a downed colonist into an exact medical bed | yes | yes, with a scripted core |
| Build a campfire (20 wood) | yes | scripted game tests only |
| Cook simple meals on a campfire (≤3) | yes | scripted game tests only |
| Eat, chosen by the pawn itself | yes | yes |
| Native tagged-zone haul spike | [partial scripted checks and live rehearsal](docs/trials/NATIVE_HAUL_FREEZE.md): native meal resumption, helper/overlap, scoped timing and coordinator-process cold restore | [single frozen recording complete](docs/trials/NATIVE_HAUL_LIVE.md); [receipt findings](docs/trials/NATIVE_HAUL_LIVE.md#technical-findings--released-after-the-recording-only-read) available; [game-side migration approved](docs/trials/NATIVE_HAUL_GATE_C.md); three fixes block the next live run |
| Hauling migration | [Strict fallback](docs/trials/HAULING_MIGRATION_STRICT.md): Prior strict suite 15/16; mixed-item gap and rescue now pass targeted rechecks; both matched quotas complete | Merged strict; growing parked, B1 2/2; urgent-exempt wake rule verified; [single signed ordinary-play recording](docs/trials/HAULING_MIGRATION_LIVE.md) complete; [post-read audit](docs/trials/HAULING_MIGRATION_LIVE.md#technical-findings--released-after-the-recording-only-read): three returned offers rejected, no hauling intent opened; Gate C verdict pending |

Also built and exercised in bounded trials: counteroffers with fresh consent, "not
now" replies, pawn-originated requests, addressed pawn-to-pawn speech, private
evidence-linked outlooks, an in-game crew log, coarse shared Food/Rest status, local
food sightings, and a live, event-driven core that proposes, asks and follows up.

The observer now has a compact, public-only sidebar with an expandable journal. A
75-second **scripted** recording pilot checks capture overhead and basic presentation;
Gemini’s two-pass review recovered the main sequence but invented a message and
misquoted text. The receipt check helped, but also needed checking. See
[video feedback evidence](docs/evidence/video-feedback-pilot.json) and
[crew log and recording](docs/CREW_LOG.md).

Native Luna now runs core questions, pawn answers and reflections during continuous
play, without a fixed turn count. In the first corrected three-minute check, Beatrice
ate 9 berries and the core closed her three linked topics; two Alvin choices failed
fresh availability checks. The last core turn was cancelled at the observation deadline.
Initial schema failures are preserved. [Integration evidence](docs/evidence/luna-ongoing-integration.json).

A six-answer offline Luna/Terra comparison found stale explanation errors in both,
despite valid actions and correct receipt-backed closure. Luna remains the default;
automatic escalation is not justified by this small selected sample.
[Diagnosis and comparison](docs/ONGOING_GROUNDING.md).

Core requests now separate current records, attributed speech, available choices
and dated planner interpretations. Eating failures have specific validation codes.
Scripted native checks and restart passed; **better model grounding remains untested**.
[Source contract](docs/CORE.md#source-separation-in-model-requests) ·
[verification evidence](docs/evidence/fresh-facts.json).

A ten-minute continuous Luna scene is now recorded: three chosen eating actions
consumed 39 berries; one other eating choice was rejected as stale. No work or cooking
followed. Native self-care also occurred independently. The run preserved a topic-limit
failure and deadline cancellation. [Recording and checked findings](docs/RECORDED_SCENE.md#result).

Not yet shown: the live core turning a need into a multi-step plan (build, then cook),
long-run character consistency, automatic model escalation, the gravship
campaign, or an installer for players.

Next: moving the game side from hand-built ordered jobs to RimWorld's own planner
(tagged zones, blueprints, bills); see [NATIVE_INTENTS](docs/NATIVE_INTENTS.md).

What happened when: [HISTORY](docs/HISTORY.md) · every trial: [trial ledger](docs/trials/README.md) · what's next: [ROADMAP](docs/ROADMAP.md)

## How it works

1. The C# mod observes the game and executes validated native jobs (`mod/`).
2. A TypeScript coordinator owns characters, offers, consent, scheduling and
   checkpoints in SQLite (`src/`).
3. Each model call gets a narrow, self-describing perspective and a menu of real
   options, and returns one structured choice. No action tools, game handle or database.
4. Consent, identity, deduplication and timeline safety are enforced below the models.

Details: [ARCHITECTURE](docs/ARCHITECTURE.md). All documentation: [docs/README.md](docs/README.md).

## Development

Node 22.13+ (CI uses 22.23.2). Node's built-in SQLite prints an experimental warning;
that is expected.

```bash
npm ci
npm test                       # tsc + node --test, same as CI
node diary/build.mjs --check   # validate diary entries
```

The mod needs Mono `mcs` and an owned RimWorld 1.6 installation. Reference assemblies
are never committed.

```bash
bash scripts/build-mod.sh /path/to/RimWorldLinux_Data/Managed /path/to/Mods/HarmonyMod/Current/Assemblies/0Harmony.dll   # -> mod/Assemblies/Concord.dll
```

## Running in the real game

The mod activates only in the private lab: RimWorld must run with `-rimworld-lab`,
`RIMWORLD_LAB_ROOT` must be set, and the save profile must match. Lab setup and
operation: [scripts/lab/README.md](scripts/lab/README.md).

Deploy `mod/About`, `mod/Defs` and `mod/Assemblies` to the lab's `game/Mods/Concord`,
enable `blueworkslabs.concord`, and restart the game after mod changes. The foundation
acceptance uses scripted decisions and no models:

```bash
export RIMWORLD_LAB_ROOT="$HOME/rimworld-lab"
python3 "$RIMWORLD_LAB_ROOT/bin/lab.py" start
npm run lab:acceptance          # build + scripts/run-lab.sh under the lifetime lock
# stop and start the lab, then check a cold restore:
bash scripts/run-lab.sh --cold
python3 "$RIMWORLD_LAB_ROOT/bin/lab.py" stop
```

Feature trials have their own launchers; see [EVALUATION](docs/EVALUATION.md#running-trials).

## Authority and trust

- Only the bound pawn's handle can answer an offer. The core can propose, ask and
  wait. It cannot accept for anyone, and it cannot make anyone eat.
- The game rejects stale epochs, reused action IDs with changed payloads, and
  infeasible moves, hauls, rescues, builds, cooking or eating.
- A pawn's model sees its own perspective plus explicitly shared facts (coarse
  Food/Rest bands, addressed messages, local sightings). The core sees an explicit
  allow-listed view, never private memories or outlooks.
- This is an application boundary, not a sandbox. The file bridge, SQLite and the
  operator (`inspect()`, `LabBridge.admin()`) are trusted.
- A lab shutdown save is not a paired checkpoint. Keep a database together with the
  game saves it references.

## Layout

```text
mod/               C# mod: observation, native jobs, action ledger, crew-log tab
src/               Coordinator, perspectives, core planner, attention, model adapters
trials/            Trial runners, fixtures and offline scorers
tests/             Node test suite
scripts/           Launchers, fixtures, mod build; scripts/lab/ is the lab harness
docs/              Documentation; docs/evidence/ holds sanitized trial evidence
diary/, site/      Static site and dev diary (Cloudflare Pages)
adapters/openclaw/ Planned operator plugin contract (not installed)
```

MIT licensed; see [PROVENANCE](docs/PROVENANCE.md). Contributor and agent rules:
[AGENTS.md](AGENTS.md).
