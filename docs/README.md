# Documentation

Start with the [project README](../README.md), then [VISION](VISION.md) and
[ARCHITECTURE](ARCHITECTURE.md). The topic documents are the current contracts: if
code and a contract disagree, one of them is a bug.

## Why and where

| Document | What it answers |
|---|---|
| [VISION](VISION.md) | What we're building, the principles, and the open questions |
| [ROADMAP](ROADMAP.md) | What's next and what's deliberately deferred |
| [RIMWORLD_INTERNALS](RIMWORLD_INTERNALS.md) | How RimWorld's jobs, think tree, hauling and events work, for the native-intents spike |
| [NATIVE_INTENTS](NATIVE_INTENTS.md) | The agreed direction for the game side: steer RimWorld's own planner instead of driving pawns |
| [HISTORY](HISTORY.md) | How we got here, one milestone per line |

## How it works (current contracts)

| Document | Covers |
|---|---|
| [ARCHITECTURE](ARCHITECTURE.md) | Components, data flow, and the invariants everything else relies on |
| [ACTIONS](ACTIONS.md) | Offers, consent and agreements; move, haul, rescue, build, cook, eat |
| [CORE](CORE.md) | The core planner: what it sees, what it may do, topics, wake-ups |
| [ATTENTION](ATTENTION.md) | Perception, event routing, interruptions, reflection, pacing, pauses |
| [SOCIAL](SOCIAL.md) | Negotiation, requests, pawn-to-pawn speech, private outlooks, who knows what |
| [MODELS](MODELS.md) | Model routes, isolation, perspectives, choice schemas, provider diagnostics |
| [CREW_LOG](CREW_LOG.md) | The in-game observer tab and agreement progress |

## Evidence

| Document | Covers |
|---|---|
| [EVALUATION](EVALUATION.md) | How we test and what counts as evidence; scorers; running trials |
| [Trial ledger](trials/README.md) | Every trial: question, limits, result, evidence file |
| [evidence/](evidence/) | Sanitized JSON evidence referenced by the ledger |

## Project housekeeping

[DEV_DIARY](DEV_DIARY.md) (diary workflow) · [PROVENANCE](PROVENANCE.md) (licensing
and sources) · [PROJECT_BASELINE](PROJECT_BASELINE.md) (the founding discussion,
2026-09-21, kept as written) · [lab harness](../scripts/lab/README.md) ·
[OpenClaw adapter plan](../adapters/openclaw/README.md)

Documents from before the 2026-09-23 cleanup (per-feature write-ups, `ACCEPTANCE.md`)
are preserved at commit
[`ac5baf8`](https://github.com/blueworkslabs/rimworld-concord/tree/ac5baf8d5044cdfaef9666e75249fc897a66a553/docs);
the trial ledger links the trial-specific write-ups. The earlier
[narrative note](https://github.com/blueworkslabs/rimworld-concord/blob/ac5baf8d5044cdfaef9666e75249fc897a66a553/docs/NARRATIVE.md)
and [visibility note](https://github.com/blueworkslabs/rimworld-concord/blob/ac5baf8d5044cdfaef9666e75249fc897a66a553/docs/CORE_VISIBILITY.md)
remain available there too.
