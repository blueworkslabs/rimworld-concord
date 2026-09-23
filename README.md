# RimWorld Concord

**Shared fate, not shared will.**

An experimental RimWorld mod about an ancient AI core and three colonists. The core
watches, reasons and proposes. Each colonist decides for themselves. Whatever they
agree to is carried out by ordinary RimWorld jobs, and the game's receipts, not the
models' prose, decide what actually happened.

Site and dev diary: <https://rimworld-concord.pages.dev/> · Vision: [docs/VISION.md](docs/VISION.md)

## Status

An experimental vertical slice in a private lab, **not a playable mod or an unattended
AI colony**. Every live-model run is a finite, pre-declared trial with no rerolls.

| Capability | Native mechanics | Live-model evidence |
|---|---|---|
| Move to a nearby grounded cell | yes | yes |
| Haul an exact stack (≤10 per trip as offered, ≤3 trips) | yes | yes, including core-proposed work |
| Rescue a downed colonist into an exact medical bed | yes | yes, with a scripted core |
| Build a campfire (20 wood) | yes | scripted game tests only |
| Cook simple meals on a campfire (≤3) | yes | scripted game tests only |
| Eat, chosen by the pawn itself | yes | yes |

Also built and exercised in bounded trials: counteroffers with fresh consent, "not
now" replies, pawn-originated requests, addressed pawn-to-pawn speech, private
evidence-linked outlooks, an in-game crew log, coarse shared Food/Rest status, local
food sightings, and a live, event-driven core that proposes, asks and follows up.

Not yet shown: the live core turning a need into a multi-step plan (build, then cook),
long-run character consistency, useful live-core planning in unpaused play, the gravship
campaign, or an installer for players.

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
bash scripts/build-mod.sh /path/to/RimWorldLinux_Data/Managed   # -> mod/Assemblies/Concord.dll
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
