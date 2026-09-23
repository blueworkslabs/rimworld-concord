# Concord: starting point

Recorded 21 September 2026 from the initial project discussion. This is a dated
design baseline, not a promise of finished features or an immutable specification.
Keep this historical account intact; document later decisions separately.

## Why this experiment exists

We began by asking whether RimWorld's overlooked interactions could be surfaced
as evidence-backed little stories. Saves retain fragments, not a complete social
history. The discussion moved from noticing stories to giving their participants
more agency: could a colonist have a limited perspective, persistent commitments,
and meaningful choices instead of merely narrating what native behaviour did?

## Agreed direction

- Four protagonists: an ancient AI core and three cognitively enhanced colonists.
  In the proposed Odyssey-inspired campaign, the pawns discover the core in an old
  gravship; activation binds their fates and awakens mechanoid pursuit. This is our
  proposed scenario, not a claim about a completed campaign or exact vanilla lore.
- Shared fate, not shared will. The core proposes strategy, but each pawn owns
  acceptance, reinterpretation, negotiation and refusal. Disagreement should follow
  character priorities and produce meaningful alternatives, not random obstruction
  or dialogue followed by compulsory obedience.
- A native storyteller supplies external pressure initially. An AI storyteller is
  optional. Quests may reveal the core's past, explain mechanoid hostility and unlock
  capabilities; their content and progression remain open.
- The human starts as observer/test director and may communicate through the core.
  Debug intervention is separate from in-world authority.
- Smooth gameplay is the goal: native routines continue while deliberation is
  pending, with a visible indicator. Tests and explicit extended planning may pause.

## Preliminary architecture

The native C# mod owns physical validation and execution. A standalone TypeScript
coordinator with SQLite owns character state, filtered perspectives, commitments,
event ordering, scheduling and paired game/character checkpoints. Replaceable
decision workers receive only their permitted perspective and supported choices.
OpenClaw is planned as an operator interface and optional execution adapter, not
the colony's authoritative memory. Pi remains an optional runtime candidate.

Three speeds of cognition are the working model: native habits, bounded contextual
appraisal, and LLM deliberation. Jev is a candidate for appraisal, not a mandatory
dependency. Personality should inform all layers. Significant events can bypass
appraisal and trigger deliberation directly. Native execution does not require a
model call per tick; saved commitments may eventually guide routine work.

## Still open

The link's psychic versus technological nature, what information it carries,
its survival consequences, the core's history, the reason for pursuit, quest
progression and endings remain undecided. A limited deliberate-communication link
and consequences the core cannot weaponize were proposals, not settled mechanics.
The core's authority over ship systems, richer pawn actions, model/runtime choice,
interruption rules and the practical balance between habits and deliberation need
experiments. Compare rules plus LLM against rules plus Jev plus LLM before making
the middle layer a requirement.

## What existed when this was recorded

A real-game lab and a narrow scripted proposal/decision/movement loop, paired
save/reload, selected pawn-specific experiences and a visible thinking badge had
been verified. The Jev adapter was mock-tested only. Autonomous attention handling,
live in-game inference, strategic core planning, the OpenClaw plugin and the actual
campaign were still ahead. See [architecture](ARCHITECTURE.md),
[acceptance](https://github.com/blueworkslabs/rimworld-concord/blob/ac5baf8d5044cdfaef9666e75249fc897a66a553/docs/ACCEPTANCE.md), and [roadmap](ROADMAP.md) for implementation details.
