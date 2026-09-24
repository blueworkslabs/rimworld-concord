# Spike design: one native-intent haul (Gate B)

**Status: architecture sign-off given by Fable at `4eba938`; Astra's assembly-backed
testability review confirmed after the start-boundary corrections below.** Written by
Clawd, reviewed by Astra. This approves implementation, not a gameplay verdict; all
scripted and live checks below remain to be run.
Builds on [RIMWORLD_INTERNALS](RIMWORLD_INTERNALS.md) (pinned: RimWorld 1.6.4871 rev600)
and [NATIVE_INTENTS](NATIVE_INTENTS.md).

## Question

Can one agreement ("haul up to 30 wood into a new stockpile") run as a **native intent**
(a tagged stockpile that pawns fill through their own work givers) with consent intact,
receipts from game effects, and work that carries on across meals without new model
calls? And does that move us toward a crew a viewer can follow
([VISION](VISION.md#what-watching-should-feel-like)), not merely match the old model?

## Decided going in

1. **The tag is on the zone, not on the wood.** A refusing pawn hauling that wood into a
   *different* stockpile is not a violation. The filter placement follows from this;
   don't "fix" it later.
2. **Refusal, defer and withdrawal bind; helping is credited as helping.** Exclusive
   versus attribution-only is measured (both variants), not assumed.
3. **Quota is per intent, credit is per pawn.** "Up to 30" counts every
   **participation** (below) while the intent is open, helpers included, credited to the
   actual carrier. Counted deliveries never exceed the quota ([quota
   guarantee](#quota-guarantee)), and if one ever does, it is counted and reported as an
   escape, never clamped; anything else that lands in the zone is reported as
   incidental, never hidden.
4. **No 35 % needs stop for native intents.** Needs belong to the pawn and the game (the
   think tree handles hunger between trips). The only Concord stops are withdrawal,
   refusal, expiry and quota.
5. **After the quota, the tag retires and the zone becomes an ordinary stockpile.**
   Retiring the intent removes the tag, nothing else.
6. **No model call on the tick path.** Patches read cached state only.

## Fixture: `native-haul-v1`

Derived from the campfire fixture, frozen before any run:

- Three unchanged characters with campfire-v2 needs (Food 0.40 / 0.65 / 0.55).
  Hunger during this short agreement is not guaranteed; the separate meal case below
  establishes that precondition.
- **Work priorities on:** Hauling at 3 for all three; other work types at their vanilla
  defaults where the pawn is capable.
- **Wood: three stacks of 30 (90 in total) and no storage that accepts wood.** The
  fixture removes the old one-cell wood stockpiles and any other zone whose filter allows
  `WoodLog`, so nobody hauls wood before an agreement exists. Astra confirms the zone list
  when building the fixture.
- One fixture-authored **candidate area** (a rectangle of cells) for the new stockpile.
  The area is data, not a zone, until an intent is accepted.
- Berries and everything else unchanged. No blueprints, bills or campfire.

## Mechanism

**Intent object (coordinator):** `haul-zone {intentId, thingDef: WoodLog, area, quota
1–75, maxTicks}`. It is offered to each pawn as an ordinary offer that references the
intent. Answers work as today (accept, refuse, defer, counter), and each pawn's answer sets its
standing on the shared intent.

**Quota counters.** The intent is shared, so a counter such as "20, not 30" is only
adoptable **before the first acceptance**; adopting it replaces the intent's quota for
everyone. Once the zone exists, a counter is recorded, the pawn's standing stays *none*,
and the core cannot adopt it. The offer text says so.

**On the first acceptance** the mod creates a `Zone_Stockpile` on the area: wood only,
priority *Important*, tagged in our saved `WorldState` as `Zone.ID → {intentId, quota,
credited, reserved{jobId→count}, accepted[], excluded[], variant, open}`. Nothing lives in a job driver.

### Participation versus incidental placement

Astra's review of Gate A showed that items can reach a stockpile without a storage
search (haul-aside fallback, cleanup and cancellation drops with `ThingPlaceMode.Near`,
direct recipe placement), and that a haul can place items even when
`TryDropCarriedThing` returns false. So the spike defines:

- **Participation:** items placed through the carry tracker's `placedAction` callback
  by the storage-placement toil: a `ThingPlaceMode.Direct` drop at the job's current
  target B, in a job with `haulMode == ToCellStorage`, where that cell belongs to the
  tagged zone, while the intent is open, and **not** during job cleanup. Only
  participation is credited, counts toward the quota, and can be a consent violation.
- **Cleanup is classified explicitly.** During cancellation the old haul job and its
  target can still be visible, so a prefix on `Pawn_JobTracker.CleanupCurrentJob` marks
  the pawn as "in cleanup" until its postfix runs. Any placement while that mark is set,
  and any `Near` placement, is incidental, whatever the job says.
- **Incidental placement:** anything else that lands in the zone (haul-aside,
  cleanup or cancellation drops, direct placement, arrivals no hook attributes). It is
  recorded with count, source and carrier if known, never credited, never counted, and
  never a consent violation. It is always reported. Emergency drops are never blocked
  and carried items are never discarded.
- **Consent violation:** a participation by an excluded pawn (or, in the exclusive
  variant, a non-accepted pawn) from a job **started after** the exclusion. Must be zero.

### Exclusion takes effect at the next job

When a pawn refuses, defers or withdraws:

- Future admission closes at once: searches and preselected cells skip the tagged zone
  for that pawn.
- A job that targets the zone and **is not carrying yet** is ended (nothing to drop).
- A job **already carrying** toward the zone finishes its trip (decided: finish, don't
  re-target). It is credited, flagged `startedBeforeExclusion`, and is not a violation.
  Cancelling it would itself drop the wood where the pawn stands, possibly inside the
  zone. The crew log says so in plain words, for example "finished a trip started before
  withdrawing", so a viewer doesn't read it as the refusal being ignored.
- Queued jobs targeting the zone are removed from the pawn's queue.

### Quota guarantee

An in-flight reservation ledger per intent: `remaining = quota − credited − reserved`,
with reservations keyed by job `loadID`.

- **Fresh jobs:** a job into the zone is admitted only if `remaining ≥ 1`, and its
  `job.count` is capped to `remaining`. Creating a job reserves **nothing**: the game
  creates candidates it never starts (`CheckForJobOverride` returning a job to the pool,
  discarded think results, validity checks), so reserving at creation would leak quota.
  Pickup and opportunistic duplicates are bounded by `job.count`, which the commit caps
  to the trip's deliverable amount (see below).
- **True-up at pickup:** when the carry actually starts (`Pawn_CarryTracker.TryStartCarry`),
  the running job's reservation shrinks to the carried count and the rest returns to the
  quota at once. `job.count` is limited to what was just picked up, so the pickup toil
  leaves nothing further to collect. Reservations only ever shrink after commit, so
  `credited + reserved ≤ quota` and zero overshoot still hold.
  **Trade-off, decided by Fable: keep the strict hold for the spike.** A tagged trip
  reserves at most its source stack, so a pawn adds no opportunistic duplicate stacks to
  a tagged trip. Ordinary hauling elsewhere is unchanged. "Credited beyond quota = 0"
  stays a frozen measure. The growing hold with reported overshoot is an open decision
  for the hauling migration ([NATIVE_INTENTS](NATIVE_INTENTS.md#open-decisions)).
- **Already-carried loads** (re-targets in the drop toil): the zone is admitted only if
  the carried stack is at most `remaining` plus the job's own existing reservation.
  Admission is a pure check with no side effects, because storage searches also run
  speculatively (validity checks, UI). The reservation is taken at the **commit point**:
  when the job's target B is actually set to a cell of the zone (`Job.SetTarget` on a
  `HaulToCell` job).
- **Re-target transfers are atomic.** Within the tagged zone the reservation stays with
  the job, with no double count. Out of the zone it is released. Into the zone it is
  reserved once, at the commit.
- **Credit is honest, never clamped.** Each participation is recorded at its full
  placed count and credited in full to its carrier. The part covered by the job's
  reservation moves reserved → credited. Any part beyond it is an **escape**: it is
  still counted (so `delivered` may exceed the quota), recorded as `overshoot`, and
  raises a `quota-escape` event with job, pawn, count and path. The guarantee below says
  escapes don't happen; the assertion is how we find out if they do.

### Reservation ownership

**Only a running job owns a reservation**, meaning the job that is a pawn's `CurJob`.
Candidates, pooled jobs and queued jobs never hold one, so discarding or dequeuing them
changes nothing in the ledger.

- **Veto before start:** a prefix on `JobDriver_HaulToCell.TryMakePreToilReservations`
  rechecks the pawn's standing and quota for every tagged storage job, including
  forced jobs and jobs created or queued before standing changed. Before checking a
  current job, release this pawn's ledger entries whose jobs are no longer `CurJob`;
  an opportunistic replacement can reach this hook before any `StartJob` postfix.
  Candidate/queue validation never acquires a reservation. Reject excluded pawns,
  non-accepted pawns in the exclusive variant, or a job with no available quota
  (include its own reservation when rechecking the same job). Return false, so the game ends the
  job through its own failed-reservation path (`Errored` or `QueuedNoLongerValid`)
  before any toil runs. A fresh empty-handed job picks up nothing. A pawn already
  carrying can still drop that load through native cleanup; record it as incidental,
  never claim that veto implies zero physical placement. For a fresh job this race
  also logs the game's "returned false right after StartJob" warning; scripted runs
  count those warnings.
- **Commit:** a postfix on the same method, when it returned true **and** the job is the
  pawn's `CurJob`. For an empty-handed pickup it reserves what this trip can deliver,
  `min(job.count, remaining, source stack count, MaxStackSpaceEver(def))`, and caps
  `job.count` to that. The game sets `job.count` from the destination's free space (75
  for wood), not from what the pawn will carry, so reserving `job.count` let one
  pawn's first trip hold the whole quota and made contention impossible (Astra's
  staging finding; Fable's disposition). A resumed/new job already carrying its target, or a full
  compatible load, can skip pickup on 4871: admission must check and reserve the whole
  carried load, not cap `job.count` and assume that shrinks it. Reject an oversized
  carried load before toils; never trim it. For a partial compatible load that will
  pick up more, reserve the existing load plus the admitted pickup and cap only the
  additional pickup to the remaining allowance; do not run a pickup toil with count 0.
  Repeated checks replace the same job's
  reservation idempotently, accounting for its existing reservation.
  Not later: on 4871, `StartJob` calls `ReadyForNextToil` before returning, so a pawn
  already standing at the wood can pick it up inside `StartJob`, before any `StartJob`
  postfix. The same method also runs for jobs that are only being queued
  (`TryTakeOrderedJob`); the `CurJob` check keeps those out of the ledger.
- **Ownership check:** a `Pawn_JobTracker.StartJob` postfix releases any reservation this
  pawn holds for a job that is not its `CurJob`. That covers the opportunistic path: on
  4871, `StartJob` makes the reservations, then puts the original job back in the queue
  (`EnqueueFirst`) and starts the opportunistic one, without `CleanupCurrentJob`. The
  queued job's reservation is released before the replacement's admission as above,
  or here as a backstop, and taken again if it starts later.
- **Re-target** of a running job: reserved, transferred or released at `Job.SetTarget`,
  as above. Only changes to target B affect destination ownership; pickup changes to
  target A must not release or reacquire the quota reservation.

Every disposal path, explicitly:

| Path | Ledger effect |
|---|---|
| Placement (participation) | Reserved → credited; any excess counted in full as an escape |
| Opportunistic job replaces the started one (original goes back to the queue) | Released by the ownership check |
| Job ends for any reason (`CleanupCurrentJob`: success, interruption, failure, error, not-suspendable replacement) | Unused reservation released |
| Re-target out of the zone | Released |
| Intent retires (quota, expiry, operator stop) | All released |
| Vetoed before start (standing or quota) | No new reservation; native cleanup may still place an existing load incidentally |
| Candidate never started, returned to the pool, or discarded | None (never reserved) |
| Queued job removed (for example on exclusion) | None (never reserved) |
| Load or paired/cold restore | Reservations whose job isn't some pawn's `CurJob` are dropped; the rest stay with their running jobs |

- **Result:** `credited + reserved ≤ quota` at all times, so counted deliveries never
  exceed the quota unless an escape is reported. There is no "one stack" allowance: a
  carried load too large for what's left simply isn't admitted and goes to other storage by the game's normal rules.
  Wood is never split or destroyed to fit the number. (This tightens Fable's bound of
  "at most one carried load" to zero; if Astra's review finds a path that needs it, the
  fallback is exactly that bound, reported.) When `credited >= quota` the intent
  retires at once; later placements are ordinary native hauls. On expiry, jobs in flight
  finish as ordinary hauls and aren't credited.

### Arrival coverage and deduplication

Hook-observed arrivals are recorded once. Reconciliation covers the remaining net
change, with the cancellation limit stated below; it is not an exact event audit:

- **Carry-tracker placements** (participation and incidental, fresh stacks and merges
  into existing stacks): hook 4. `placedAction` fires for merges as well as new stacks,
  so this is the complete record for anything a pawn puts down.
- **Other fresh spawns** (for example direct recipe placement): hook 5.
  `Zone_Stockpile.Notify_ReceivedThing` is called from `Thing.SpawnSetup`, so it sees new
  stacks only, **not merges into an existing stack**. While hook 4 is inside a drop
  (a per-pawn "placing" scope from its prefix to its end), hook 5 ignores the arrival,
  because hook 4 records it.
- **Everything else** (merges without the carry tracker, anything no hook saw):
  reconciliation. Every 250 ticks the mod counts the wood in the zone and compares the
  change with the arrivals recorded since the last count. A positive difference is an
  **unattributed arrival**, a negative one a **removal**; both are reported as incidental.
  A removal and an unseen arrival in the same window can hide each other; the fixture
  has no removal sources (no blueprints, no fuel users, no other wood storage) and no
  non-carry sources in the area (no bills, no trees), so any difference there is a
  finding.

### Harmony patches

Harmony is installed in the lab; the implementation must declare `brrainz.harmony` in `About.xml`
(loaded before Concord, referenced, never bundled). Each patch carries a one-line reason
in the code:

| # | Target | Kind | Reason |
|---|---|---|---|
| 1 | `StoreUtility.TryFindBestBetterStoreCellForWorker` | prefix | Admission for storage searches: excluded pawns, non-accepted pawns in the exclusive variant, `remaining`, carried-load size |
| 2 | `Verse.AI.Job.SetTarget` | postfix | Commit point for re-targets of a `HaulToCell` job: reserve, transfer or release atomically. The widest patch (every job of every pawn and animal): an early `HaulToCell` check, and its cost is measured on its own |
| 3 | `HaulAIUtility.HaulToCellStorageJob` | prefix and postfix | Admission for preselected cells; cap `job.count`. Reserves nothing |
| 3b | `JobDriver_HaulToCell.TryMakePreToilReservations` | prefix and postfix | Recheck standing and quota, reconcile obsolete ownership before current-job admission, reserve full pre-carried loads or cap fresh pickups; commit only for `CurJob`, before toils |
| 4b | `Pawn_CarryTracker.TryStartCarry(Thing,int,bool)` | postfix | True up at pickup: shrink the running job's reservation to the carried count; leave no further pickup beyond it |
| 4 | `Pawn_CarryTracker.TryDropCarriedThing` (both overloads) | prefix and finalizer | Wrap `placedAction` (keeping any existing callback): record full counts, credit participation, flag escapes, record incidental placement; open and close the "placing" scope |
| 5 | `Zone_Stockpile.Notify_ReceivedThing` | postfix | Fresh spawns into the tagged zone outside a hook-4 scope (incidental, unattributed); merges are left to reconciliation |
| 6 | `Pawn_JobTracker.StartJob` / `CleanupCurrentJob` | postfix / prefix and postfix | Ownership check (release reservations of non-current jobs); `job-start` and `job-end` with condition and seen cause; mark cleanup for classification; release reservations |
| 7 | `Thing.Ingested` | prefix and postfix | `ingested`: eater, def, item count, nutrition |
| 8 | `Pawn_InteractionsTracker.TryInteractWith` | postfix | `interaction`: initiator, recipient, def; emitted only when both are free colonists |

**Retire** on quota reached, expiry, or the operator's stop: `open = false`, tag
removed, remaining reservations released. Placements after that are native, not
agreement work.

## Coordinator changes (named, nothing else)

- **Routing** for the new kinds, as in [RIMWORLD_INTERNALS](RIMWORLD_INTERNALS.md#routing-for-new-event-kinds).
  `haul-delivered` is not a wake cause per trip; the core wakes on the intent's
  **first delivery, quota reached, expiry, and stall** (no delivery for a set number of
  ticks while open).
- **Receipt shape:** aggregate intent progress `{delivered, quota, overshoot, byPawn{},
  incidental}` from drop receipts, where `overshoot` is the sum of escapes. The crew log shows credit per pawn.
- **Agreement lifecycle:** a shared intent referenced by several offers; a per-pawn
  standing (accepted, excluded or none); the stop rules in decision 4. Topic closure is
  *resolved* only when the quota is met. On **expiry with a partial total** (say 20 of
  30) the intent is *expired*, the topic stays open, and the core decides whether to
  re-offer or drop it. There is no silent resolve and no silent decline.
- **Checkpoints** are allowed while an intent is open, because there is no in-flight
  Concord job. This is **tested** in the spike (paired and cold restore mid-intent),
  not assumed.

## Options menu

Not given to the core in this spike (it proposes the one intent). A mod command
`work-options` enumerates per pawn and per work giver the top N candidates with the
native predicates, **for measurement only**: cost per call for three pawns, and how often
it matches what pawns actually do.

## Runs (Astra)

1. **Scripted, both variants**, zero model calls, recorded. Role sheet v2:
   Pedro accepts in both; Beatrice refuses in exclusive and is **not asked** in
   attribution (helper credit). Alvin is **not offered: cannot do hauling**, never
   silently marked unanswered. See `scripts/native-haul-roles.json`. Plus targeted sub-runs:
   - the two capable pawns hauling against a quota of 30 from 90 wood (attribution
     variant): credited exactly 30;
   - Pedro withdraws while walking to pick up (job ended, nothing dropped) and while
     carrying (trip finishes, flagged);
   - a forced cancellation while a pawn stands in the zone: the drop is incidental, not
     credited;
   - a pre-carried load re-targeted into the zone, larger and smaller than `remaining`;
   - paired and cold restore mid-intent.
   - two pawns reaching the quota together;
   - a haul candidate created and discarded without starting (lab command): `remaining`
     unchanged;
   - an opportunistic haul replacing a queued job, then the queued job starting later;
     assert that the replacement's admission sees no reservation owned by the queued job;
   - queued tagged jobs removed on exclusion: no ledger change;
   - excluded/non-accepted forced and queued starts: no tagged storage toil or new
     reservation, even if the job bypasses the factory; count rejected starts separately
     from delivery-based consent violations;
   - a pawn starting at the pickup, repeated pre-toil validation, and a resumed job
     already carrying more than remaining: reserve before pickup, never double reserve,
     and reject the oversized load without trimming; audit any cleanup placement;
   - save and load with a haul in progress: reservations reconciled to running jobs;
   - expiry at a partial total: intent *expired*, topic open;
   - **escape injection:** a lab-only fault flag lets one job skip admission and carry more
     than `remaining`. Expected: full count recorded, `quota-escape` raised, `overshoot`
     reported. This checks the detector, not the mechanism;
   - **arrival coverage:** a carried drop that creates a new stack in the zone and one that
     merges into an existing stack are each recorded exactly once; a lab-spawned stack and
     a lab merge without the carry tracker show up as unattributed arrivals (hook 5 and
     reconciliation respectively);
   - a partial merge whose drop returns false, followed by re-targeting: count every
     placement once and transfer only the remaining load's reservation;
   - **quota counters:** a counter before the first acceptance, adopted (the zone is
     created with the new quota for everyone), and one after acceptance, recorded with
     standing *none* while the quota is unchanged and the core's adoption is rejected.
2. **Meal case, matched pair.** The main fixture can finish 30 wood before anyone is
   hungry, so meal resumption gets its own scripted pair, `native-haul-v1-meal`: the same
   map with the 90 wood split into small stacks spaced so each trip carries one stack
   (Astra confirms the trip count in a dry run), quota 75, Pedro the only accepting pawn
   in the exclusive variant. Calibrated on 4871 with the fixture's raw berries:
   Pedro starts at Food **0.13**, just above the native berry-selection threshold of
   **0.12** (ordinary want-to-eat is 0.30, but berries are not yet eligible then).
   Stacks are at least ten cells apart to avoid the native eight-cell duplicate pickup.
   Precondition, asserted: at the meal event the intent is open with unfinished quota
   (`quota - intentional deliveries at that tick > 0`); otherwise the case is invalid, not passed. Pass: Pedro eats
   (`ingested`), then starts another tagged haul, with **zero model calls** in between;
   we record the ticks from the meal to that job start. The matched run uses the same
   start state with today's ordered-job haul agreement. Record time to first work
   separately from meal-to-resumption. A post-meal reservation can consume all free
   ledger capacity while the work is still unfinished; do not confuse those quantities.
3. **One frozen live run**, Luna (core and pawns), continuous, recorded, ten minutes
   wall clock, **attribution-only variant** (decided). The exclusive variant is
   exercised in the scripted runs; the live run shows whether helpers appear naturally
   and whether the log stays legible when they do. Offer Pedro and Beatrice; their
   answers remain live decisions. Alvin is not offered, with the visible incapability reason.

## Measures and baselines

| Measure | Baseline |
|---|---|
| Delivered totals reconstructed from receipts | Integration checkpoint (#38: 40 wood in 4 trips) |
| Work resuming after a meal without a model call | The ordered-job half of the matched meal pair |
| Stale haul rejections | A matched scripted ordered-job run on the main fixture |
| Idle or wandering time; simulation speed with patches, `Job.SetTarget` patch cost on its own, and `work-options` cost | Recorded scene (#64), with matched settings before any improvement is claimed |
| Consent violations: participation by an excluded pawn from a job started after the exclusion | **Must be zero** |
| Quota escapes (participation beyond a reservation) outside the injection case | **Must be zero**; the injected escape must be detected |
| Incidental placements, unattributed arrivals and removals; trips finished after an exclusion; help from non-accepted pawns (attribution variant) | Reported |
| Checkpoint mid-intent: tag, counters and receipts after paired and cold restore | Must match |

**Stop and diagnose offline** if unsupported capability or consent could reach
execution, or invalid output or non-progress stalls the run. Retain all failures.

## Implementation status

Built on `feat/native-haul-spike`. **Partial scripted staging evidence now exists**, not
Gate C approval: [smoke results](trials/NATIVE_HAUL_SMOKE.md) and
[offers/meal staging](trials/NATIVE_HAUL_OFFERS.md). The frozen sole-Alvin
exclusive run was blocked because his unchanged Rancher backstory disables native
hauling. Fable selected Pedro for revised scripted/meal roles; the builder and runner
now use role sheet v2. Exclusive, offers/paired checkpoint and meal resumption/completion
have been game-tested. [Instrumentation staging](trials/NATIVE_HAUL_INSTRUMENTATION.md)
also observed a real drafting cleanup drop, fresh-coordinator restore and scoped timing.
Revised helper and overlap observations were negative with all remaining quota reserved
by one job; no claim about unconstrained pawn willingness follows. No capability bypass
or character rewrite has been made.

- **Mod:** `mod/NativeIntents.cs` (intent tag, ledger, reconciliation, bridge and lab
  operations) and `mod/IntentPatches.cs` (patches 1–8). Build with
  `scripts/build-mod.sh <Managed> <0Harmony.dll>`. All twelve patched methods apply
  offline under Mono with Harmony 2.4.2. Pawns report `haulingCapable` (the game's own
  Hauling work-type check).
- **Fixture:** `scripts/native-haul-fixture.py` (`--meal` for the meal case, `--helper`
  for the geometry-only helper case). Wood
  positions and the candidate area come from the running game.
- **Coordinator:** routing entries, `src/native-intents.ts` (wakes, aggregate receipts,
  topic outcome, invariants), `LabBridge.intent`. `haul-zone` is an ordinary offer:
  - `Coordinator.configureNativeHaul` freezes the one intent;
  - the core view lists it only for pawns the game lets haul; the others get a visible
    "not offered: cannot do hauling" line;
  - accept joins or opens the intent, while refuse, defer and withdraw exclude the pawn
    in the game, even before the zone exists;
  - counters can be adopted only before the first acceptance;
  - the standing follows the intent (met, expired, stopped), with no needs stop;
  - the crew log shows first delivery, quota and expiry, and "finished a trip started
    before withdrawing".
- **Scripted runs:** `scripts/run-native-haul-lab.sh main|meal|helper [--case=<name>]`, which
  writes a unique `.runtime/native-haul-<mode>-<runId>.json`, including raw events and final
  state per case. Event gaps fail the run. These private runtime files are not published.
  - `core-offers` covers the coordinator path end to end: not offered, refusal, a
    pre-acceptance counter adopted, acceptance, and a paired checkpoint mid-intent.
  - The matched ordered-job halves are `ordered-main` (stale rejections) and
    `ordered-meal`. Each uses the same save and area as an ordinary stockpile, with
    native Hauling off so only ordered jobs haul, as the ordered model always ran.
    They record authored offers as estimated core offer-turns, not actual model calls.
    Validity requires actual scoped wood delivery (and eating/post-meal work for the
    meal half); quantity shortfalls remain measured outcomes, with `quotaMet` explicit.
    Initial work after eating is not reported as resumption of pre-meal work.
  - `cold-restore-mid-intent` checkpoints an open, in-flight intent and restores it
    into a new coordinator on the same store. The standing, credit and intent must
    survive, and the quota must then be met.
  - `draft-mid-carry` replaces the lab-forced cancellation. Pedro is drafted, which is
    the game's own interruption, the moment he stands in the tagged zone carrying on a
    tagged haul. The drop must be incidental and never credited. Whether he resumes
    after undrafting is recorded, not required.
  - `patch-cost` compares Ultrafast throughput with all patches, without `Job.SetTarget`,
    and with Concord's patches off (not a wholly unmodded game). Three rotated rounds
    reload the same save and ordinary untagged stockpile, so disabling patches does not
    remove quota semantics from one arm. Non-advancing/paused samples are invalid.
    A separate tagged-work profile measures handler bodies and placement accounting;
    prefix/postfix invocations are counted separately. These timings exclude Harmony
    dispatch and include timer/nested-work overhead: **not isolated total patch cost**.
    `settarget-cost` separately measures incremental dispatch plus production handler/counter
    overhead using paired enabled/disabled calls on detached `Wait` and non-current
    `HaulToCell` jobs while paused. Five rotated pairs, warmup, and exact hook-call
    checks guard the measurement; incoming patch/timing states are restored. This is
    not a current-job retarget benchmark or a population-wide CPU estimate.
    Capped or noisy TPS differences cannot establish overhead. Cleanup restores timing
    and patches with an independent deadline, including on failure.
  - `work-options` safely measures only the WoodLog/HaulGeneral slot-storage predicate
    subset for all three pawns, five times. It never calls generic `HasJobOnThing` or
    `HasJobOnCell`: on 4871 those can construct jobs. Other work givers remain outside
    measured coverage. Random state is preserved; no jobs or reservations are created.
  - `helper` mode (`--helper`) runs `helper-geometry` (attribution; Pedro accepts,
    Beatrice is unasked) and `overlap-geometry` (both accept) on a fixture where helping
    can only come from geometry: more wood than one trip moves, a quota of 75, and a
    second cluster placed near Beatrice. Helping and overlap (`peakHolders`, the most
    pawns holding in-flight quota at once) are recorded as results, not required. The
    invariants must hold either way.
- **Not yet built:** full work-options enumeration, forced opportunistic replacement and failed partial merge. These are
  listed as unimplemented in run receipts and observed from events rather than forced;
  a run without such an event is not evidence for either case.

## Live run: freeze record (draft for Fable's sign-off)

Astra's [reviewed setup fingerprint and rehearsal](trials/NATIVE_HAUL_FREEZE.md) are
ready for sign-off. The proposed live fixture is **helper geometry / quota 75**, a
change from the original quota-30 main fixture; it remains unapproved until Fable
signs the setup hash. Two failed coverage rehearsals are retained. All character
state, strict holds and the zero-escape success measure remain unchanged.

The live run executes through the ongoing runner in native-haul mode:
`node scripts/run-ongoing.mjs <config> --recorded --native-haul`. A zero-model
rehearsal adds `--scripted`, and the post-run cold restore adds `--cold`. The policy is
`luna-native-haul-v1`: the recorded-scene timing (ten minutes of continuous play, the
#64 recording protocol, no turn cap, no inference pause) and Luna for the core and
pawns.

- **Setup:** the frozen `live` entry in `.runtime/native-haul-fixture.json` (save,
  candidate area, quota, `maxTicks`, `variant: "attribution"`). The runner refuses any
  other variant. Astra hashes this entry together with the runner digest that
  `run-ongoing.mjs` already checks between hosts.
- **Intent-only:** `configureNativeHaul` freezes the one intent, and the core can list
  and propose nothing else. The runner asserts this at the start and again over every
  proposal at the end. Pawns may accept, refuse, defer or counter the quota; a counter
  is adoptable only before the first acceptance.
- **Neutral brief:** loose wood and room for a stockpile; offer, ask or wait; equal
  standing; respect refusal and deferral; no requirement to keep anyone busy.
- **Stop rule:** as in Gate B. The runner fails the run on any consent violation or
  quota escape observed during polling or in the final ledger (`invariantFindings`).
  Both capable pawns must actually receive offers for protocol coverage, without
  requiring live acceptance or forcing offers. At the end the intent closes
  as an **operator stop**, never as invented pawn withdrawals.
- **Two-capable-pawn scene:** Pedro and Beatrice are offered. Alvin is ineligible by his
  own backstory (Rancher, no hauling) and visibly not offered.
- **Cold restore after the run is a real process restart of the coordinator:** a new
  host and runner process (`--cold`) restores the paired checkpoint from the store and
  compares the actual restored game intent/ledger with the paired checkpoint, preserving
  the original baseline on failure. This must be demonstrated for the live run before
  Gate C. The game process itself continues and loads the checkpoint save.

## Out of scope

Construction, cooking and rescue migration; prioritized work; the standing-commitment
`ThinkNode`; native social consequences; giving the options menu to the core; any other
coordinator change. If the spike needs one of these, it comes back to Gate B.
