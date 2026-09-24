# RimWorld internals for native intents

Gate A of the [native-intents phase](NATIVE_INTENTS.md): the six questions whose answers
shape the spike design. Written by Clawd on 2026-09-24; to be checked by Astra against
the lab and signed off by Fable.

**Build studied:** the staging lab's install, RimWorld **1.6.4871 rev598** with Biotech
and Odyssey, `Assembly-CSharp` 1.6.9676.18020 and the Core `ThinkTreeDefs`,
`WorkGiverDefs` and `JobDefs`. Decompiled privately with ILSpy (`ilspycmd` 8.2); no
decompiled code enters this repository. Only type, method and field names are cited.
An older local copy (1.6.9438) was not used.

## Summary

| Question | Short answer | Consequence for the spike |
|---|---|---|
| 1. Does hunger pre-empt a running haul? | No. The main think tree only runs between jobs. Each haul trip is its own job; hunger wins at the next boundary. | "Work survives a meal" means: after eating, the pawn picks the tagged haul again by itself. Test it at trip boundaries. |
| 2. Where does a native haul choose its destination, and can we see it at drop time? | At job creation (`StoreUtility.TryFindBestBetterStorageFor`), but the drop toil can re-target. The actual drop goes through `Pawn_CarryTracker.TryDropCarriedThing`. | Count receipts at the drop, from the actual cell's zone, not from the job or job end. |
| 3. The narrowest place to keep a refusing pawn off tagged work | For hauling: the per-slot-group store search, `StoreUtility.TryFindBestBetterStoreCellForWorker`. It covers ordinary, opportunistic and re-targeted hauls. | One prefix, called once per stockpile per search, not per cell. Jobs created before a refusal need an explicit cancel. |
| 4. What can take a pawn over mid-agreement? | The constant think tree every 30 ticks, mental breaks, drafting, going down, damage, job expiry. | Receipt vocabulary: `InterruptForced` versus `InterruptOptional`, plus a cause captured from the hook. |
| 5. "What could this pawn do now", in one call? | Not natively. `JobGiver_Work` returns the single best job. A menu has to reuse its predicates per work giver. | Build options on request, bounded per work giver, never on the tick path. Cost is measured in the spike. |
| 6. Where do social interactions and ingestion fire? | `Pawn_InteractionsTracker.TryInteractWith` and `Thing.Ingested`, both with full identity. | Two narrow postfixes give exact events for routing. |

Prerequisite found on the way: **Harmony is not installed in the lab** (mods are Core,
Biotech, Odyssey, StagingLab and Concord). The spike needs the Harmony mod or a bundled
Harmony library; see [Gate B inputs](#inputs-for-gate-b).

## 1. Hunger and a running haul

- The **main think tree** is only evaluated when a pawn has no job
  (`Pawn_JobTracker.TryFindAndStartJob`), when a job expires with `checkOverrideOnExpire`,
  or when something calls `CheckForJobOverride` (for example damage, see question 4).
  Nothing in the food need calls it.
- In `MainColonistBehaviorCore`, a `ThinkNode_PrioritySorter` chooses between
  `JobGiver_GetFood` and `JobGiver_Work` (among others). `GetFood` returns priority 9.5
  when Food is below the race's `FoodLevelPercentageWantEat`. `Work` returns 9 during
  scheduled work time, 5.5 in "anything" time and less otherwise. So once a pawn wants
  to eat, eating wins at the next decision.
- Starving pawns also have `ThinkNode_ConditionalStarving` → `GetFood` in the emergency
  block, but that too is evaluated only at a decision.
- A native haul is `JobDefOf.HaulToCell` driven by `JobDriver_HaulToCell`: one stack (plus
  opportunistic duplicates of the same kind) per job. `HaulToCellStorageJob` sets no
  expiry. So hunger never cuts a trip short; it only takes the next decision.
- The job def is not `suspendable`, but allows an opportunistic prefix (question 3).

**Meaning for the spike:** a meal happens between trips. The agreement survives if the
tagged haul is still eligible when `JobGiver_Work` next runs. Our current ordered-job
model stops work below 35 % Food; native work has no such rule, so the pawn keeps
hauling until the think tree prefers food.

## 2. Haul destination and the drop

- `WorkGiver_HaulGeneral` (work type Hauling, `priorityInType` 15) scans
  `listerHaulables` and calls `HaulAIUtility.HaulToStorageJob`. That picks the
  destination with `StoreUtility.TryFindBestBetterStorageFor`: slot groups in priority
  order, the closest good cell in the best group. The cell becomes the job's target B;
  `job.count` is limited by space and carrying capacity.
- The drop happens in `Toils_Haul.PlaceHauledThingInCell`, via
  `Pawn_CarryTracker.TryDropCarriedThing(cell, …)`. If it fails, the toil **re-targets**
  to another store cell, possibly in a different stockpile. Failing that, it hauls
  aside, or in rare cases destroys the item.
- `Zone_Stockpile.Notify_ReceivedThing` fires when anything arrives in a stockpile, but
  it doesn't know who brought it.
- Zones have a stable `Zone.ID`.

**Meaning for the spike:** count delivered quantities with a prefix and postfix on
`Pawn_CarryTracker.TryDropCarriedThing`. Before the drop, record the carrier, thing
definition and stack count; after it, record the cell's zone ID and the count actually
placed. That credits the actual carrier and the actual zone, including partial drops and
re-targets. Job start and end remain useful for timing and interruption causes, but not
for quantities.

## 3. Keeping a refusing pawn off tagged work

For hauling into a tagged stockpile, every route to a destination cell passes through
the private `StoreUtility.TryFindBestBetterStoreCellForWorker(thing, carrier, map,
faction, slotGroup, …)`, called once per slot group:

- ordinary hauls (`HaulToStorageJob` → `TryFindBestBetterStoreCellFor`);
- **opportunistic hauls**, which the job tracker adds as a prefix to other jobs
  (`Pawn_JobTracker.TryOpportunisticJob`);
- the drop toil's re-target;
- bill products stored "in the best stockpile" (`TryFindBestBetterStoreCellForIn`).

A prefix there that skips a tagged group for a pawn who refused, deferred or withdrew
(or, in the exclusive variant, for any pawn who didn't accept) covers all of these at
the cost of one dictionary lookup per group. It is narrower and cheaper than the
per-cell `IsGoodStoreCell`.

It does **not** cover jobs created before the refusal: their target is already fixed,
and opportunistic hauls may sit in the job queue. On refusal or withdrawal, the mod must
end the pawn's current job if it targets the tagged zone and drop matching queued jobs.
The existing scoped cancel already does the first half.

Other intents need other filters, to be chosen at migration:

- **Bills** already have a native pawn restriction (cooking uses it today).
- **Blueprints and frames** are probably best filtered where their work givers check
  reservations. `ReservationManager` is the generic chokepoint, but also the hottest.
- **Player "prioritize" work** (`Pawn_MindState.priorityWork`, taken by the emergency
  `JobGiver_Work` and marked `playerForced`) is a native way to ask one pawn to do one
  thing next. It is worth considering as a per-pawn intent after consent.

## 4. What can take a pawn over

| Cause | Mechanism | How the job ends |
|---|---|---|
| Constant think tree (every 30 ticks): flee a potential explosion, find oxygen and board or leave a gravship (Odyssey), join a caravan, hostility response (flee or fight), crawling | `Pawn_JobTracker.JobTrackerTickInterval` → `StartJob(…, InterruptForced)`. Gated by `ThinkNode_ConditionalCanDoConstantThinkTreeJobNow`: not downed (unless crawling), not burning, not in a mental state, not drafted, awake | `InterruptForced` |
| Lord duties (constant) | `LordDutyConstant` subtree | `InterruptForced` |
| Mental break | `MentalStateHandler` → `EndCurrentJob(InterruptForced)` | `InterruptForced` |
| Drafted | `Pawn_DraftController` → clears the job queue, `EndCurrentJob(InterruptForced)` | `InterruptForced` |
| Downed | `Pawn_HealthTracker.MakeDowned` → clears the pawn's mind and jobs | `InterruptForced` |
| Lost manipulation while carrying | `Pawn_HealthTracker` → `EndCurrentJob(InterruptForced)` | `InterruptForced` |
| Damage | `Pawn_JobTracker` → `CheckForJobOverride()` when the job def's `checkOverrideOnDamage` allows it (the default is `Always`) | `InterruptOptional` if another job wins |
| Job expiry | `expiryInterval` with `checkOverrideOnExpire` | `InterruptOptional`, or `Succeeded` without override |
| Death | the pawn is killed | stops everything |
| Normal completion or failure | job driver | `Succeeded`, `Incompletable`, `Errored`, `ErroredPather`, `QueuedNoLongerValid` |

`JobCondition` is a flags enum: `Ongoing`, `Succeeded`, `Incompletable`,
`InterruptOptional`, `InterruptForced`, `QueuedNoLongerValid`, `Errored`,
`ErroredPather`. The condition alone doesn't say why, so the job-end hook should add a
cause where we can see it (drafted, mental state, downed, constant-tree job def).

## 5. "What could this pawn do right now?"

There is no native call that lists options. `JobGiver_Work.TryIssueJobPackage` walks the
pawn's `WorkGiversInOrderNormal`: for each work giver it checks `PawnCanUseWorkGiver`,
`ShouldSkip` and `NonScanJob`, then scans `PotentialWorkThingsGlobal` (or cells) and
returns **the single best** job by work-type priority and distance, using reachability
and `HasJobOnThing`.

The options menu therefore reuses the same predicates per work giver: potential things,
`HasJobOnThing`, reachability, and a bounded top-N per giver. The right-click menu
(`FloatMenuMakerMap`) is location-based, so it doesn't fit.

Cost: enumeration pays pathing and reachability per candidate. It must run on the
coordinator's request (a core wake), bounded, cached per game tick, and never on the tick
path. **Not measured yet**; the spike measures it for three pawns.

## 6. Social interactions and ingestion

- **Interactions:** `Pawn_InteractionsTracker.TryInteractWith(recipient, intDef)` returns
  true on success. It runs `intDef.Worker.Interacted(…)` and logs
  `PlayLogEntry_Interaction(intDef, initiator, recipient, …)`. It is called for random
  interactions (on the tracker's tick interval) and from jobs. Identity: initiator,
  recipient and interaction def (Chitchat, DeepTalk, Insult, KindWords and so on); the
  resulting thoughts come from the def.
- **Ingestion:** `Toils_Ingest.FinalizeIngest` calls `Thing.Ingested(ingester,
  nutritionWanted)`, which returns the nutrition eaten and gives the food thoughts
  (`FoodUtility.ThoughtsFromIngesting`, for example eating raw food). Identity: the
  eater, the food thing and its definition, and the nutrition. The item count comes from
  the stack count before and after.

## Routing for new event kinds

`src/routing.ts` today sends unknown kinds to appraisal without interrupting. New kinds
therefore need explicit entries before they are emitted:

| New kind | Source hook | Route | Interrupts? |
|---|---|---|---|
| `job-start` | `Pawn_JobTracker.StartJob` postfix | native | no |
| `job-end` (with condition and cause) | `Pawn_JobTracker.EndCurrentJob` / `CleanupCurrentJob` | native | no |
| `haul-delivered` (carrier, def, count, zone) | `Pawn_CarryTracker.TryDropCarriedThing` | native; feeds agreement receipts | no |
| `ingested` (eater, def, count, nutrition) | `Thing.Ingested` | native; feeds self-care receipts | no |
| `interaction` (initiator, recipient, def) | `TryInteractWith` postfix | Chitchat and DeepTalk queued as today; others by def | only as the matching memory rules say |
| `downed` | `MakeDowned` | deliberation (like `casualty`) | yes |
| `seized` (drafted, mental break, constant-tree job) | the handlers above | native, recorded for receipts | no (the pawn can't act anyway) |

Only `haul-delivered`, `ingested`, `downed` and linked job ends should wake the core
(public, receipt-backed changes). Everything else is native texture.

## Inputs for Gate B

- **Harmony:** install the Harmony mod in the lab (preferred, and standard for players) or
  bundle the library. Declare the dependency in `About.xml` and note it in PROVENANCE.
- **Tag:** our saved `WorldState` maps `Zone.ID` to agreement ID. No agreement lives in a
  job driver.
- **Filter:** one prefix on `TryFindBestBetterStoreCellForWorker`, plus cancelling
  in-flight and queued tagged hauls on refusal or withdrawal.
- **Quota ("up to 30"):** a stockpile can't enforce a count. Count at the drop hook. When
  the remaining amount is used up, the same prefix skips the zone for everyone. Also cap
  `job.count` for new hauls into a tagged zone so in-flight jobs can't overshoot by more
  than one stack.
- **Receipts:** from the drop and ingestion hooks; job end only for timing and cause.
- **Options:** built on request from the work-giver predicates, bounded, measured.
- **Fixture:** work priorities on, one tagged stockpile for wood, the campfire fixture
  otherwise unchanged.

## Not verified here

- Tick cost of the filter and of option enumeration: measured in the spike.
- Interaction with other mods; the lab runs none besides ours.
- The exact reservation checks used by construction work givers: confirmed when
  construction migrates.
