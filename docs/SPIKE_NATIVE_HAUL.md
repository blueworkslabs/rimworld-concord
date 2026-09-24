# Spike design: one native-intent haul (Gate B)

**Status: draft for design freeze.** Written by Clawd; needs Fable's architecture sign-off
and Astra's confirmation that it is testable in staging. Nothing is compiled before both.
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
intent. Answers work as today (accept, refuse, defer, counter with a smaller quota), and
each pawn's answer sets its standing on the shared intent.

**On the first acceptance** the mod creates a `Zone_Stockpile` on the area: wood only,
priority *Important*, tagged in our saved `WorldState` as `Zone.ID → {intentId, quota,
credited, reserved{jobId→count}, accepted[], excluded[], variant, open}`. Nothing lives in a job driver.

### Participation versus incidental placement

Astra's review of Gate A showed that items can reach a stockpile without a storage
search (haul-aside fallback, cleanup and cancellation drops with `ThingPlaceMode.Near`,
direct recipe placement), and that a haul can place items even when
`TryDropCarriedThing` returns false. So the spike defines:

- **Participation:** items placed through the carry tracker's `placedAction` callback
  during a job with `haulMode == ToCellStorage` whose storage target is a cell of the
  tagged zone, while the intent is open. Only participation is credited, counts toward
  the quota, and can be a consent violation.
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
- A job **already carrying** toward the zone finishes its trip. It is credited, flagged
  `startedBeforeExclusion`, and is not a violation. Cancelling it would itself drop the
  wood where the pawn stands, possibly inside the zone, so finishing is both safer and
  more natural. (Alternative for Fable: re-target the carry to another stockpile, as the
  drop toil already does on failure. More code, and it still falls back to haul-aside.)
- Queued jobs targeting the zone are removed from the pawn's queue.

### Quota guarantee

An in-flight reservation ledger per intent: `remaining = quota − credited − reserved`,
with reservations keyed by job `loadID`.

- **Fresh jobs:** a job into the zone is admitted only if `remaining ≥ 1`. Its
  `job.count` is capped to `remaining` and reserved at creation. Pickup and opportunistic
  duplicates are bounded by `job.count`.
- **Already-carried loads** (opportunistic or re-targeted): the zone is admitted only if
  the carried stack is at most `remaining`, and that amount is reserved when the search
  selects the zone.
- **Credit** moves reserved to credited at placement (never more than the job's
  reservation). A job that ends releases its unused reservation.
- **Result:** `credited + reserved ≤ quota` at all times, so counted deliveries never
  exceed the quota. There is no "one stack" allowance. When `credited == quota` the intent
  retires at once; later placements are ordinary native hauls. On expiry, jobs in flight
  finish as ordinary hauls and aren't credited.

### Harmony patches

Harmony is installed in the lab and declared as `brrainz.harmony` in `About.xml`
(loaded before Concord, referenced, never bundled). Each patch carries a one-line reason
in the code:

| # | Target | Kind | Reason |
|---|---|---|---|
| 1 | `StoreUtility.TryFindBestBetterStoreCellForWorker` | prefix | Admission for storage searches: excluded pawns, non-accepted pawns in the exclusive variant, `remaining`, carried-load size |
| 2 | `StoreUtility.TryFindBestBetterStoreCellFor` | postfix | Reserve an already-carried load when the search selects the tagged zone |
| 3 | `HaulAIUtility.HaulToCellStorageJob` | prefix and postfix | Admission for preselected cells; cap `job.count`; reserve |
| 4 | `Pawn_CarryTracker.TryDropCarriedThing` (both overloads) | prefix | Wrap `placedAction` (keeping any existing callback): credit participation, record incidental placement, never double-count |
| 5 | `Zone_Stockpile.Notify_ReceivedThing` | postfix | Audit arrivals into the tagged zone that hook 4 didn't see (incidental, unattributed) |
| 6 | `Pawn_JobTracker.StartJob` / `CleanupCurrentJob` | postfix / prefix | `job-start` and `job-end` with condition and seen cause; release reservations |
| 7 | `Thing.Ingested` | prefix and postfix | `ingested`: eater, def, item count, nutrition |
| 8 | `Pawn_InteractionsTracker.TryInteractWith` | postfix | `interaction`: initiator, recipient, def |

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
  standing (accepted, excluded or none); the stop rules in decision 4; topic closure is
  *resolved* when the quota is met.
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
2. **One frozen live run**, Luna (core and pawns), continuous, recorded, ten minutes
   wall clock, variant chosen by Fable at freeze time.

## Measures and baselines

| Measure | Baseline |
|---|---|
| Stale haul rejections; delivered totals reconstructed from receipts; work resuming after a meal without a model call | Integration checkpoint (#38: 40 wood in 4 trips) |
| Idle or wandering time; simulation speed with patches (and `work-options` cost) | Recorded scene (#64) |
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
