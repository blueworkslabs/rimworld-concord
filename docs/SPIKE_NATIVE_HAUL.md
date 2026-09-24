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
  Pickup and opportunistic duplicates are bounded by `job.count`.
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
  pawn's `CurJob`. For an empty-handed pickup it reserves `min(job.count, remaining)`
  and caps `job.count` to that. A resumed/new job already carrying its target, or a full
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

1. **Scripted, both variants**, zero model calls, recorded. The scripted core offers
   the intent to all three. Alvin accepts, Beatrice refuses, Pedro doesn't answer. Plus
   targeted sub-runs:
   - three pawns hauling at once against a quota of 30 from 90 wood (attribution
     variant): credited exactly 30;
   - Alvin withdraws while walking to pick up (job ended, nothing dropped) and while
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
   (Astra confirms the trip count in a dry run), quota 75, Alvin the only accepting pawn
   in the exclusive variant, and Alvin's Food set just above his want-to-eat threshold.
   Precondition, asserted: when native hunger triggers, the intent is open with
   `remaining > 0`; otherwise the case is invalid, not passed. Pass: Alvin eats
   (`ingested`), then starts another tagged haul, with **zero model calls** in between;
   we record the ticks from the meal to that job start. The matched run uses the same
   start state with today's ordered-job haul agreement.
3. **One frozen live run**, Luna (core and pawns), continuous, recorded, ten minutes
   wall clock, **attribution-only variant** (decided). The exclusive variant is
   exercised in the scripted runs; the live run shows whether helpers appear naturally
   and whether the log stays legible when they do.

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

Built on `feat/native-haul-spike`; nothing has run in the game yet.

- **Mod:** `mod/NativeIntents.cs` (intent tag, ledger, reconciliation, bridge and lab
  operations) and `mod/IntentPatches.cs` (patches 1–8). Build with
  `scripts/build-mod.sh <Managed> <0Harmony.dll>`. All eleven patched methods apply
  offline under Mono with Harmony 2.4.2.
- **Fixture:** `scripts/native-haul-fixture.py` (`--meal` for the meal case). Wood
  positions and the candidate area come from the running game.
- **Coordinator:** routing entries, `src/native-intents.ts` (wakes, aggregate receipts,
  topic outcome, invariants), `LabBridge.intent`.
- **Scripted runs:** `scripts/run-native-haul-lab.sh main|meal [--case=<name>]`, which
  writes a unique `.runtime/native-haul-<mode>-<runId>.json`, including raw events and final
  state per case. Event gaps fail the run. These private runtime files are not published.
- **Not yet built:**
  - the core offering a `haul-zone` intent and the pawns answering it (needed for the
    live run);
  - the matched ordered-job halves and actual counteroffer/standing transitions;
  - paired coordinator/cold restore (the runner currently tests game save/reload only);
  - forced opportunistic replacement and failed partial merge, and `work-options` /
    isolated patch-cost measurements. All are listed as unimplemented in run receipts.

  The opportunistic-replacement and failed-partial-merge cases are observed from
  events rather than forced; a run without such an event is not evidence for either case.
  The quota-immutability check is not a counteroffer test.

## Out of scope

Construction, cooking and rescue migration; prioritized work; the standing-commitment
`ThinkNode`; native social consequences; giving the options menu to the core; any other
coordinator change. If the spike needs one of these, it comes back to Gate B.
