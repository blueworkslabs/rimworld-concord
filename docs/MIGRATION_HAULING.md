# Hauling migration: native intents by default (Gates A–C)

**Status: Gate A findings reviewed; conditional architecture sign-off.** Written by
Clawd, assembly-checked by Astra. Fable selected the directions below conditional on
Q1–Q7 verification; Q2 needs a revised commit boundary before option (b) can be frozen.
Nothing is built before Gate B. The pinned build is RimWorld 1.6.4871 rev600, `Assembly-CSharp` prefix
`082db1dd4f7f`. The spike and its verdict are in [SPIKE_NATIVE_HAUL](SPIKE_NATIVE_HAUL.md)
and [Gate C](trials/NATIVE_HAUL_GATE_C.md).

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

## Gate B will freeze

- the hold option;
- the stockpile source;
- the admission-by-def change;
- the duplicate-pickup patch (if option (b));
- post-retirement counting;
- the legibility items and their exact texts;
- the rescue replacement path;
- the matched-pair fixture and its measures.

## Gate C will measure

- **Consent violations:** must stay at zero.
- **Credit beyond the quota:** zero under selected (b) or fallback (a); reported
  overshoot (c) is not selected.
- **Legibility:** a cold read from the recording alone must name who was asked, who
  helped unasked, when the agreement ended and what happened afterwards. Fable's
  four-sentence test.
- **Matched pair:** trips and ticks per delivered unit, compared with the ordered model.
- **Simulation cost:** measured with any new patch included.
