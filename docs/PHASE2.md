# Phase 2: the core on the harness, and the crew back on top

**Status: plan, Fable, 2026-09-26, from the three-task benchmark. Not yet agreed.**
Phase 1 is closed by the [T1](evidence/benchmark-scored-three-2026-09-26/README.md) and
[T2/T3](evidence/benchmark-colony-scored-2026-09-26/README.md) tables.

## What phase 1 established

Twelve of twelve arms completed their tasks. The harness used less controller wall time
than the UI in every pair, and the gap grew with the task: about 45 % lower on T1, 68 % on
T2, 83 % on T3. Inputs went from 6 against 15 on T1 to 5 against 39 to 55 on T3. Total
tokens were lower on the harness in all twelve arms; uncached tokens were not uniformly
lower; dollar cost is unavailable on the subscription route.

Colony time is the honest column. On T1 it was level. On T2 no consistent advantage. On T3
the harness finished earlier in every pair, and the receipts say why: the UI arms cleared
their stockpile's wood filter and briefly ran the game while recovering, losing one to two
and a half game hours; the harness's one zone action bundles cells, filter and priority, so
there was no filter to clear. That is a strategy-and-recovery difference. The game's own
pace was the same through both interfaces once the work existed.

Two things the tables do not flatter. The harness arms made fewer mistakes partly because
they had fewer moves: no bed-owner action, no allow-all button, no priorities grid to
rewrite, no Save menu to wander into. Fewer inputs is partly a smaller action set. And the
harness arm's recording is a time-lapse of consequences: a viewer sees a campfire appear
and cannot say who decided it or why. That gap is real, unmeasured, and the first thing
phase 2 has to close, because a viewer is who Concord is for.

## Ground rules carried forward

No draft. The game is the ground truth. Native carriers. Measured, not assumed: every new
action or capability lands with a benchmark task that uses it, run three pairs alternating,
same rules as phase 1. Recording-first cold reads before any table. No rerolls. Interfaces
change only between task sets.

## The plan, in three steps

### Step A: legible actions and the missing moves

1. **Crew-log narration of harness actions.** Every accepted action writes one line in the
   colony's own voice at the moment it is accepted: "Placed a campfire blueprint by the
   east wall", "Set up a wood stockpile in the room", "Assigned the middle bed to Pedro".
   Refusals write their reason. The line is the game's receipt in words, nothing more.
   Measure: a cold read of a harness recording names at least four of every five actions
   taken. This is a viewer feature and a benchmark column at once.
2. **The moves the UI arms had and the harness lacked:** `assign_bed`, and `allow`/`forbid`
   verified on loose things. Nothing else until a task asks for it.
3. **T4: tend and shelter.** Beatrice's asthma is tended by someone with a doctor
   priority and everyone sleeps under a roof by 22h. It uses priorities, a blueprint with
   walls and a roof, bed assignment, and the medical alert that stood for three days.
4. Benchmark additions: the legibility column above; stall instrumentation; the dollar
   column whenever a route reports it.

### Step B: the core becomes the harness agent

The old core loop (eight topics, wake causes, the bounded review) is replaced by the
harness loop: observe the digest and the diff, act or wait, sleep until a public event or
a time budget. What survives from the old core is what the regression proved: wake on
public events, never on telemetry churn; one bounded review after a deliberate wait;
"heard <name>" whenever a pawn spoke and got no reply. The core keeps one persistent
context across a scene instead of a fresh one per turn, and its token cost is reported per
game day.

Measure: one ten-minute ordinary-play scene on the helper save, recorded and cold-read
against the four beats from [VISION](VISION.md): a need surfaces, a plan emerges in
pieces with a reason, quiet execution reads as patience, a rethink on interruption. Plus
the T1 to T4 regression through the same agent, three pairs each, so the scene cannot
regress the benchmark. The Jev grounding annotator rides the scene as wired.

### Step C: the crew gets their wills back

Offers and refusals return as one action pair: the core offers a piece of shared work to
a pawn, the pawn answers through its own model with the consent filters already built,
and a refusal binds. The measure is a task, not a gate: "Alvin refuses the haul; the plan
still gets the wood inside by the deadline", three pairs, plus a cold read that can name
who refused and why from the crew log alone. Nothing in step C starts before step B's
scene has been read.

## What retires

The construction slice #89 is closed with a note on the pieces that step A reuses. The
gate documents stay as history. The attribution ledger does not return.

## Open questions

- Whether the core's persistent context should be reset per game day or per scene.
- Whether T4's "tend" should accept the game's own tending job or require a tend
  receipt; the tables show the job and the cleared alert, not the quality.
- How to measure legibility without the reader knowing the action list beforehand.
