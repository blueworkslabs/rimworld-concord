# Grounded nearby movement

The game now provides `Pawn.movement`: an epoch/tick-stamped shortlist of nearby
movement destinations, plus the pawn's observed origin, radius and availability.
Explicit decisions and event-triggered reflection receive only their owner's
list. `core().movementOptions(pawnId)` returns just this physical projection, not
traits, needs, memories, reflections or the complete operator snapshot. This is
an explicit, limited sharing policy for movement opportunities, not shared minds.

## What is checked

The native main-thread snapshot examines at most 24 cells within Manhattan
radius 3, nearest first, returning at most 12 distinct alternatives. Destinations
must be in bounds, unfogged, visible along a line from the pawn, standable and
reachable through RimWorld's native `Danger.None` reachability check. The pawn
must be spawned, alive, not downed, not drafted and not in a mental state.
Unavailable pawns return an empty list with `status: unavailable`.

This is not exhaustive navigation or a path-safety guarantee. Line of sight is a
geometric approximation, not a full sensory/knowledge model. Native reachability
may consult map navigation beyond the visible destination; no route, map cells,
other characters' minds or reason for a hidden obstruction is exported. The
radius, cap and ordering deliberately sacrifice coverage. An empty available
list does not prove that no movement is possible; an absent legacy bridge field
is unknown (`null` through the core query), not permission to invent safe cells.

## No new action authority

Queries create no proposals or jobs. A core can propose an observed coordinate;
a pawn can refuse, accept, or counter using its own options. Adopting a counter
still requires a new offer and fresh consent. The native CLI prompt prefers the
shortlist for alternatives, but coordinates remain the movement protocol: this
is **not** a new strict capability-token system or a ban on longer moves.

Every accepted action still runs the current native actor and destination checks.
The shortlist makes no reservation and grants no right to move. Changes between
observation and execution can produce a failed receipt, even for a listed cell.
Old-epoch requests fail closed. Options are recomputed after load, not stored as
permanent facts or carried across timelines. Game receipts, not listed options
or acceptance text, establish completion.

## Verification

`npm test` covers owner-only decision/reflection projection, core read-only
projection, legacy and unavailable states, stale timelines, consent and failure
of a previously offered destination at dispatch. Native checks require compiling
against owned game assemblies and running the isolated staging acceptance:

```sh
npm run build
# With the game running and RIMWORLD_LAB_ROOT set:
flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" node dist/src/movement-acceptance.js
# Stop and restart the game, then restore the saved paired checkpoint:
flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" node dist/src/movement-acceptance.js --cold
```

The runner uses scripted responses, checks three lists, performs a grounded
counter/revision/move and a refusal, samples continuous ticking while polling,
and verifies paired/cold continuity. An explicitly operator-modified **copy** of
a disposable save drafts one pawn, testing an empty unavailable list and native
rejection of its previously offered coordinate. The original paired save is not
modified and is restored afterward. This is not a natural combat interruption
or live-model choice-quality test. Runtime outputs remain private; sanitized
receipts can be published under `docs/evidence/`.
