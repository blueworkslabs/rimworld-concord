# Vision

## The idea

RimWorld tells stories through colonists with traits, needs and grudges, but those
colonists don't make plans. Concord began with a smaller question (could the game's
overlooked interactions become evidence-backed little stories?) and turned into a
bigger one: what if the colonists had a limited perspective of their own, persistent
commitments and meaningful choices, instead of just narrating what native behaviour
already did?

## The premise

Three colonists discover an ancient AI core in an old gravship. Reactivating it
sharpens their minds and binds all four protagonists to a shared fate. It also
triggers mechanoid pursuit, and survival means escaping or defeating that threat.

The core plans and proposes. The colonists keep their own wills: they can cooperate,
reinterpret requests, negotiate, refuse and come up with alternatives. Shared
dependence does not imply trust or obedience. A native storyteller supplies outside
pressure at first; an AI storyteller is optional. Quests could reveal the core's
history and the reason for the pursuit, and unlock capabilities.

This is our proposed scenario, not canon and not built. The current test colony is a
small desert fixture with three colonists (Alvin, Beatrice, Pedro), not the campaign.

## Principles

- **Shared fate, not shared will.** The core proposes; each colonist owns acceptance,
  counteroffers and refusal. Disagreement should come from character priorities and
  lead to meaningful alternatives, not random obstruction or dialogue followed by
  compulsory obedience.
- **Consequential action over dramatic dialogue.** The upgrade has to show in what
  colonists choose and do, not in explanations over unchanged native behaviour.
- **The game is the ground truth.** Speech is testimony, private thought stays
  private, and outcomes come from the game's receipts.
- **Deliberate communication, not mind-reading.** The core receives local observations, explicit
  shared-link telemetry and addressed communication—not private minds—and asks
  about what it doesn't know.
- **No manufactured drama.** No scripted refusals, no required conflict. Judge
  meaningful choices, not obedience or its opposite.
- **Work with RimWorld, not around it.** Colonists act through the game's own
  planner (designations, zones, bills, work priorities), so agreed work survives
  interruptions and new kinds of work come from the game rather than being rebuilt.
  See [NATIVE_INTENTS](NATIVE_INTENTS.md).
- **Smooth play is the target.** Native routines continue while colonists think;
  pausing is an explicit test or planning mode.
- **Legible to a viewer.** Someone watching should be able to follow a consequential
  choice, and who disagreed and why, without operator debug output.

## What watching should feel like

A target, not today's build. Over about ten minutes:

1. A need surfaces in the open: someone says it, or a shared status band turns amber.
2. A plan emerges in pieces. If someone bargains or refuses, it has a real
   consequence; cooperation and alternatives remain valid too.
3. Mostly quiet execution. The log says what everyone is waiting on, so silence reads
   as patience rather than a stall.
4. An interruption forces a rethink: hunger, a downed crewmate, something on the horizon.
5. A payoff you can see, and one thread left open for next time.

Later, the protagonists should be engaging through personality, charm and humour in
deliberate speech, without invented outcomes or published private thoughts. The crew
log is an evidence trail, not the final storytelling experience.

## Humans in the fiction

Recorded directions, not built:

- **Suggestions to the core:** input it weighs, not orders.
- **Letters to a colonist:** attributed information, not automatic truth or shared
  crew knowledge.
- **Comms-station conversations:** near-real-time talk while a colonist is at the
  console, situated and interruptible, delivered later when they're unavailable.
  Human presence shouldn't make every colonist permanently on call.

Each needs its own design for identity, delivery and in-world availability first.
Private thought, deliberate speech and verified outcome stay distinct throughout.

## Cheaper minds

We expect to run colonists on smaller, cheaper models eventually, so the interface
has to work for them: self-describing state, menus of currently valid choices, and
validation that doesn't depend on model capability. Models are compared on the same
fixed snapshots, measuring schema adherence, invented identifiers, grounding, latency
and usage separately from gameplay. More compliant JSON alone does not prove better
judgment. See [EVALUATION](EVALUATION.md).

## Open questions

Deliberately not fixed as canon yet:

- The bond: psychic or technological, what it carries, and what separation or death
  means. Proposed: bond consequences are never a punishment the core can trigger.
- The core's prior identity, what it remembers, and its authority over ship systems.
- Progression and endings; whether gradual trust can be progression.
- The balance between native habits and deliberate thought.
- Whether a fast appraisal model (rules + appraisal + LLM) beats rules + LLM on
  identical episodes.
- "While you were busy" microstories from the event archive, keeping recorded events
  separate from narrative interpretation.
