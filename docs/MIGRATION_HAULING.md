# Hauling migration: native intents by default (Gates A–C)

**Current status: migration Gate C passed on the game side; [verdict](trials/HAULING_MIGRATION_GATE_C.md). Ordered hauling is retired by #80 after the #79 test port. Historical gate design follows.**

**Gate B signed by Fable on 2026-09-24 at `5942961`, with the three
conditions recorded below.** Gate A is assembly-reviewed; Astra confirmed corrected
Gate B testability with a separate B1 review. This authorizes implementation after the
documentation merge, not a live run or a claim that the runtime measures have passed.
The pinned build is RimWorld 1.6.4871 rev600, `Assembly-CSharp` prefix
`082db1dd4f7f`. The spike and its verdict are in [SPIKE_NATIVE_HAUL](SPIKE_NATIVE_HAUL.md)
and [Gate C](trials/NATIVE_HAUL_GATE_C.md).

## Operative fallback — 2026-09-25

B1's two permitted fix/recheck rounds are exhausted. Round 2 (`b98d060`) failed in
quiet-base preparation before any scenario assertions: the lab receipt read a pooled
job's cleared definition after ending it. Failed recordings are retained. This is a
harness failure, not a demonstrated growing-hold quota violation, but it is not a
clean B1 result. **Strict (a) is the migration configuration; growing (b) is parked.**
No third growing round is authorized by this freeze. Existing growing code/evidence
is experimental, not cleared for deployment as the migration default. The reviewed
receipt-only fix (`7dec73a`) is used for separate strict-only correctness checks; it
does not reset the budget. The [single signed live run and post-read audit](trials/HAULING_MIGRATION_LIVE.md)
are complete: no offer reached publication, and no hauling intent opened. Receipt-age
prefixes passed the observed checks; failure totals remained off-screen and late offer
answers were not exercised. That diagnostic run did not authorize deletion. The later [pipeline rerun](trials/HAULING_MIGRATION_PIPELINE_RERUN.md) supplied the evidence for Fable’s [game-side Gate C pass](trials/HAULING_MIGRATION_GATE_C.md).

## Goal

Hauling agreements become native intents in ordinary play, not only in the frozen
spike. The core offers a shared stockpile haul, pawns fill it through their own work
givers, and the ordered-job haul is retired once this path has matched it. The spike
answered "can it work"; this migration answers "can it be the default, and can a
viewer follow it".

## Carried over (decided, not reopened)

- **Attribution-only** is the default. Refusal, defer and withdrawal bind; helpers are
  credited as helpers. The exclusive variant stays scripted-only.
- **The wait action is silent.** A core turn with nothing new produces a "waiting on…"
  status line, never a crew-log entry.
- **The tag is on the zone, not on the wood.** Hauling that wood elsewhere is not a
  violation. There is no needs stop for native intents. The quota is per intent and
  credit is per pawn. After retirement the zone is an ordinary stockpile.
- **Late answers lapse, observation age is shown, and failures are counted per lane**
  (#71). These are prerequisites for the next live run and are already merged.
- **Capability comes from the game.** A pawn whose work type is disabled is never
  offered that work, and the reason is visible.

## Direction (Fable, 2026-09-24; implementation still gated)

### 1. Strict hold, or a hold that grows

**Selected conditionally: (b), growing hold within the quota.** Fable requires a
verified admission boundary before additional pickup, no alternate pickup escape, and
measurement of the new wrapper's cost. **Fallback: (a), strict hold**, not reported
overshoot, if that boundary cannot be established. Q2's original after-action wrapper
does not establish it: jumping to the next toil is synchronous.

- **(a) Strict hold (spike):** source-bounded trips, no duplicate pickups into a tagged
  zone; retain the scripted zero-escape checks.
- **(b) Growing hold within quota:** proposed restoration of native compatible duplicate
  pickups, with the *whole carried load plus admitted extra* reserved before further
  execution. Zero overshoot is the required invariant, not yet runtime evidence.
- **(c) Growing hold with reported overshoot:** not selected. It would require "about"
  rather than "up to" wording and explicit excess-delivery accounting.

Option (b) can recover some duplicate-pickup efficiency; it does not promise identical
native throughput. Gate B must resolve the count budget, synchronous transition,
withdrawal and pickup-time bounds listed in Q2. Until then (a) is the verified baseline.

### 2. Where stockpiles come from

- **(a) Selected:** the core may tag an **existing colony stockpile** (colony-public
  knowledge, per the internals note) for one thing def, or one of the operator-declared
  **candidate sites** that the fixture or scene setup lists. Existing zones retain
  their settings and existing stock; only candidate sites create a new zone on first acceptance. Existing-zone attachment and validation are
  new work: today `Accept` always creates a zone.
- **(b) Deferred:** the core proposes new zone rectangles itself. That needs
  placement validation and a view of the map that the core doesn't have. It stays with
  the open decision on untagged designations.

With (a), a tag covers a (zone, def) pair, so admission and the quota apply only to that
def (Q1). Other items keep flowing into a shared zone as before.

### 3. Several intents at once

**Selected:** yes, at most one open intent per (map, zone, def). Each has its own
quota, standing and topic. List them in a fixed order within the core's topic-capacity
limit; each offer names its stockpile. Per-intent arithmetic can be reused, but zone-only
lookup, durable indexing, the singleton coordinator configuration and lifecycle routing
must change. Different defs in one zone must never share reservations or counters.

## Scope

**In:**
- any haulable thing def;
- tagging existing stockpiles or candidate sites;
- several intents;
- the hold decision;
- retirement of ordered hauling;
- rescue replacement for native agreements (Q6);
- the legibility items below.

**Out:**
- construction, cooking and rescue as native intents (the next migrations);
- the core creating zones;
- priorities or the standing-commitment `ThinkNode`;
- the options menu for the core.

## Legibility (ships with the migration, from Gate C)

- **The offer says what is offered:** "Haul up to 30 wood to the shared wood pile by the
  north wall; others may help". Coordinates belong in the record, not speech. It is
  not an eligibility notice.
- **Helpers are labelled** in the crew log: "Pedro is helping (not asked)" on a
  helper's first credited placement.
- **Retirement writes one record:** "Agreement complete: 75 of 75 (Pedro 40, Beatrice
  35). Further hauling here is ordinary work." Placements into a retired zone keep being
  counted per pawn as ordinary work (Q3), so the 75 → 120 gap is explained.
- **The stockpile is findable:** the zone gets a readable label ("Shared: wood for
  Beatrice, Pedro") and a distinct colour for as long as the intent is open. The crew
  log entry has a "show" button that jumps the camera to it (Q4).
- **Clock, not ticks:** the crew log and core-facing times show in-game date and hour
  next to the tick (Q5).
- **The silent wait** replaces repeated "nothing to propose" entries with one status
  line.

## Retiring the ordered haul

1. The migration's Gate C runs a matched pair: the ordered model against native intents
   on the same fixture.
2. Once that passes, the core no longer lists ordered haul options in any mode.
   `Concord_Haul`, `Hauling.cs` and haul planning stay only for the baseline runner.
3. They are deleted in a follow-up after the verdict, together with the 35 % needs stop
   for hauling and `Hauling.Ready` (including its wrong-tag capability check). Audit
   remaining callers; do not retain it as a safety fallback for native work.

**Done after Gate C (2026-09-25), in two PRs: the test port (#79), then the deletion.**
**Listed versus actual footprint:** the page listed four things: `Concord_Haul`, `Hauling.cs`,
haul planning and the needs stop. The implementation initially reported 86 files; the reviewed retirement touches
106 files, including 52 deletions. The extra footprint includes three overlooked
core scenes, a fail-closed persisted-action boundary, fixtures-only legacy adapters,
and preserved regression checks. More than 3,200 lines are removed.
- **Mod:**
  - `Hauling.cs`, the `Concord_Haul` job and the `haul` op;
  - the pawn view's `hauling` options and `workReady`;
  - crew-log haul labels.
  - Ordered build/cook readiness had borrowed `Hauling.Ready`, so it keeps its own copy until
    that migration.
- **Coordinator:**
  - `haul` in the action union (`LegacyHaul` remains a read-only record shape for stored
    histories and frozen eval fixtures);
  - planner, offers, trip stepping, `haulMap`;
  - `haulingOptions`, the model decision schema, the pawn haul contract;
  - replacement and reflection branches (now native-haul only);
  - `groundedPawn` moved to its own module.
- **Runners:**
  - hauling acceptance, fixture and live;
  - haul-planning acceptance;
  - crew-log acceptance;
  - the observer, reconsider and work live trials;
  - the needs, social, retention and integration live scenes;
  - the core, core-events and core-lifecycle scenes that still depended on the removed needs fixture and ordered-haul opportunities;
  - their launchers and Python fixtures;
  - the ordered halves of the spike and migration runners.

  All of them could only run ordered hauls. Their evidence stays in `docs/evidence`.
- **Tests:**
  - generic tests moved to rescue or to the native haul in #79;
  - progress and summary arithmetic moved to multi-meal cooking;
  - ordered-only tests and launcher tests removed;
  - a frozen model-contract case keeps its ordered-haul record, so its menu no longer
    offers the rescue alternative. Re-authoring it on a native haul is the eval owner's
    call.

### Compatibility boundary

Historical JSON/evidence is unchanged. The legacy type adapters live only in
`trials/fixtures/legacy.ts`; the frozen `active-haul` contract case stays historical.
A future native contract case must be authored alongside it, not replace it.

The coordinator refuses to open or restore a store containing unsupported proposal,
counter or re-invitation actions **before** recovery, status edits or game loading.
Raw `Store` reads remain available for offline history; use the matching historical
revision for replay. There is no automatic conversion of old ordered-haul obligations
into native intents, nor any inference that one completed trip means a whole old
agreement completed. Old game saves with in-flight `Concord_Haul` jobs likewise need
their historical mod. Native-only migration checkpoints remain supported.

Deploy from a clean build/install: TypeScript does not remove stale compiled files
for deleted sources, and copying a DLL alone does not remove the old JobDef. Preserve
historical saves and paired stores; do not overwrite them during verification.

For [construction and cooking](MIGRATION_PRODUCTION.md): the ordered model is used as the generic "offerable work" in
many tests and runners, not only in its own module. Budget the port-then-delete pair from the
start.

## Gate A: internals questions

Checked against the pinned assembly hash above and repository `117dd87`; API
availability is source evidence, not runtime proof. Private decompile: ILSpy 8.2 with
`DOTNET_ROOT=/home/clawd/.dotnet DOTNET_ROLL_FORWARD=Major`. Proprietary output remains
outside the repository.

- **Q1. One def in an existing mixed stockpile?** Feasible, but broader than patches
  1/3b. `ForZone`/`ForCell` currently return the first open intent by map/zone, ignoring
  def. Search admission, factory count caps, pre-toil admission/reservation, retarget
  transfer and placement lookup must consistently select (map, zone, def). `Placed`
  credits only the matching def, but currently counts other defs as incidental;
  `Spawned` also counts them as unattributed. Both must exclude unrelated items, not
  merely keep them out of credited totals. `Count` already filters by def. Gate B needs
  two tagged defs in one mixed zone, a refusing pawn storing a third def, and transfers
  between tagged zones, with independent balances. Tag existing stock non-retroactively;
  preserve filters/priorities and define behavior for zone edits, deletion and re-tagging.
- **Q2. Can duplicate pickups respect the quota without a race?** A bounded growth
  design is plausible; the original wrapper does **not** prove it. On 4871,
  `CheckForGetOpportunityDuplicate` selects a compatible partial same-def stack within
  8 cells while `curJob.count > 0`, retargets A and calls `JumpToToil`. That jump starts
  downstream reserve/goto toils synchronously; an after-original callback may run only
  after their initialization or failure. Gate B must commit at a verified boundary
  **before** the jump/downstream execution, with rollback on rejection/disposal.
  - Initial 3b admission already caps `job.count` to the source quantity; native pickup
    subtracts the acquired count. Removing the 4b clamp alone still leaves zero after
    a complete first pickup. Define a remaining trip budget that also respects native
    destination space and carry capacity, not quota alone.
  - `Reserve` replaces a job's total hold. Grow to **carried + admitted extra**, using
    quota minus credited units and other jobs' holds; do not overwrite it with extra
    alone or double-count this job's existing reservation.
  - Bind the actual next pickup to that admitted extra. A selected stack can grow or
    shrink before arrival; later true-up cannot repair an already oversized pickup.
    Zero admitted extra must skip pickup, not reach the native count-to-one fallback.
  - Recheck open intent, matching zone/def and standing before each growth; a carried
    trip allowed to finish after withdrawal is not permission to gather more stacks.
    Cover unavailable/reserved sources, retargets, failures and save/reload mid-growth.
  Native duplicate selection is not permission to take any whole adjacent stack, and
  single-threaded execution alone does not prove correct reservation ordering.
- **Q3. Post-retirement placements?** The carry callbacks can provide per-pawn counts,
  but `Placed` currently exits when its open-only `ForCell` lookup finds no intent;
  retirement clears reservations, and periodic reconciliation skips retired intents.
  Add separate archived (map, zone, def, tagging-generation) accounting and an explicit
  re-tag/deletion boundary. Credited totals remain immutable. Fresh spawns and net
  reconciliation remain unattributed; they cannot manufacture a carrier or recover
  gross arrivals/removals that cancel out between samples. Audit partial merges and
  multiple placement callbacks crossing retirement, with no double counting.
- **Q4. Findable zone?** `Verse.Zone.label`/`color` are public and serialized. Colour
  also feeds a cached `Material`, so changing the field alone is insufficient once
  rendered: refresh the material and dirty the zone mesh. `CameraJumper.TryJump(cell,
  map)` exists. `TryJumpAndSelect(GlobalTargetInfo)` selects things/world objects, not
  a zone from a bare cell; explicit zone selection/highlighting is separate. Persist
  original presentation, handle player edits, and restore it only when the last tag
  sharing that zone retires. Test drawing, reload and stale "show" targets.
- **Q5. Clock conversion?** Confirmed APIs in `RimWorld.GenDate`: `TickGameToAbs(int)`,
  `DateFullStringWithHourAt(long, Vector2)` and `HourOfDay(long, float)`. Convert the
  recorded game tick using that world's absolute-start offset and the relevant map's
  longitude/latitude, not the viewer's current map. The current snapshot JSON has ticks,
  **no clock field**; exporting the clock is migration work. Keep observation time
  distinct from receipt event time and preserve branch/world identity. Add colony-public
  clock data to SOCIAL's "who knows what" contract when implemented.
- **Q6. Rescue replacement?** The coordinator's request generation, reflection choices,
  `replacementActive`, completed-request fallback and handover currently require ordered
  `haul`. Native withdrawal confirms `intent-exclude`, but permits existing cargo to
  finish. Rescue admission requires `CarriedThing == null`: exclusion acknowledgment
  is **not** completion of the carried trip. Gate B must define a durable, receipt/game-
  confirmed handoff and fresh patient/bed/consent/expiry validation before dispatch,
  including lost replies and restart. Reusing the game rescue path may be possible;
  "coordinator-only" is conditional on that proof, not an immediate dispatch guarantee.
- **Q7. Def limits?** `EverHaulable` means `alwaysHaulable || designateHaulable`, not
  "haulable here now". Native capability, designation, reachability, reservation,
  storage acceptance, stack compatibility and carrying limits still apply. The mod's
  first acceptance checks EverHaulable and quota 1–75, but the coordinator's `HaulZone`
  schema and `intentAction` still hard-code WoodLog. Generalizing them is required.
  Quota is cumulative across trips: a stack limit below 75 does not itself require a
  larger quota. Keep 1–75 for now and test a small-stack def; broader quotas are separate.

## Gate B freeze (signed, with bounded effort and live-verification conditions)

### B1. Growing hold within quota: the pre-transition boundary (answers Q2)

`JobDriver.JumpToToil` is `SetNextToil` followed by `ReadyForNextToil`, so everything
downstream of a duplicate jump can run inside the jumping `initAction`, including
reserve, goto and, for an adjacent stack, `StartCarryThing`. The admission therefore has
to happen **before** the game's duplicate check, and the pickup has to be bounded by
what was admitted, not repaired afterwards.

The hook is a postfix on the `Toils_Haul.CheckForGetOpportunityDuplicate` factory. It
replaces the returned toil's `initAction` with `Pre(); original(); Post();`. It applies
only when the pawn's `CurJob` is a `HaulToCell` whose target B lies in an open tagged
(map, zone, def), with `def` the carried thing's def. Otherwise the original runs
untouched.

- **Pre**, before any jump or downstream toil:
  1. Recheck the intent is open, the zone and def match, and the pawn's standing holds
     (not excluded; accepted in the exclusive variant; the job not flagged
     `startedBeforeExclusion`). If any check fails, set `job.count = 0`: the game's
     check requires `count > 0`, so no duplicate is chosen. A carried trip allowed to
     finish after withdrawal gathers nothing more.
  2. Compute the extra this trip may add:
     `extra = min(job.count, free, AvailableStackSpace(def), destinationSpace)`.
     - `job.count` here mirrors the durable additional-unit trip budget, after the
       actual acquired count has been subtracted at the guarded pickup boundary.
     - `free = quota − credited − Σ other jobs' holds − carried`.
     - `destinationSpace` is re-read using native good-cell checks and the destination
       slot group **or its linked StorageGroup**, as `HaulToCellStorageJob` does.
       Preserve target-cell fit restrictions and subtract cargo already committed to
       that remaining destination capacity; do not turn total empty space into extra
       pickup allowance. Storage can change later: native retarget/failure still applies.
  3. If `extra ≤ 0`, set `job.count = 0` (skip, never the fallback path). Otherwise set
     `job.count = extra` and **set this job's hold to `carried + extra`**, a total and
     not an increment. Remember `(carried, extra, targetA)` on the wrapper frame.
- **Original:** the game's own check. If it jumps, the downstream toils can reserve and
  walk, and can pick up synchronously. `StartCarryThing` takes
  `min(job.count, AvailableStackSpace, stackCount)`, which is at most `extra`, however
  the chosen stack has grown or shrunk since. The pickup patch (4b) trues the hold down
  to the carried count.
- **Post**, after the original returns:
  - no jump happened (target A and carried count unchanged): release unused extra,
    keeping only the current carried amount;
  - jumped with the pickup still pending: keep `carried + extra`;
  - jumped and already picked up synchronously: 4b has already trued the hold down.
  These updates are conditional on the saved job identity/load ID still being current,
  the same intent generation still being open, and that job still owning this hold.
  Nested pickup, retarget, retirement or job cleanup wins: Post must not recreate a
  released hold or overwrite a newer nested admission. Capture identity before Original,
  never read a pooled job's new identity afterward. Use guarded finalization on exceptions.
  For a surviving open tagged job the hold covers its cargo; a retired/ended job has
  no hold, so `hold ≥ carried` is not a universal invariant after Original.

This needs changes to admission **and a physical guard on every pickup**, not only
removing 4b's clamp:

- **3b commit:** preserve a separate, durable per-job `tripRemaining` budget from native
  job creation, bounded by free quota and native carry/storage limits. Reserve only the
  actual initial admitted pickup **plus any cargo already carried**. For existing
  cargo C, the remaining quota available for *extra* is quota minus credited, other
  holds and C; additional carry space is `AvailableStackSpace`, not `MaxStackSpaceEver`.
  Define `tripRemaining` as additional units, bounded by native remaining count,
  that extra quota, available carry space and destination capacity minus C. Never
  count C as new pickup or subtract it twice. A job whose target A
  is already its carried thing reserves that cargo once and skips pickup, as today.
- **Pickup guard:** wrap `StartCarryThing`'s `initAction` for current tagged HaulToCell
  jobs before it calls the native carry method. Recheck job/intent/def/standing and cap
  this pickup to `min(tripRemaining, ownHold - carried, sourceCount, availableCarrySpace)`.
  Temporarily give native `job.count` that positive pickup cap, not the larger trip
  budget. After native subtraction, decrement the durable trip budget by the **actual**
  acquired count, restoring the remaining budget only for the same surviving job.
  The duplicate Pre uses this budget, never the temporary pickup count. Persist the
  budget across travel/save/load; wrapper-local scratch is not the durable budget.
- A nonpositive or newly forbidden pickup must not call native `StartCarryThing` with
  zero (its error check changes zero to one). If existing cargo may finish, skip new
  collection, retain target A as the actual carried thing, release unused extra and
  continue the carry/drop route; with no cargo, reject/end the job with
  a receipt. Withdrawal after a duplicate was chosen but before arrival also admits
  **no** new units. Recheck at pickup, not only when selecting another stack.
- **4b pickup:** true up from the actual pickup count/cargo; do not use a later shrink
  as permission to exceed a hold. The pickup guard and budget restoration replace its
  strict-mode count-zeroing behavior only for growing mode.
- **Strict mode:** (a) keeps today's behavior exactly, selected per intent
  (`hold: "strict" | "growing"`). Gate C can compare both on the same fixture.

**Why the initial guard is required:** a source initially containing 10 can grow to 20
while the pawn walks. A hold of 10 with `job.count = 30` lets native pickup take 20.
No after-pickup true-up prevents that escape. The separate physical cap must apply to
both initial and duplicate pickups; reserving the whole trip budget instead would
reintroduce quota monopolization and is not this design.

**Pickup-path scope.** In the base `JobDriver_HaulToCell.MakeNewToils` on pinned 4871, a pickup
happens only at `StartCarryThing`. That step is reached from the initial goto, or from
the duplicate check's jump back to the reserve toil. The drop toil's failure path jumps
to the carry toil, not to a pickup. As defence in depth, any pickup beyond the hold
must emit an immediate pickup-bound violation with job/intent IDs and before/after
cargo/hold counts. Assert `credited + total holds ≤ quota` at every admission/true-up
as well as placement. Do not silently enlarge a hold around already-uncovered cargo:
that would hide a pickup escape before the placement-only detector sees it. Existing
raw placement escape reporting remains. These are detectors, not the guard itself.

**Disposal and restore must cover the new budget.** Holds and `tripRemaining` belong
to the running job; any job end releases both. Retargets transfer the **whole carried
load** only if the destination intent can admit it; never clamp a hold below cargo and
then let that cargo enter. Retargeting while an extra pickup is pending must release or
re-admit that extra under the new destination's quota/def/standing before pickup.
Save/load preserves job identity, hold and trip budget; post-load reconciliation drops
all records for non-running jobs. A synchronous wrapper frame is not saved, but the
state left while walking is durable. Test nested reserve failure, exceptions and a job
ending/recycling inside Original; no Post may resurrect its hold.

**Scripted checks** (in addition to the spike's):
- a duplicate within budget;
- zero extra (no jump, no throw);
- an adjacent duplicate picked up synchronously inside the jump;
- **both initial and duplicate** source stacks growing/shrinking before arrival,
  including initial hold 10 / trip budget 30 / source growing to 20;
- withdrawal mid-trip **after duplicate selection but before pickup**, with original
  cargo allowed to finish and no newly collected units;
- two pawns contending for the last units, plus shrinking destination capacity;
- already-carried target A, and carried cargo plus a distinct source;
- no duplicate found; nested reserve failure; zero pickup; job end/recycling in Original;
- full-load retarget with insufficient destination quota and pending-extra retarget;
- save/load mid-growth with the durable remaining trip budget;
- (a) and (b) side by side.

Zero escapes is required. The wrapper's cost goes into `patch-cost`.

**Signed condition: bounded effort.** Growing hold is an efficiency improvement, not
necessary for migration correctness. After the initial scripted B1 run, allow at most
**two rounds of fixes and scripted rechecks**. If the required checks are still not
clean after round two, ship strict (a) for this migration and park growing (b) as an
open follow-up with all evidence. Do not relax an invariant, reset the count on a new
branch, or delay the rest of the migration for more attempts. Clawd implements; Astra
keeps the round ledger (revision, changed defects, checks/results, retained failures).
The design reviews before implementation do not count as scripted fix rounds; the
starting implementation ledger is round 0. Strict still must pass its migration checks.


### B2. Stockpile source

- `intent-accept` takes exactly one of:
  - `zoneId`, an existing colony `Zone_Stockpile` whose filter already allows `def`;
  - `siteId`, an operator-declared candidate site `{id, label, x, z, w, h}`.
- An existing zone keeps its filter, priority and stock. The tag does not modify
  them.
- The zone's `def` count at tag time is the baseline: tagging is non-retroactive, and
  only participation counts.
- Refuse the tag if an open intent already exists for the same (map, zone, def).
- A candidate site creates a zone on first acceptance that allows only `def`, with the
  site label.
- **Zone edits:** if the zone is deleted, or its filter stops allowing `def`, the intent
  becomes `stopped`, with the reason `zone removed` or `zone no longer accepts <def>`.
  The crew log says so; nobody is blamed.
- **Re-tagging** the same (zone, def) starts a new generation: a new intent id, with
  counters and archive separate.

### B3. Admission and accounting by (map, zone, def)

- `ForZone` and `ForCell` take the def. Every call site passes the thing's def:
  - storage search (1);
  - the factory cap (3);
  - pre-toil admission and commit (3b);
  - retarget (2);
  - placement (4) and spawn (5);
  - pickup (4b);
  - the duplicate wrapper (B1).
- Items of other defs are ignored entirely: not incidental, not unattributed, not
  counted.
- **Scripted checks:**
  - two tagged defs in one mixed zone with independent balances;
  - a refusing pawn storing a third def freely;
  - a re-target between two tagged zones.

### B4. Placements after retirement

- A retired intent keeps an archive per (map, zone, def, generation):
  `ordinaryByPawn` and `ordinaryUnattributed`.
- Carry-tracker placements of `def` into that zone add to `ordinaryByPawn`. Spawns and
  positive unexplained reconciliation deltas add to `ordinaryUnattributed`; negative
  deltas are recorded separately as removals, never negative arrivals or a reduction
  of lifetime delivered totals. No-hook changes cannot recover a carrier or gross
  arrivals/removals that cancel between samples. Retain existing callback deduplication
  and load-notification suppression.
- The archive closes when the zone is deleted, or when the same (zone, def) is tagged
  again.
- Credited totals never change after retirement.
- A single drop whose placement callbacks straddle the retirement moment is split at
  that moment. Each unit is counted exactly once. An oversized callback while the
  intent is open remains a full credited placement plus an escape; never cap it at
  quota and relabel its excess ordinary. Only callbacks after retirement are ordinary.

### B5. Several intents

- Coordinator configuration becomes a list. Its entries are candidate sites and
  existing stockpiles the operator allows; each opens at most one intent per def.
- The core view lists open and offerable intents sorted by label, def, then stable map/zone-or-site/intent IDs for ties, and every
  offer names its stockpile label.
- Topics link one intent each.
- The singleton `nativeHaul` becomes `nativeHauls` with a one-entry migration for the
  spike's stores.

### B6. Legibility texts (frozen wording)

- **Offer (crew-log record, next to the core's own sentence):**
  "Offer to Beatrice: haul up to 30 wood to the shared wood pile by the north wall;
  others may help."
- **The core's own sentence:** the public reason is a concrete reason in the world's
  voice, not an eligibility/consent disclaimer. Contract boilerplate belongs in the
  adjacent structured record; do not repeat "listed as eligible; eligibility is not
  consent" as the spoken reason. This is an implementation requirement of the same
  legibility item, reflected in [CORE](CORE.md#what-the-core-may-do).
- **Helper's first credited placement:**
  "Pedro is helping with the shared wood pile (not asked)."
- **Retirement:**
  "Agreement complete: 75 of 75 wood (Pedro 40, Beatrice 35). Further hauling here is
  ordinary work."
- **Expiry:**
  "Agreement expired at 20 of 30 wood (…); the topic stays open."
- **Archive line, updated in place:**
  "Since then: 45 wood as ordinary work (Pedro 25, Beatrice 20)."
- **Zone label while open:** "Shared: <site or zone label> (<def>)", in a distinct
  colour. After retirement the original label and colour come back, with the material
  refreshed and the mesh dirtied (Q4). If several defs share the zone, the original
  returns only when the last tag retires.
- **Show button:** jumps the camera to the zone's centre cell with
  `CameraJumper.TryJump(cell, map)`. A stale target (the zone was deleted) shows "no
  longer on the map".
- **Clock:** "Day 3, 14h (t2552)", from the map's longitude. The state JSON carries
  `clock` for the current tick. SOCIAL's "who knows what" table lists the clock as
  colony-public.
- **Wait:** silent. The status line reads "Core: waiting on <first open topic>".

### B7. Rescue replacement for a native agreement

A durable handover in four steps. Each step is recorded before the next. Existing
`Rescue.Options`/`Valid` require empty cargo, so a carried-haul replacement is not
currently offerable. Add a handover-specific read-only offerability projection using
observed patient/bed facts; allow the pending trip only at the offer stage, never at
rescue execution. No unobserved patient/bed or unsupported capability is invented.

1. The rescue is accepted as a replacement: the pawn consents, and a
   `handover-pending` record is written with a deadline.
2. An `intent-exclude` is sent and **confirmed by the game's state**, not by the reply.
3. **Wait for the captured job/cargo to drain.** A matching job-end receipt triggers
   a fresh state check; it does not prove empty hands by itself. Require confirmed
   `carrying` empty and the captured trip no longer active before proceeding. Unknown
   state is not empty. Exclusion acknowledgment alone is not enough.
4. Revalidate everything fresh (patient, bed, consent, expiry, `CarriedThing == null`),
   then dispatch.

Lost replies and restarts resume from the recorded step via `reconcile`. If the handover
deadline passes, the replacement is `stopped` ("handover timed out"), never auto-retried.
Persist one dispatch ID **before** sending; an uncertain dispatch reply is reconciled
under that same ID, not sent as a fresh rescue. Test closure/withdrawal during handover,
patient/bed changes, lost exclusion and dispatch replies, and restart at every step.

### B8. Matched pair and measures

The same fixture runs twice:
- native (b), falling back to (a) if B1 fails its checks;
- the ordered model: native Hauling off, as in the spike's ordered halves.

The fixture is two capable pawns, several stacks within duplicate range of each other,
two defs in one mixed zone, and enough work to observe more than one trip. Freeze
exact defs, compatible partial stack quantities/positions, quotas and observation
budgets in the fixture manifest before running. Quota remains ≤75: do not assume it
exceeds one trip for wood, since a growing native trip may carry all 75. Use the
small-stack-def case to establish multiple trips, and a separate wood duplicate case.
The ordered baseline must explicitly support both chosen defs with the same physical
fixture and consent roles; if it cannot, label the unmatched portion instead of claiming
parity. Retain invalid fixture attempts; no frozen live rerolls. The measures are below.

## Implementation status (round 0)

Built on `feat/hauling-migration`. **Not run in the game yet.** The B1 round ledger
starts here at round 0; Astra keeps it.

- **Mod** (`7440ecc`):
  - (map, zone, def) lookups everywhere (B3);
  - existing-stockpile or candidate-site tags, plain stops on zone edits, re-tag
    generations (B2);
  - the after-retirement archive (B4);
  - the growing hold per intent (B1): a commit with a durable trip budget, patch 9
    guarding every pickup, patch 10 holding the extra before the duplicate check,
    true-up and pickup-bound detectors, whole-cargo-or-nothing retargets;
  - label and colour while open, the clock, the "Show" button, the stockpile list in
    state (B6);
  - the read-only rescue handover projection (B7).

  14 patched methods apply offline.
- **Lab:** `scripts/hauling-migration-fixture.py` (B8 manifest: a mixed stockpile, a
  candidate site, exact stacks, duplicate pairs).
- **Coordinator** (`e60e714`):
  - `configureNativeHauls` (list, fixed order; ordinary play vs `intentOnly`);
  - the generalized stockpile haul;
  - the B6 wording and silent wait;
  - world-voice reasons;
  - the durable rescue handover (B7).
- **Scripted runs:** `scripts/run-hauling-migration-lab.sh [--strict] [--case=<name>]`
  with the B1 checks, the mixed zone, the archive, zone edits, re-tagging, legibility,
  and the matched pair (native and ordered). It runs with `--strict` for the fallback.
  Not forced by the runner, and listed as unimplemented in its receipt:
  - full-load retarget with insufficient destination quota;
  - pending-extra retarget;
  - re-target between two tagged zones;
  - nested reserve failure and job recycling inside the duplicate check.

### Review fixes (after Astra's #73 review; B1 rounds still 0/2)

Fable ruled this a B2 boundary, not a B1 growing-hold fix.
- **Hauls already on their way when the tag lands** (Fable's rule): when a stockpile is
  tagged, every running haul whose target is in that zone and whose def matches is
  marked `pre-tag` (saved with the intent). Those jobs are never credited, never counted
  against the quota and never trimmed. Patches 1, 2, 9 and 10 leave them native, and a
  retarget within the tagged zone keeps the mark. Their placements go into a "before"
  bucket (`preTagByPawn`, drop kind `pretag`). The quota applies only to jobs admitted
  after the tag, in both holds. Crew log, once, only when it applies: "Already on its way
  when the agreement started: 30 wood (Pedro)." A new job after an interruption is a job
  admitted after the tag.
- **Rescue handover ownership:** the accepted rescue is a running standing with no step.
  The pawn holds it as their intention once the old agreement is stopped, so it is
  visible to conflict checks and can be withdrawn. Every handover pass stops the old
  agreement first if it still runs, which covers a restart between consent and
  withdrawal. The handover stops if the rescue is withdrawn or the pawn's intention
  changes, and ownership is checked again right before dispatch. If exclusion flushing
  fails, the handover deadline is still processed.
- **Clock provenance:** crew-log entries convert ticks with the map of their intent,
  otherwise with the map of the named pawn. When the map is unknown, only `tN` is shown,
  never the viewed map. `IntentView.mapId` is exposed.
- **Evidence:**
  - `intent-pickup` receipts per pickup (job, cap, acquired, hold, trip);
  - `intent-duplicate-admitted` when the duplicate check selected a second stack;
  - per-job `jobs` (hold, trip budget, pre-tag mark) and `preTagAtStart` in the intent view;
  - the haul def on `job-start`;
  - the `lab-zone-count` op.

  The runner uses these for:
  - withdrawal after duplicate selection;
  - this job's hold and budget across save/load;
  - the refuser's third def (their own completed trips plus the zone count);
  - exact first-pickup receipts under source mutation;
  - a new `pretag-running-haul` case.

  The matched pair now runs per frozen def and quota from the manifest's `matched`
  (wood plus a small-stack def, native and ordered), with exact quantities and trip
  counts. Units an ordered trip carries past the quota are labelled as unmatched. The
  runner can't observe the in-game rescue handover, the UI clock and Show button, or
  the on-screen label and colour. The receipt lists them under `needsRecordedEvidence`,
  and they are never counted as passed.

### Before the last B1 round (after staging round 1; rounds used 1/2)

These are harness preconditions and new cases. No admission, hold or accounting rule
changed. The mod only gained lab ops and two evidence receipts. Causes come from round 1's
raw receipts:
- **Quiet base.** The round-1 base save carried Beatrice's running wood haul (job 4,
  marked pre-tag at tick 3), so every case started with pre-agreement work in flight.
  That starved the contention case (Pedro held 25 alone) and used up the pre-tag
  case's supply before tagging. The runner now ends every pawn's job without starting a
  new one (`lab-interrupt` with `idle`) before saving the base. The fixture save is
  unchanged. A tag refused because a matching job started in the same tick is retried
  after one tick.
- **Carried cargo plus source.** A queued job drops carried cargo before it starts on
  4871 (`JobDef.dropThingBeforeJob`, default true). Round 1's queued job had also
  picked a stack someone else had reserved, so it ended `QueuedNoLongerValid`.
  `lab-start-haul` starts the job the way the game does for a pawn already carrying
  (`keepCarryingThingOverride`), with a source this pawn can reserve. The case requires
  the admission receipt with `carried=5`, pickups of additional units, and job delivery
  equal to cargo plus pickups.
- **Pre-tag.** Two phases: first the captured trip's own `job-end`, then the quota. Before
  the quota is required, the runner reads Pedro's haulable wood (`lab-loose`) and records
  a precondition failure if it is below the quota. The broad "did not finish" wording is
  gone.
- **Ordered half.** The ordered model offers only what a pawn sees in a 13×13 square,
  source and destination both included. Round 1 had one wood offer because no pawn stood
  near both a stack and the pile, then the model's 35 % needs stop idled both pawns. The
  scripted core now also offers a move to a spot within 6 cells of the nearest reachable
  stack and the pile. Moves count as core turns. It plans exact quantities (count and
  trips never past the quota). Supply more than 12 cells from the pile is out of the
  model's reach and is labelled (`outOfReachUnits`), not counted against parity. If the
  reachable supply is below the quota, the case fails as unmatched by fixture. The needs
  stop is recorded as the reason, not waited out. Wood placed in the pile by ordinary
  opportunistic hauling during the ordered half is reported as `nativeUnitsDuringOrdered`.
- **Retargets.** On 4871 the only `SetTarget(B)` of a haul is the native placement
  retarget in `Toils_Haul.PlaceHauledThingInCell`. It runs after collection, where the
  hold always equals the cargo (patch 4b trues down, patch 10 rolls back). A retarget
  with an extra still pending is therefore not reachable. Filling the target outright
  fails the carry toil instead, and the job ends without a retarget. `lab-target-room`
  leaves one unit of room at the carrier's target and occupies the other pile cells. The
  direct drop then places one unit and the game searches storage for the remainder.
  Patch 2 now emits `intent-retarget` (from, to, job, carried, hold before, haul mode).
  New cases:
  - `retarget-between-tagged-zones`: the remainder moves to a second tagged pile, the
    hold before the move equals the cargo, and credit follows placement (1 and the rest).
  - `retarget-insufficient-destination-quota`: the second pile can't take the whole
    remainder. The game hauls it aside (`ToCellNonStorage`), nothing enters the second
    pile, and no hold outlives the trip.
  - `pending-extra-destination-lost` (growing only): the reachable neighbour of a
    pending-extra retarget. The destination is lost while Pedro walks to an admitted
    duplicate. The job fails, the extra is never collected, and the hold is released.
- **Observed only.** A job ending inside the native pickup or duplicate check (reserve
  failure or pooling) emits `intent-nested-end` with any hold left behind. The runner
  collects these in `observedOnly`. A leftover hold is a finding. They can't be forced:
  the native check validates reservability first.
- **Wrapper cost.** Both native matched halves time every patch call (`lab-patch-cost`)
  and keep the totals.

Round 2 is the last B1 fix/recheck round. If B1 isn't clean after it, strict ships and
growing is parked with this evidence (Astra's handoff).

### Strict acceptance work (after the fallback, 2026-09-25)

Round 2's setup failure was a harness bug: the quiet-base receipt read a job's def after
the game had pooled the job. Astra's `7dec73a` fixes it. None of the following touches B1
or reopens growing.
- **Strict is enforced as the configuration.** `configureNativeHauls` refuses a growing
  hold unless `experimentalGrowing` is set, and an entry without a hold is strict. The
  runner defaults to strict; `--experimental-growing` is the only way to run the parked
  hold, and it clears nothing. `--strict` is still accepted and changes nothing. The mod
  keeps its strict default.
- **Refusing pawn, third item.** In the strict run, Pedro took all the steel after his wood
  quota and Beatrice chose ordinary components and wood, so the check was left to chance.
  The case now works while Beatrice's wood refusal binds (wood intent open, before any
  tick):
  - `lab-store-probe` runs the patched native storage search for her: steel finds the
    pile, wood does not. Pedro's wood search is the control.
  - `lab-haul-to-storage` starts the job the native factory builds for her steel. The
    harness chooses only the item.
  - The case requires an untagged `HaulToCell` start with `def=Steel`, a `Succeeded` end,
    and a higher steel count in the pile.
- **B7 in the game, scripted.** Running the fixture script with a `rescue` section writes
  a separate save:
  - the patient is anesthetized at a set cell;
  - medical sleeping spots are added;
  - Doctor is 0 for everyone, so no native rescue races the scripted one;
  - stacks, pile and hauling settings are identical to the base fixture.

  In `rescue-handover-in-game`, Pedro accepts the wood agreement, carries, sees the
  patient and asks. The core offers the requested rescue, and he accepts. Authored answers
  only. Required:
  - consent, then the game-confirmed exclusion, then exactly one dispatch under the
    persisted id;
  - the carried trip ends before the rescue starts;
  - the rescue completes with the patient in the agreed bed;
  - the carried trip is credited to Pedro;
  - the crew record appears.

  This moves the handover out of `needsRecordedEvidence`.
- **Clock provenance: verified on one map; multi-map deferred until the first two-map
  scenario exists.** (Fable, 2026-09-25: no two-map fixture for a clock.) The bare-tick
  fallback stays tested in the game: the legibility case's `lab-clock-probe` requires the
  event map's in-game hour and `tN` alone for an entry without map provenance or with a map
  that does not exist.
- **Still recorded by hand:** on-screen label and colour. The live #71 checks belong to the
  separately frozen live run.
- **Before the live run (Fable's step 1):** the telemetry-only wake rule in
  [CORE](CORE.md). A wake made only of band changes spends no core turn and writes the
  silent status. The exceptions: something is offerable, or a crew member's Food or Rest
  band worsened to `urgent`. On E2 that silences turns 3, 6 and 13 and keeps 4, 5 and 7. The completion-report-to-receipt link
  waits until after the live run.

## Gate C result

**Passed on the game side, 2026-09-25.** Verdict, deletion scope and follow-ups:
[HAULING_MIGRATION_GATE_C](trials/HAULING_MIGRATION_GATE_C.md).

## Gate C will measure

**Signed condition: #71's fixes must be measured live in this migration.** The
[post-read audit](trials/HAULING_MIGRATION_LIVE.md#technical-findings--released-after-the-recording-only-read)
records the observed results and coverage limits; the frozen acceptance criteria
below are unchanged. Correlate saved input snapshot ticks,
intervening receipts and publication entries, alongside request/failure diagnostics:

- Every narration published stale against a newer receipt carries its as-of prefix:
  **zero unflagged stale narrations**.
- Every failure has a content-free cause and visible per-lane counts, including
  pre-model rejection. Unrelated lane successes or native-only batches cannot hide it.
- Any late answer retains the answer and is **lapsed**, never agreed, unfulfilled or
  withdrawn. Frozen meaning: "Answered yes after completion; no agreement started."
  Retain the applicable answer/end reason for other late choices or expiry/stopping.

If any of those fail, the run is **diagnosis, not a scene**; retain it without rerolling.
For a branch that never occurs, report "not exercised live", not a live pass; retain
its scripted/mock evidence separately rather than manufacturing a late answer or a
failure to satisfy a count.

- **Consent violations:** must stay at zero.
- **Credit beyond the quota:** zero under selected (b) or fallback (a); reported
  overshoot (c) is not selected.
- **Legibility:** a cold read from the recording alone must name who was asked, who
  helped unasked, when the agreement ended and what happened afterwards. Fable's
  four-sentence test.
- **Matched pair:** trips and ticks per delivered unit, compared with the ordered model.
- **Simulation cost:** measured with any new patch included.

### Implementation handoff and complexity record

After this signed documentation is merged, Clawd proceeds in order: mod, lab,
coordinator, scripted runs, then Astra's review/staging handoff. No frozen live run
starts merely because the design is signed.

Record what each migration adds and deletes. The spike grew from eight patches to
eleven methods; B1 proposes three wrappers plus a durable job budget. This is Fable's
complexity observation, not permission to add more rounds or weaken bounds. Retiring
`Hauling.cs`, `Hauling.Ready` and the hauling needs stop is this migration's deletion;
construction and cooking should each identify their corresponding retired code.


### Review clarification: pre-agreement ordering (2026-09-24)

Fable's final rule is relative to each intent: `job.startTick < intent.createdTick`.
It applies across retargets, including into a different tagged stockpile. Such work
remains native, is not cancelled by exclusion, and lands in the before bucket even
if the intent has retired. Saved per-job marks are diagnostic, not the authority.
An existing job that starts in the very tick of an attachment has no expressible
before/after order in that comparison: attachment leaves state unchanged and returns
a retry-after-next-game-tick response. The next attempt uses the actual later tag tick;
no deferred zone or cropped cargo is created. This is a same-tick serialization guard,
not deferral for the lifetime of a busy stockpile.

Crew entries persist known event-map IDs at creation. Unknown historical map identity
stays tick-only; names and current pawn positions never reconstruct an old timezone.
Cleanup releases immutable job IDs captured before native pooling. Pending rescue
ownership, old-standing stop and queued exclusion are durable together, and legacy
partial handovers recover before exposing pawn operations.
