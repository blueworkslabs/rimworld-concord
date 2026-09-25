# RimWorld internals for native intents

Gate A of the [native-intents phase](NATIVE_INTENTS.md): the six questions whose answers
shape the spike design. Written by Clawd on 2026-09-24; checked by Astra against
the pinned assembly and Core defs. **Architecture disposition pending:** the review
found bypasses of the proposed eligibility filter and an unsupported one-stack
overshoot bound. Gate B must resolve these before implementation; see below.

**Build studied: the staging build, which is the source of truth for this note.**

- RimWorld **1.6.4871 rev600** with Biotech and Odyssey (the runtime version from
  `Player.log`; the install's `Version.txt` still says rev598)
- `Assembly-CSharp` SHA-256 prefix **`082db1dd4f7f`**, byte-identical to Astra's
  preflight copy
- the Core `ThinkTreeDefs`, `WorkGiverDefs` and `JobDefs` from the same install

Every claim below was verified on this build. An older local copy (game 1.6.4633
rev1273) exists on the inference host and was **not** used. If a later check finds a
difference between builds, it is recorded here rather than resolved silently.

**Version trap:** the assembly's metadata version (for example `1.6.9676.18020` here,
`1.6.9438` for the older copy) is **not** the game version. The real version comes from
the game's version-conversion code, `Player.log` and save headers. The pinned build for
this phase is 4871 rev600.

**Decompile recipe** (output stays private, never committed): .NET 8 SDK installed per
user, `ilspycmd` 8.2.0.7535 as a global tool, run with
`DOTNET_ROOT=~/.dotnet DOTNET_ROLL_FORWARD=Major ilspycmd -t <Type> Assembly-CSharp.dll -r <Managed dir>`
to decompile single types. Only type, method and field names are cited here.

## Summary

| Question | Short answer | Consequence for the spike |
|---|---|---|
| 1. Does hunger pre-empt a running haul? | Hunger alone does not interrupt an ordinary haul. At the next main-tree decision, food outranks normal work when eligible; queued and prioritized work are exceptions. | "Work survives a meal" means: after eating, the pawn picks the tagged haul again by itself. Test it at trip boundaries. |
| 2. Where does a native haul choose its destination, and can we see it at drop time? | At job creation (`StoreUtility.TryFindBestBetterStorageFor`), but the drop toil can re-target. Ordinary carried haul placement goes through `Pawn_CarryTracker.TryDropCarriedThing`, with per-placement callbacks. | Count callback quantities at each actual destination, including partial placement before a failed return; not from job end. |
| 3. The narrowest place to keep a refusing pawn off tagged work | For hauling: the per-slot-group store search, `StoreUtility.TryFindBestBetterStoreCellForWorker`. It covers ordinary, opportunistic and re-targeted storage searches, not all ways an item can reach a zone. | Useful search filter, not complete consent enforcement. Existing jobs, haul-aside fallback and cleanup drops need an explicit policy. |
| 4. What can take a pawn over mid-agreement? | The constant think tree every 30 ticks, mental breaks, drafting, going down, damage, job expiry. | Receipt vocabulary: `InterruptForced` versus `InterruptOptional`, plus a cause captured from the hook. |
| 5. "What could this pawn do now", in one call? | Not natively. `JobGiver_Work` returns the single best job. A menu has to reuse its predicates per work giver. | Build options on request, bounded per work giver, never on the tick path. Cost is measured in the spike. |
| 6. Where do social interactions and ingestion fire? | `Pawn_InteractionsTracker.TryInteractWith` and `Thing.Ingested`, both with full identity. | Two narrow postfixes give exact events for routing. |

Prerequisite resolved by Astra on 2026-09-24: official **Harmony mod v2.4.2.0**
installed before Core and main-menu boot verified on 4871 rev600. No colony was loaded.
Declare `brrainz.harmony` in the spike's `About.xml`; do **not** bundle a duplicate
library. See [Gate B inputs](#inputs-for-gate-b).

## 1. Hunger and a running haul

- The **main think tree** is only evaluated when a pawn has no job
  (`Pawn_JobTracker.TryFindAndStartJob`), when a job expires with `checkOverrideOnExpire`,
  or when something calls `CheckForJobOverride` (for example damage, see question 4).
  Nothing in the food need calls it.
- In `MainColonistBehaviorCore`, a `ThinkNode_PrioritySorter` chooses between
  `JobGiver_GetFood` and `JobGiver_Work` (among others). `GetFood` returns priority 9.5
  when Food is below the race's `FoodLevelPercentageWantEat`. `Work` returns 9 during
  scheduled work time, 5.5 in "anything" time and less otherwise. Thus eligible food
  beats **normal work** in this sorter, not every higher main-tree branch or queued job. Prioritized work is an explicit exception below.
- Starving pawns also have `ThinkNode_ConditionalStarving` → `GetFood` in the emergency
  block, but that too is evaluated only at a decision.
- A native haul is `JobDefOf.HaulToCell` driven by `JobDriver_HaulToCell`: one stack (plus
  opportunistic duplicates of the same kind) per job. `HaulToCellStorageJob` sets no
  expiry. Hunger alone does not cut this ordinary trip short. An independent override
  (such as damage) can evaluate the main tree mid-trip and select food.
- The job def is not `suspendable`, but allows an opportunistic prefix (question 3).

**Meaning for the spike:** test ordinary hunger-driven meals between trips. The agreement survives if the
tagged haul is still eligible when `JobGiver_Work` next runs. Our current ordered-job
model stops work below 35 % Food. Gate B removes that Concord needs-stop for tagged
intents; native needs belong to the pawn/game. Withdrawal, refusal, expiry and quota
remain Concord lifecycle boundaries, distinct from native job interruptions.

## 2. Haul destination and the drop

- `WorkGiver_HaulGeneral` (work type Hauling, `priorityInType` 15) scans
  `listerHaulables` and calls `HaulAIUtility.HaulToStorageJob`. That picks the
  destination with `StoreUtility.TryFindBestBetterStorageFor`: slot groups in priority
  order, selecting a suitable cell with a bounded randomized search (not a
  guaranteed globally closest cell). The cell becomes the job's target B;
  `job.count` accounts for storage space; actual pickup is also bounded by carrying
  capacity. It is not an agreement-wide quota.
- The drop happens in `Toils_Haul.PlaceHauledThingInCell`, via
  `Pawn_CarryTracker.TryDropCarriedThing(cell, …)`. If it fails, the toil **re-targets**
  to another store cell, possibly in a different stockpile. Failing that, it hauls
  aside, or in rare cases destroys the item.
- `Zone_Stockpile.Notify_ReceivedThing` fires when anything arrives in a stockpile, but
  it doesn't know who brought it.
- Zones have a stable `Zone.ID`.

**Meaning for the spike:** wrap/preserve `placedAction(Thing, int)` on both
`Pawn_CarryTracker.TryDropCarriedThing` overloads. Capture the carrier and agreement
context before the call; record each callback's added count and the placed thing's
actual map/cell/zone. `GenPlace.TryPlaceDirect` invokes it for whole/partial stack
merges and spawned stacks. A **false** overall return can follow a successful partial
merge; `Near` placement can touch multiple cells. Neither the requested cell, the
last resulting stack's total, nor success alone is a delivery receipt. Preserve any
existing callback and prevent duplicate credit; never infer placement from destruction.

This is a choke point for the inspected **carry-tracker haul placement**, including
re-targets, not every arrival in a zone. For example,
`Toils_Recipe.FinishRecipeAndStartStoringProduct` can place products directly through
`GenPlace.TryPlaceThing`, without the carry tracker. Gate B must define its supported
arrival sources and test the promised counting scope; a zone-arrival notification
alone still cannot identify a carrier. Job start/end measure timing, not quantities.

## 3. Keeping a refusing pawn off tagged work

The inspected **stockpile-search routes** pass through the private
`StoreUtility.TryFindBestBetterStoreCellForWorker(thing, carrier, map,
faction, slotGroup, …)`, called once per slot group:

- ordinary hauls (`HaulToStorageJob` → `TryFindBestBetterStoreCellFor`);
- **opportunistic hauls**, which the job tracker adds as a prefix to other jobs
  (`Pawn_JobTracker.TryOpportunisticJob`);
- the drop toil's re-target;
- bill products stored in the best stockpile (`TryFindBestBetterStoreCellFor`) or
  a specified stockpile (`TryFindBestBetterStoreCellForIn`).

A prefix there that skips a tagged group for a pawn who refused, deferred or withdrew
(or, in the exclusive variant, for any pawn who didn't accept) covers all of these at
the cost of one dictionary lookup per group. It is narrower and cheaper than the
per-cell `IsGoodStoreCell`.

**It is not a universal placement/eligibility choke point.** The drop toil's
`CanHaulAside` fallback uses `TryFindSpotToPlaceHaulableCloseTo` /
`HaulablePlaceValidator`, not the store-search worker; that validator does not exclude
stockpile zones. Cleanup/cancellation also drops carried items with `ThingPlaceMode.Near`
without a storage search. Thus even cancelling a refused haul can physically place
its carried wood in the tagged zone. `HaulToCellStorageJob` also accepts an already
chosen cell; it does not itself re-run the worker.

Gate B must choose and verify the missing admission/execution/placement safeguards,
or explicitly distinguish incidental/emergency drops from participating in tagged
work. A receipt after placement cannot enforce a refusal retroactively. Do not block
emergency cleanup blindly or discard carried items. The tag constrains the destination
zone, not the wood: hauling the same wood to another stockpile is not a violation.

The search prefix also does **not** cover jobs created before the refusal: their
target is already fixed,
and opportunistic hauls may sit in the job queue. On refusal or withdrawal, the mod must
end the pawn's current job if it targets the tagged zone and drop matching queued jobs.
The existing scoped cancel is a starting point, not proof that native tagged-job
matching or its cleanup-placement policy is implemented.

Other intents need other filters, to be chosen at migration:

- **Bills** already have a native pawn restriction (cooking uses it today).
- **Blueprints and frames** are probably best filtered where their work givers check
  reservations. `ReservationManager` is the generic chokepoint, but also the hottest.
- **Player "prioritize" work** is a native way to ask one pawn to do one thing next; see
  [Prioritized work](#prioritized-work-evaluate-dont-build).

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
  eater, the food thing and its definition, and the nutrition. For ordinary stackable
  food, item count comes from the stack count before and after (full destruction
  clears that stack on this build). Corpse/body-part ingestion needs separate checks.

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
| `intent-ordinary` (an ordinary arrival at a tagged zone) | `NativeIntents` ledger | native; feeds the archive line | no |
| `seized` (drafted, mental break, constant-tree job) | the handlers above | native, recorded for receipts | no (the pawn can't act anyway) |

Only `haul-delivered`, `ingested`, `downed` and linked job ends should wake the core
(public, receipt-backed changes). Everything else is native texture.

## Inputs for Gate B

- **Harmony:** installed and menu-boot checked. Reference the mod's
  `Current/Assemblies/0Harmony.dll`, declare `brrainz.harmony` in `About.xml` with
  load order before Concord, and record provenance. Never bundle a second copy.
- **Tag:** our saved `WorldState` maps `Zone.ID` to agreement ID. No agreement lives in a
  job driver.
- **Filter:** the search prefix plus current/queued cancellation is insufficient
  alone. Resolve the fallback, cleanup and preselected-cell boundaries in section 3.
  The zone is tagged, not the wood.
- **Quota ("up to 30"):** count per agreement across all carriers, helpers included,
  in both consent variants; credit each actual carrier. Cap new `job.count`, but that
  alone does **not establish** the claimed one-stack bound: three pawns can each
  obtain a 30-item job before the first delivery, yielding 90 against 30 (two extra
  capped loads). Define whether "one stack" means a capped load or the item's native
  stack limit; also cover older, larger loads re-targeted into the zone. Gate B must
  supply an in-flight accounting/admission or placement rule that proves the agreed
  bound, and test re-targeted/pre-carried jobs as well. Do not hide excess deliveries.
  The filter skips everyone only while an exhausted agreement is still open; retiring
  the agreement retires its tag and restores an ordinary stockpile. Define the cutoff
  and treatment of outstanding deliveries explicitly.
- **Needs:** remove the 35 % Concord needs-stop for native intents; native hunger and
  rest remain game-owned, with matched meal-resumption tests.
- **Receipts:** from the drop and ingestion hooks; job end only for timing and cause.
- **Options:** built on request from the work-giver predicates, bounded, measured.
- **Fixture:** work priorities on, one tagged stockpile for wood, the campfire fixture
  otherwise unchanged.

### Prioritized work: evaluate, don't build

RimWorld's right-click "prioritize" is a native, per-pawn "do this next" that could carry
a **standing commitment** after consent, possibly making the later `ThinkNode`
unnecessary. What it is, on 4871 rev600:

- **State:** `Pawn_MindState.priorityWork` (`Verse.PriorityWork`) stores one cell, one
  work-giver def and a start tick, and is saved with the pawn.
- **Normal player entry point:** `Pawn_JobTracker.TryTakeOrderedJobPrioritizedWork`, if
  the work giver has `prioritizeSustains`. Construction (deliver to blueprints and frames,
  finish frames) and campfire cooking sustain; **general hauling does not**.
- **Used:** by the emergency `JobGiver_Work`, which runs in the colonist block **before
  both normal and starving `GetFood`**. It retries related work givers at that one cell,
  and the resulting jobs are `playerForced`.
- **Cleared:** when no related job is left at the cell, after 30,000 ticks (about half an
  in-game day), when drafted, when the pawn's mind is reset (for example going down),
  or by the player's "clear prioritized work" button.

Questions for Gate B (evaluation only, nothing built in the spike):

- **Does it survive a meal?** Worse: it **outranks** the meal. A prioritized pawn keeps
  doing that work before eating, even when starving, until the work at the cell runs out
  or times out. Using it for commitments would need a Concord release rule for needs,
  which is the seam we're leaving, so it only suits short, bounded tasks.
- **What clears it:** see above. Refusal or withdrawal would have to clear it
  explicitly.
- **Does it respect the eligibility filter?** It goes through the work giver's own
  `HasJobOnThing` and `JobOnThing`; this is not proof that every giver/destination
  respects one store filter (see section 3). Also,
  hauling can't use it (no `prioritizeSustains`), and construction and cooking filters
  are chosen at their migration.

Verdict for now: a candidate for **short, explicit "do this next" commitments** such as
one campfire build, not for open-ended standing work. The spike doesn't use it.

## Not verified here

- Tick cost of the filter and of option enumeration: measured in the spike.
- Interaction with other gameplay mods; the lab now includes Harmony plus our mods.
- Runtime behavior of the proposed hooks: this review is static assembly/defs analysis,
  not a gameplay acceptance run. Callback preservation, refusal fallback, concurrent
  quota, partial merges and re-targets require scripted Gate C coverage.
- The exact reservation checks used by construction work givers: confirmed when
  construction migrates.
