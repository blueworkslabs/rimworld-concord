# Spike design: one native-intent haul (Gate B)

**Status: architecture sign-off given by Fable at `4eba938`, with the decisions and fixes
below folded in; waiting for Astra's testability confirmation.** Written by Clawd.
Nothing is compiled before Astra confirms.
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
   guarantee](#quota-guarantee)); anything else that lands in the zone is reported as
   incidental, never hidden.
4. **No 35 % needs stop for native intents.** Needs belong to the pawn and the game (the
   think tree handles hunger between trips). The only Concord stops are withdrawal,
   refusal, expiry and quota.
5. **After the quota, the tag retires and the zone becomes an ordinary stockpile.**
   Retiring the intent removes the tag, nothing else.
6. **No model call on the tick path.** Patches read cached state only.

## Fixture: `native-haul-v1`

Derived from the campfire fixture, frozen before any run:

- Three unchanged characters with campfire-v2 needs (Food 0.40 / 0.65 / 0.55), so Alvin
  gets hungry during the agreement.
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

- **Fresh jobs:** a job into the zone is admitted only if `remaining ≥ 1`. Its
  `job.count` is capped to `remaining` and reserved at creation. Pickup and opportunistic
  duplicates are bounded by `job.count`.
- **Already-carried loads** (re-targets in the drop toil): the zone is admitted only if
  the carried stack is at most `remaining` plus the job's own existing reservation.
  Admission is a pure check with no side effects, because storage searches also run
  speculatively (validity checks, UI). The reservation is taken at the **commit point**:
  when the job's target B is actually set to a cell of the zone (`Job.SetTarget` on a
  `HaulToCell` job).
- **Re-target transfers are atomic.** Within the tagged zone the reservation stays with
  the job, with no double count. Out of the zone it is released. Into the zone it is
  reserved once, at the commit.
- **Credit** moves reserved to credited at placement (never more than the job's
  reservation). A job that ends releases its unused reservation.
- **Result:** `credited + reserved ≤ quota` at all times, so counted deliveries never
  exceed the quota. There is no "one stack" allowance: a carried load too large for
  what's left simply isn't admitted and goes to other storage by the game's normal rules.
  Wood is never split or destroyed to fit the number. (This tightens Fable's bound of
  "at most one carried load" to zero; if Astra's review finds a path that needs it, the
  fallback is exactly that bound, reported.) When `credited == quota` the intent
  retires at once; later placements are ordinary native hauls. On expiry, jobs in flight
  finish as ordinary hauls and aren't credited.

### Harmony patches

Harmony is installed in the lab and declared as `brrainz.harmony` in `About.xml`
(loaded before Concord, referenced, never bundled). Each patch carries a one-line reason
in the code:

| # | Target | Kind | Reason |
|---|---|---|---|
| 1 | `StoreUtility.TryFindBestBetterStoreCellForWorker` | prefix | Admission for storage searches: excluded pawns, non-accepted pawns in the exclusive variant, `remaining`, carried-load size |
| 2 | `Verse.AI.Job.SetTarget` | postfix | Commit point for re-targets of a `HaulToCell` job: reserve, transfer or release atomically. The widest patch (every job of every pawn and animal): an early `HaulToCell` check, and its cost is measured on its own |
| 3 | `HaulAIUtility.HaulToCellStorageJob` | prefix and postfix | Admission for preselected cells; cap `job.count`; reserve |
| 4 | `Pawn_CarryTracker.TryDropCarriedThing` (both overloads) | prefix | Wrap `placedAction` (keeping any existing callback): credit participation, record incidental placement, never double-count |
| 5 | `Zone_Stockpile.Notify_ReceivedThing` | postfix | Audit arrivals into the tagged zone that hook 4 didn't see (incidental, unattributed) |
| 6 | `Pawn_JobTracker.StartJob` / `CleanupCurrentJob` | postfix / prefix and postfix | `job-start` and `job-end` with condition and seen cause; mark cleanup for classification; release reservations |
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
- **Receipt shape:** aggregate intent progress `{delivered, quota, overshoot, byPawn{}}`
  from drop receipts. The crew log shows credit per pawn.
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
   - expiry at a partial total: intent *expired*, topic open.
2. **One frozen live run**, Luna (core and pawns), continuous, recorded, ten minutes
   wall clock, **attribution-only variant** (decided). The exclusive variant is
   exercised in the scripted runs; the live run shows whether helpers appear naturally
   and whether the log stays legible when they do.

## Measures and baselines

| Measure | Baseline |
|---|---|
| Delivered totals reconstructed from receipts | Integration checkpoint (#38: 40 wood in 4 trips) |
| Work resuming after a meal without a model call; stale haul rejections | A matched scripted ordered-job run on the same fixture |
| Idle or wandering time; simulation speed with patches, `Job.SetTarget` patch cost on its own, and `work-options` cost | Recorded scene (#64), with matched settings before any improvement is claimed |
| Consent violations: participation by an excluded pawn from a job started after the exclusion | **Must be zero** |
| Credited deliveries beyond the quota | **Must be zero** |
| Incidental placements; trips finished after an exclusion; help from non-accepted pawns (attribution variant) | Reported |
| Checkpoint mid-intent: tag, counters and receipts after paired and cold restore | Must match |

**Stop and diagnose offline** if unsupported capability or consent could reach
execution, or invalid output or non-progress stalls the run. Retain all failures.

## Out of scope

Construction, cooking and rescue migration; prioritized work; the standing-commitment
`ThinkNode`; native social consequences; giving the options menu to the core; any other
coordinator change. If the spike needs one of these, it comes back to Gate B.
