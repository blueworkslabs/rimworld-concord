# Working with RimWorld's planner

**Status: agreed direction, not implemented.** This describes where the game side of
Concord is heading and how we get there. The current behaviour is still the
ordered-job model in [ACTIONS](ACTIONS.md). Based on Fable's review of `mod/` after the
recorded scene (2026-09-24); RimWorld internals cited from memory must be confirmed
in the 1.6 assemblies before we build on them.

## The problem

Concord currently *drives* pawns. Each capability is a hand-built scanner, validator
and custom `JobDriver`, issued with `TryTakeOrderedJob` (the same path as a player's
right-click), plus a 30-tick diff of needs, jobs and memories for perception. There
are no hooks into the game's own events, and nothing touches work priorities,
designations, zones, bills or the think tree. Test fixtures switch all work priorities
off, so pawns idle unless the core orders something.

That puts two planners in charge of one pawn, and our own runs show the seams:

- **Competing planners.** Native hunger fed a pawn while its Concord eating choice was
  in flight, and the choice was rejected as stale. "Food visible, not locally
  available" failures in #61 and #64 are the same collision.
- **One-off orders instead of standing intent.** A haul stops when Food drops below
  35 %, the pawn eats natively, and the agreement is dead ("after-meal resumption is not
  automatic"). Native work never has this problem: it lives on the map as designations,
  haulables and bills, and pawns find it again after any interruption.
- **Exactness at the wrong layer.** Decisions take seconds to a minute; our contract is
  "this exact stack, this cell, this count, valid at this tick" at 60 ticks per second.
  In continuous play that guarantees stale rejections.
- **It doesn't scale.** Each capability costs a C# scanner, validator, `JobDriver`,
  TypeScript planner, receipts and docs. RimWorld has on the order of a hundred work
  givers; building, mining, growing, treatment and defence won't come from hand-rolling
  each one.

## The direction

**Stop driving pawns; steer the game's own planner.** RimWorld already has an intent
layer: the player's controls. Designations, blueprints, bills, stockpile zones, per-pawn
work priorities, schedules and allowed areas. Pawns fulfil them through work givers,
in priority order, interleaved with their own self-care, and they survive interruptions
because the intent is state on the map. That is "the core proposes, colonists execute",
done natively.

### What stays

Everything on the coordinator side: consent, receipts as truth, projections and
privacy, the core planner and its topics, attention and timing, paired checkpoints,
model isolation and the evidence discipline ([ARCHITECTURE](ARCHITECTURE.md)). The
coordinator should mostly notice that receipts and options have a new shape.

### What changes

**1. Intents instead of orders.** An accepted core proposal becomes a native intent
object (a haul-to-stockpile zone, a blueprint, a bill, a designation) tagged with the
agreement ID. Pawns carry it out through their normal work givers.

**2. Options from the game's own work scan.** Instead of per-capability scanners, the
menu of real options comes from the same work-giver pipeline the game uses for its
right-click menu (`WorkGiver_Scanner` and friends). Colony infrastructure (stockpiles,
existing designations, bills) is colony knowledge; local sightings stay for
discoveries.

**3. Perception from the game's events.** Harmony patches on job start and end (with
the game's own end reason), ingestion, construction completed, recipe finished, social
interactions, downed, and letters. Exact causal events replace 30-tick diffs, and
receipts come from native jobs linked to an agreement. This also answers "the crew log
doesn't say why coordination stopped".

**Later:** a `ThinkNode` in the humanlike think tree that consults cached standing
commitments (no model call at tick time), so an idle pawn *prefers* the work it agreed
to. That is where the vision's persistent commitments actually live. Refusals and broken
promises can become native thought memories, so speech gets native mood and opinion
consequences.

## Consent in a native world

This is the part to get right; the rest is plumbing.

- **Per-agreement consent must stay per agreement.** Native intents are colony-wide:
  any capable pawn with the right priority would pick up a new blueprint. Concord-tagged
  work therefore needs an eligibility filter (a Harmony patch on work-giver eligibility)
  so only pawns who accepted that agreement take it. Bills already support a native
  pawn restriction, which cooking uses today.
- **Work priorities belong to the pawn.** Re-enabling priorities means colonists do
  ordinary colony work on their own, which is how RimWorld works and fits the premise:
  priorities are a colonist's own standing habits. The core never sets them. A pawn may
  change its own priorities through an explicit choice ("I'd rather not cook for a
  while"), which the crew log shows.
- **A refusal is not a priority change.** Refusing one offer means "not this, not now";
  it must not silently turn off a whole work type. Durable preferences are a separate,
  explicit pawn choice.
- **Untagged native work needs no consent.** Consent applies to what the core proposes,
  not to every action a colonist takes on their own.

Which work counts as colony knowledge for the core, and whether the core may create
untagged colony designations at all, are open decisions (below).

## Trade-offs

- **Coarser receipts.** "27 wood into stockpile A between ticks X and Y" instead of
  "10 wood to cell (x, z)". Still game truth, still consent-gated, but topic closure and
  agreement progress must be defined on aggregates.
- **Less control over exactly who does what, when.** The game decides ordering by
  priority and distance. That is the point, but some scenes will be less
  predictable.
- **A Harmony dependency.** Standard for RimWorld mods; it becomes a declared mod
  dependency and a provenance note.
- **Knowledge widens.** Work-giver options are colony-scoped, beyond the current
  12-tile sightings. The "attentive crewmate" rule needs restating for colony
  infrastructure.
- **Simpler persistence, probably.** Intents live in the save, so checkpoints during
  running agreements may become possible. This needs verifying, together with
  restore-time reconciliation between agreements and tagged map objects.

## Learning the internals

About a week, not a month. Decompile the owned RimWorld 1.6 `Assembly-CSharp` (ILSpy)
on the lab host; decompiled code is never committed. Confirm, and write down in a short
internals note:

- `Pawn_JobTracker`: `StartJob`, `EndCurrentJob`, job queue, player-forced jobs, the
  constant versus main think tree.
- The humanlike `ThinkTreeDef`: priority order of needs, work and joy.
- `JobGiver_Work`, `WorkGiver_Scanner`, `Pawn_WorkSettings`.
- `DesignationManager`, zones and storage settings, bills and pawn restrictions.
- `ReservationManager`.
- `InteractionWorker` and `Thought_Memory`.

Mods worth reading for patterns: Achtung!, Pick Up And Haul, Colony Manager, and
Hospitality or Psychology for think-tree injection.

## The spike

One bounded experiment, no coordinator changes, the same campfire fixture:

1. Harmony job, ingestion and social event hooks feeding the existing event stream.
2. A generic option list from work givers for the three pawns.
3. One intent-based agreement: "haul wood to the stockpile, up to 30", as a tagged zone
   plus the eligibility filter, with receipts from the native haul jobs.

**Measure against the recorded scene (#64):** stale rejections, idle or wandering time,
whether agreed work resumes after a meal without a new model call, whether receipts
reconstruct delivered totals, simulation speed, and consent violations (must be zero:
no untagged pawn takes tagged work).

**If it wins,** migrate capabilities one at a time: hauling, then construction and
cooking through blueprints and bills, then rescue through the native rescue job. The
ordered-job model stays as the regression baseline until each replacement matches it.
Pawn-owned eating remains a self-care choice; whether it rides on native ingestion
with a tag is part of the migration.

## Open decisions

- Eligibility filter per agreement (recommended) versus consent expressed only through
  work priorities.
- What colony infrastructure the core may see, and whether it may propose untagged
  colony designations or only tagged agreements.
- How topic closure works on aggregate receipts.
- Whether checkpoints during running agreements become allowed.
- When refusals and broken promises become native thought memories.
