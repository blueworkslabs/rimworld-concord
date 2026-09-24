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
are no hooks into the game's own events or think tree. Construction already creates
blueprints and cooking creates pawn-restricted bills, but these are isolated from
ordinary work and driven by ordered jobs. Test fixtures switch all work priorities
off; native self-care, social routines and wandering still run without core orders.

That puts two planners in charge of one pawn, and our own runs show the seams:

- **Competing planners.** Native self-care and asynchronous Concord choices can race.
  #61 and #64 retained stale or unavailable eating choices, and #64 separately sampled
  native ingestion. Their exact historical rejection causes remain unknown; these
  results motivate investigating the seam, not claiming native eating caused them.
- **One-off orders instead of standing intent.** A haul stops when Food drops below
  35 %, the pawn can eat natively, and the agreement is dead ("after-meal resumption is not
  automatic"). Native work can remain discoverable as designations, haulables and
  bills after an interruption, although changed needs, resources or eligibility can
  still prevent resumption.
- **Exactness at the wrong layer.** Decisions take seconds to a minute; our contract is
  "this exact stack, this cell, this count, valid at this tick" at 60 ticks per second.
  In continuous play that makes stale rejections more likely.
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

The coordinator's responsibilities and invariants: consent, receipts as truth, projections and
privacy, the core planner and its topics, attention and timing, paired checkpoints,
model isolation and the evidence discipline ([ARCHITECTURE](ARCHITECTURE.md)). The
coordinator needs narrow protocol, routing, lifecycle and receipt adaptations, not a
planner rewrite. In particular, a resumable job interruption must be distinguished
from withdrawal, expiry or a terminal agreement failure.

### What changes

**1. Intents instead of orders.** An accepted core proposal becomes a native intent
object (a haul-to-stockpile zone, a blueprint, a bill, a designation) tagged with the
agreement ID. Pawns carry it out through their normal work givers.

**2. Options from the game's own work scan.** Instead of per-capability scanners, the
menu of real options comes from the same work-giver pipeline the game uses for its
right-click menu (`WorkGiver_Scanner` and friends). The "attentive crewmate" rule
extends to **what the colony has already built**: stockpiles, blueprints, bills and
designations are colony-public, because someone placed them on the map. Loose things
stay sightings. A native scan's access to the whole map is not permission to expose
unobserved resources or private facts in a model's option menu. Candidate discovery
must also leave jobs, reservations and map state unchanged; revalidate at execution.

**3. Perception from the game's events.** Harmony patches on job start and end (with
the game's own end reason), ingestion, construction completed, recipe finished, social
interactions, downed, and letters. Hooks replace inferred job/action transitions, while
sampled state remains where needed for needs bands and reconciliation. Outcome
receipts come from native jobs linked to an agreement. This also answers "the crew log
doesn't say why coordination stopped".

A job-end reason is not itself proof of a quantity delivered or an item consumed.
Record actual effect deltas, with actor, agreement, tick and deduplication identity;
aggregate those receipts without counting retries, stack merges or restores twice.

**Later:** a `ThinkNode` in the humanlike think tree that consults cached standing
commitments (no model call at tick time), so an idle pawn *prefers* the work it agreed
to. That is where the vision's persistent commitments actually live. Refusals and broken
promises can become native thought memories, so speech gets native mood and opinion
consequences.

## Consent in a native world

This is the part to get right; the rest is plumbing.

- **Refusal binds; non-involvement doesn't exclude.** Native intents are colony-wide:
  any capable pawn with the right priority would pick up a new blueprint. A pawn that
  **refused or deferred** an agreement must never do its tagged work; that is a consent
  violation. A pawn that was never asked and pitches in, as colonists do, is not. Whether
  tagged work should be **exclusive** to the pawns who accepted it, or only
  **attributed**, is measured in the spike rather than assumed. Enforcement is a narrow
  Harmony filter on work-giver eligibility, the hottest path in the game and one many
  mods touch, so it must stay small and its cost on simulation speed is measured. Bills
  already support a native pawn restriction, which cooking uses today.
- **Helping is not acceptance.** Attribute a helper's contribution to that pawn;
  never invent its consent or report it as the accepting pawn's work. Refusal/defer
  state must be linked from the offered work to any resulting native intent even
  though a refused offer creates no agreement. Withdrawal remains binding, and
  re-offering or recreating an intent must not silently erase a refusal. Define the
  scope and explicit change-of-mind path in the spike.
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

Whether the core may create untagged colony designations at all is an open decision
(below).

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
  12-tile sightings: colony-built infrastructure becomes colony-public knowledge.
- **Simpler persistence, probably.** Intents live in the save, so checkpoints during
  running agreements may become possible. This needs verifying, together with
  restore-time reconciliation between agreements and tagged map objects.

## Learning the internals

Findings: [RIMWORLD_INTERNALS](RIMWORLD_INTERNALS.md) (Gate A).

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
- What the constant think tree can take over mid-agreement (fleeing, mental breaks,
  drafting), so receipts can classify those interruptions.

The note is done when it also gives a **routing entry for every new event kind**
before any of them reach the event stream. Today `src/routing.ts` sends unknown kinds
to appraisal without interruption; known memory/health/casualty kinds generally go
to deliberation (quiet social memories do not interrupt). Unknown kinds can therefore
wait without an appraiser; reusing significant kinds can instead create a wake storm.
Starting point: job start and end → native, non-interrupting; ingestion → native,
non-interrupting; routine social interaction → queued deliberation, non-interrupting;
downed → deliberation, interrupting. Specify public core wake policy separately and
measure model wakes, cancellations and event-buffer gaps as well as simulation speed.

Mods worth reading for patterns: Achtung!, Pick Up And Haul, Colony Manager, and
Hospitality or Psychology for think-tree injection.

## The spike

One bounded experiment, no coordinator planner rewrite, the same campfire fixture
with work priorities enabled. Include the narrow adapter/routing/lifecycle changes
needed for a standing agreement and aggregate receipts:

1. Harmony job, ingestion and social event hooks, routed per the internals note, then
   fed into the existing event stream.
2. A generic option list from work givers for the three pawns.
3. One intent-based agreement: "haul wood to the stockpile, up to 30", as a tagged zone
   plus the eligibility filter, with receipts from the native haul jobs.

Run both consent variants, exclusive and attribution-only, and count who did what.
Scripted checks must cover both, including refusal/defer/withdrawal, voluntary helpers,
meal interruption and resumption, expiry and paired/cold restore. A stockpile zone
alone does not express a 30-unit quota: define and enforce the agreement's remaining
quantity across accepting pawns, helpers and in-flight deliveries, then retire only
its owned intent state. Do not count unrelated stock changes as agreement progress.
Confirm the eligibility hook covers already queued/running work as well as new scans.

**Measure against the right baselines:**

| Metric | Baseline |
|---|---|
| Delivered totals from receipts | integration checkpoint (#38: 40 wood in 4 trips), historical reference |
| Stale haul rejections and work surviving a meal | matched scripted ordered-job/native-intent scenarios; #38 is not a measured meal-resumption baseline |
| Idle or wandering time, simulation speed | #64 as historical reference; matched fixture/priority settings for causal comparisons |
| Consent violations (a pawn doing tagged work it refused, deferred or withdrew from) | must be zero |

Freeze the live variant, setup and duration before inference; the two-variant comparison
is scripted, followed by one recorded live run, not retries for a preferred result.
The live run follows the usual stop rule: if unsupported capability or consent could
reach execution, or repeated invalid output or non-progress stalls the run, stop and
diagnose offline. Quiet waiting and a successful raw-food alternative are valid.

**Success is not parity with the old model.** The destination is still the recorded
scene from [VISION](VISION.md#what-watching-should-feel-like): a crew a viewer can follow,
where plans form between them. The spike wins if it moves us toward that.

**If it wins,** migrate capabilities one at a time: hauling, then construction and
cooking through blueprints and bills, then rescue through the native rescue job. The
ordered-job model stays as the regression baseline until each replacement matches it.
Pawn-owned eating remains a self-care choice; whether it rides on native ingestion
with a tag is part of the migration.

## Open decisions

- ~~Exclusive versus attribution-only tagged work~~ **Decided 2026-09-24
  ([Gate C](trials/NATIVE_HAUL_GATE_C.md)): attribution-only is the default.** Refusal,
  defer and withdrawal bind; helpers are credited as helpers. Exclusive stays scripted-only.
- **Decided 2026-09-24: the wait action is silent.** A core turn with nothing new yields a
  "waiting on…" status line, never a crew-log entry.
- Whether the core may propose untagged colony designations or only tagged agreements.
- How topic closure works on aggregate receipts.
- Whether checkpoints during running agreements become allowed.
- When refusals and broken promises become native thought memories.
- **Hold direction decided conditionally, 2026-09-24:** growing hold **within the quota**
  for the [hauling migration](MIGRATION_HAULING.md#1-strict-hold-or-a-hold-that-grows),
  not growing hold with reported overshoot. Fable requires a verified pre-pickup
  reservation boundary with no alternate pickup escape, and measured patch cost.
  Astra's assembly review found that the proposed after-action wrapper does not prove
  that boundary. Strict source-bounded hold remains the verified baseline and Fable's
  fallback if bounded growth cannot be established. "Up to" remains a limit; Gate B
  must settle the implementation and Gate C must test the zero-escape invariant.
- **Stockpile source decided, 2026-09-24:** existing colony stockpiles or operator-listed
  candidate sites. Core-created rectangles remain deferred. Tags are def-specific.
- **Concurrent intents decided, 2026-09-24:** one open intent per (map, zone, def),
  with deterministic core-view ordering within topic capacity and stockpile-labelled
  offers. Implementation and lifecycle tests belong to the migration gates.
