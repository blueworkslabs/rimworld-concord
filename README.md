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
| Ordered exact-stack hauling | retired in [#80](https://github.com/blueworkslabs/rimworld-concord/pull/80) | historical evidence retained; not an executable capability |
| Rescue a downed colonist into an exact medical bed | yes | yes, with a scripted core |
| Build a campfire (20 wood) | yes | scripted game tests only |
| Cook simple meals on a campfire (≤3) | yes | scripted game tests only |
| Eat, chosen by the pawn itself | yes | yes |
| Agent harness (perceive and act like a player, minus draft) | [phase definition](docs/HARNESS.md); perception/actions v1 and [placement query verified](docs/evidence/placement-2026-09-26/README.md) | [Cold alerts/digest](docs/evidence/perception-alerts-2026-09-26/README.md), [scripted T1/API/save-load passed](docs/evidence/harness-actions-2026-09-26/README.md); [three scored T1 pairs](docs/evidence/benchmark-scored-three-2026-09-26/README.md): 6/6 complete; no consistent colony-time advantage; median 58.7s harness / 106.6s UI; limited to this task, billed USD unavailable |
| T2/T3 benchmark | [frozen predicates and scripted viability](docs/evidence/benchmark-colony-setup-2026-09-26/README.md) | no scored model results yet |
| Annotate-only Jev grounding over live core replies | wired in the host runner (`--annotate-grounding`), [gates nothing](docs/trials/JEV_ANNOTATE.md) | not yet exercised; first use is the construction and cooking scene |
| Offline Jev wake/grounding replay | no gameplay | [authorized retry: 29 valid answers](docs/trials/JEV_REPLAY.md#authorized-retry--2026-09-25-report-first) and [E2 over the native-haul turns: 27 valid](docs/trials/JEV_REPLAY.md#e2-result--astra-2026-09-25-report-before-interpretation); transport failures retained; no threshold/routing decision |
| Native tagged-zone haul spike (historical) | [scripted and live evidence](docs/trials/NATIVE_HAUL_LIVE.md) retained | Superseded by the ordinary-play migration below |
| Native stockpile hauling | strict holds; ordered implementation retired; [deletion check](docs/trials/HAULING_RETIREMENT.md): 75/75, two holders, paired/new-coordinator restore | [Migration Gate C passed on the game side](docs/trials/HAULING_MIGRATION_GATE_C.md); crew-side follow-ups remain; growing parked at B1 2/2 |
| Native construction/cooking | [Gate A/B design](docs/MIGRATION_PRODUCTION.md) signed; corrected boundaries independently reviewed | planned: implementation and scripted acceptance next; no gameplay proof or live freeze |

Post-Gate-C [follow-ups 6–7](docs/trials/ATTENTION_EVICTIONS.md) add bounded review nudges and preserve pending attention over native churn. The historical replay reproduces 17 losses and predicts 0 under the two buffer corrections with recorded cursors fixed; the later [same-setup live regression](docs/trials/PIPELINE_REGRESSION.md) records zero losses, visible heard-message acknowledgment and open-meal question exclusion. Two separate first-review nudges fired; a complete two-review stop chain remains unexercised live.

Post-Gate-C [follow-ups 1–5](docs/trials/POST_GATE_C_FOLLOWUPS.md) add archive removals, request acknowledgments, meal-answer protection and recorded trimmed inputs. Initial verification is split between offline checks and scripted eating; the later [pipeline regression](docs/trials/PIPELINE_REGRESSION.md) adds scoped live evidence, not a new scene verdict.

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
