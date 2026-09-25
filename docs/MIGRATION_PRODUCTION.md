# Construction and cooking migration: native blueprints and bills (Gate A)

**Status: Gate B signed by Fable on 2026-09-25 at `e6ae274`, recorded in
`cddd61c`; the five answers and six conditions below stand.** Gate A direction is
signed too. Astra's subsequent assembly review corrected the receipt/transition claims
and identified the concrete technical design still required under P2/P3 before the
review/merge gate clears. This is not a request to re-sign those policy decisions.
Implementation and scripted trials are authorized after the documentation merge;
no live run, scene freeze or ordered-path deletion is authorized. Gate C is not signed.
Pinned build: RimWorld 1.6.4871 (`Assembly-CSharp` prefix `082db1dd4f7f`).

## Goal

Build and cook agreements become native intents, following the hauling migration: the
core offers a shared piece of work, pawns fill it through their own work givers, and
the ordered build and cook jobs are retired once the native path has matched them.
The carriers are the game's own: a **blueprint** (becoming a frame, then a building)
for construction, and a **bill** on a workbench for cooking.

## Carried over from hauling (decided, not reopened)

- **Attribution-only by default.** Refusal, defer and withdrawal bind ordinary pawn work; the signed player-forced
  exception below is separately attributed. Helpers are
  credited as helpers, never as the accepting pawn. The exclusive variant stays
  scripted-only.
- **The tag is on the carrier, not on the materials.** Wood carried to some other
  blueprint, or berries cooked on some other bill, is not a violation.
- **No needs stop** for native intents: the game decides when a pawn eats or sleeps.
- **Capability comes from the game, per role.** Construction-disabled pawns cannot be
  offered construction work, but may be eligible material deliverers through Hauling
  (C3). Cooking offers respect native bill eligibility too. Disabled roles have a visible
  not-offered reason; tagging never broadens native permissions.
- **Silent wait, late answers lapse, observation age shown, failures counted per
  lane**, the bounded review wake, and the fitted-input evidence rule, all as merged.
- **Retirement writes one record** and the carrier becomes ordinary afterwards; a
  "since then" line reports what happened to it as ordinary play.
- **Growing hold stays parked.** Nothing here reopens B1.

## Direction (Fable, 2026-09-25; Gate A signed)

Decisions on the eleven open questions below, in their order. The rule behind most of
them is the hauling rule: record what the game can prove, keep the tag on the carrier,
and let a failure be an event rather than something the tag quietly survives.

1. **Build tag identity: the footprint key, as proposed.** (map, footprint cells,
   build def, rotation, placement generation), with the current thing ID recorded at
   each stage. The tag moves at exactly the two replacement points (C1) and nowhere
   else. A thing of a different def appearing on the footprint fails the intent; it
   does not re-tag. The key and the stage record must survive save and cold restore.
2. **"Built by" is not a title we award.** The completion record names the finisher
   (the only native fact, C4) and lists every contribution: material units delivered
   per pawn, construction work contributed per pawn. Work shares are ours, measured as
   the change in the frame's saved work while a pawn's finish-frame job holds the
   reservation. Delivery alone is participation and is credited; whoever contributes
   without being the accepting pawn is a helper, labelled on first credit, as in
   hauling. Refusal binds for delivery and for construction work alike.
3. **Construction "since then" is the building's fate only.** Standing, destroyed or
   deconstructed, with the clock time. Later use is out: a cooking agreement at that
   campfire writes its own record.
4. **Cooking "since then" is (a): ordinary cooking at the same bench.** Same hook as
   the credited iterations, robust across stack merges and splits (K3). The meals'
   fate is not tracked per unit; eating already has its own receipts and stays a
   self-care choice.
5. **Carriers: both sources.** Existing colony blueprints and bills, core-placed
   blueprints at operator-declared candidate sites, and core-added bills on existing
   colony benches, mirroring the stockpile rule. The core never chooses free cells and
   never builds a bench inside a cooking intent.
6. **Refusal enforcement: the narrow work-giver filter, extended to all three.**
   Delivery under both its Construction and Hauling registrations (C3), construction
   work, and bill work through a narrow patch on the bill start check keyed by tagged
   load ID (K4). Not the native pawn restriction: it is exclusive, which contradicts
   attribution-only, and it rewrites the player's bill (K5).
7. **A failed construction stops the intent as failed.** The record says so, with the
   refund the game made. The fresh blueprint the game respawns is ordinary work; the
   core may offer it again with fresh consent. No automatic retry, the same rule the
   hauling migration applies to breaks and expiry.
8. **Quotas: one building per build intent; bill repeat count 1 to 3 for Gate C.** The
   intent's counter is ours (K5); the design must not depend on the bound.
9. **Defs for Gate C: campfire and simple meal only.** The list is configuration and
   can widen after the scene; the scene measures two things, not a catalogue.
10. **Failure accounting reports only what a receipt proves.** A failed construction
    records materials returned and lost as the game refunded them; an interrupted bill
    records no iteration and notes ingredients left at the bench only when the game
    left them. Where a hook cannot see a quantity the line says "not recorded"; no
    estimates.
11. **One Gate C scene for both, in two stages.** The campfire is the precondition for
    the meals, and the core named "campfire or cooking later" as its own reason in the
    hauling rerun. The scene is the first chance to see a plan across two agreements.
    Mechanism evidence stays per carrier in scripted trials, so the live read has one
    thing to judge: whether the core strings them.

**Carried into Gate B entry (verify before the freeze, on staging, no decompiled code
in the repo):** the simple-meal and campfire recipe XML (unfinished thing, K6); whether
blueprint and frame defs carry the forbid comp (C5); who assigns a cloned or pasted
bill's ID and that a clone never inherits a tag (K1); the destroy mode when a
blueprint is wiped by placing over it (C6); and map-event subscription lifetime.

**Readiness debt is paid in this migration**, as the page says: the borrowed Hauling
work-tag gate and the 35 % stop leave with the ordered path, and capability comes from
the Construction and Cooking work types' own disabled state.

## The four questions, per carrier

Hauling had to answer: what the intent tags, what counts as participation, what the
receipt is, and what "since then" means. Construction and cooking answer them
differently, because a built thing and a cooked meal are not a pile.

### Construction: a blueprint that becomes a building

- **What the intent tags.** One placed build: the blueprint, then the frame that
  replaces it, then the finished building. The game replaces the thing at each step
  (Gate A, C1), so a tag on one thing ID does not survive. **Decided:** key the tag by
  (map, footprint cells, build def, rotation, placement generation), carried across the
  replacements, with the current thing ID recorded at each stage.
- **Who places it.** Mirroring hauling's stockpile source: the core may tag an
  **existing colony blueprint** (colony-public, placed by someone) or place one at an
  **operator-declared candidate site**. The core does not choose free map cells.
- **What counts as participation.** Two kinds of native work feed one build:
  **delivering materials** to the blueprint or frame, and **construction work** on the
  frame (several pawns may add work in turn; one finishes it). Each is credited per pawn.
  The game records neither delivery nor work shares, only the finisher (C2, C4), so both
  need our own receipts. Name the finisher and list all material/work contributions
  (decision 2), not a single awarded "built by" title. Delivery also runs under
  Hauling (C3), so a pawn who cannot construct can still deliver.
- **What the receipt is.** Per pawn: units of each material delivered, construction
  work contributed, and who finished. **Complete** only after the exact successor of
  the tagged frame is successfully spawned and matched (C7/P1), not merely a same-def
  occupant. Construction failure/removal is **failed**, player cancellation/replacement
  is **stopped**, and the deadline is **expired**, as distinguished in P1.
  A refused pawn's ordinary delivery or construction counts as a violation. Explicit
  player-forced work instead uses the signed no-credit/no-violation exception.
- **What "since then" means.** Nothing more arrives at a finished building. The
  decided analogue is **its fate only**, updated in place: "Since then: still standing"
  or "deconstructed at 14:00". Later cooking has its own record (decision 3).

### Cooking: a bill on a workbench

- **What the intent tags.** One bill on one colony workbench (today a campfire),
  identified by the bill's own load ID. Our iteration counter supplies the quota:
  "cook up to 3 simple meals"; the player's repeat settings are independent (K5).
- **Who creates it.** The core may tag an **existing colony bill** or add a new bill to
  an existing colony workbench. It never builds the bench itself; that is a
  construction intent.
- **What counts as participation.** Each completed iteration has one bill doer, who
  fetched the ingredients and did the work. Credit is per pawn, per iteration: meals
  produced and ingredients consumed. Another cook completing an iteration is a helper.
- **What the receipt is.** Per iteration: doer, product def and count, ingredient defs
  and counts, tick. **Complete** at our quota, **stopped** on bill deletion,
  **failed** on bench removal, **expired** on deadline. Suspension stays open with a note and the deadline running (signature answer 2); temporary usability must not be mistaken for removal. Making a
  meal is not eating it; eating stays the self-care
  choice it is today.
- **What "since then" means.** **Ordinary cooking at the same bench** after retirement
  (decision 4): "Since then: 5 more meals cooked here as ordinary work". Meals carry
  no bill link and stacks merge/split (K3); no per-unit fate claim is made.

## Scope

**In:** building one def at a time from a small listed set (campfire first); one
recipe at a time (simple meal first); tagging existing colony blueprints and bills;
operator-declared candidate build sites; several intents at once within topic
capacity; retirement of ordered build and cook; the legibility items below; paying the
readiness debt.

**Out:** the core choosing undeclared build sites or creating a bench inside a cooking
intent (a separate construction intent may build the declared campfire); research, mining,
growing, medical recipes; priorities and the standing-commitment `ThinkNode`; eating
as an agreement (it stays a self-care choice); rescue as a native intent.

## Legibility (drafted for Gate B, ships with the migration)

- **The offer says what is offered:** "Build a campfire at the east site; others may
  help", "Cook up to 3 simple meals at the campfire; others may help". Cells and IDs
  are in the record, not speech.
- **Helpers are labelled** on their first credited contribution, as in hauling.
- **Completion writes one record:** "Campfire built at the east site (Pedro finished;
  Beatrice delivered 20 wood)". "3 of 3 simple meals cooked (Pedro 2, Alvin 1)".
- **Findable:** the crew log entry's "show" jumps to the blueprint, frame or building,
  or to the workbench; the bill's label in the bench's list names the agreement.
- **The archive line** uses the "since then" readings decided above.

## Readiness debt (carried from the hauling deletion)

`Production.Ready` intentionally retains the former `Hauling.Ready` checks unchanged,
including the 35 % food/rest stop and the incorrect shared
`WorkTagIsDisabled(WorkTags.Hauling)` gate. Remove that borrowed gate with this
migration: capability must use the work type's own disabled state (Construction or
Cooking), as hauling's not-offered path already does for its own work type. The needs
stop goes with the ordered path. Do not change build/cook behaviour silently before then.

## Retiring ordered build and cook

Budget a test-port PR before the runtime deletion PR, using the actual footprint as
the [hauling retirement ledger](MIGRATION_HAULING.md#retiring-the-ordered-haul) did.
The ordered path today is:

- mod: `Production` (options scanner, `BuildValid`/`CookValid`, `Start`, `Cleanup`,
  `ContinueBuild`), `ConcordBill` (a `Bill_Production` invisible to ordinary work), the
  `Concord_BuildMaterials`, `Concord_BuildFinish` and `Concord_Cook` job drivers and
  defs, and the `build`/`cook` cancel kinds;
- coordinator: `production-planning.ts`, the `Build`/`Cook` actions and their receipts,
  and production options in the core view;
- docs and tests: ACTIONS "Build a campfire" and "Cook simple meals", and the build and
  cook trials.

Frozen fixtures and evidence that cite ordered build/cook stay read-only, as the
ordered-haul records did.

## Gate A: internals questions

Checked against the pinned 1.6.4871 assembly by private decompile (ILSpy 8.2, as for
hauling); API availability is source evidence, not runtime proof. Proprietary output stays
outside the repository. Method names are cited; no game code is reproduced.

### Construction

- **C1. Does anything survive blueprint → frame → building?** No native link. Each step
  makes a new thing with a new ID: `Blueprint.TryReplaceWithSolidThing` destroys the
  blueprint and spawns the frame (`Blueprint_Build.MakeSolidThing`), and
  `Frame.CompleteConstruction(worker)` destroys the frame and spawns the building. Neither
  keeps a reference to its predecessor, and `questTags` are not copied. What does carry
  across is cosmetic (style, glower colour, storage settings) plus in-flight delivery
  reservations (`EnrouteManager.SendReservations`); pawns' paths and job targets are
  rewritten via `NotifyThingTransformed`. The tag therefore has to be ours, moved at both
  successful replacement points only. `FailConstruction` ends the intent and its fresh
  blueprint is ordinary work (decision 7). Nested destruction during a successful
  transition must not be mistaken for failure (P1).
- **C2. Who delivered what?** Not recorded natively. Delivery is a `HaulToContainer` job from
  `WorkGiver_ConstructDeliverResourcesToBlueprints`/`…ToFrames`; the deposit toil notifies
  only `INotifyHauledTo` containers, which `Frame` is not. The only per-pawn trace is
  transient (`HaulEnrouteAdded`/`Released` map events). Per-pawn delivery credit needs our
  own hook around the actual deposit action. A blueprint has no material container:
  `MakeSolidThingFromBlueprintIfNecessary` first replaces it, then the deposit targets
  the frame. `DepositHauledThingInContainer` is a toil factory, not the transfer itself.
  One job reuses the deposit toil for constructibles within 8 cells: credit must be per
  physical deposit and destination, not just per job/toil (P2).
- **C3. Delivery is also hauling.** Both delivery work givers are registered under
  **Construction and Hauling**. A pawn with Construction disabled can still deliver
  materials through Hauling, and `GenConstruct.CanConstruct` skips skill checks for the
  Hauling-typed givers. So "capability from the game" differs by participation kind, and
  refusal enforcement must cover both registrations.
- **C4. Who built it?** `JobDriver_ConstructFinishFrame` reserves the frame for one pawn at
  a time and adds to the saved `Frame.workDone`, so several pawns can contribute in turn,
  but only the finishing pawn is known natively (`CompleteConstruction(worker)`): quality,
  art and the `ThingsConstructed` record all go to the finisher. Work shares need our own
  actual work-delta accounting (decision 2). The final increment synchronously calls
  completion inside the same work action; settle that contribution before retirement,
  including any native overshoot beyond required work. Reservation time is not work.
- **C5. Eligibility.** Every construction work giver requires the target to be the
  pawn's faction; ordinary work skips forbidden things (`JobGiver_Work`). The ordered path
  forbids its blueprint precisely so ordinary work ignores it; ordinary native work
  requires an unforbidden target. A player may later forbid a tagged site without
  retiring it (entry item 2). `CanConstruct` also checks the work type is active (unless forced),
  construction/artistic skill prerequisites, ideology `MembersCanBuild`, blocking things,
  reach and reservations.
- **C6. Failure and cancellation.** `Frame.FailConstruction(worker)` destroys the frame
  (nominal half refund, randomly rounded with a minimum of one per resource stack)
  and spawns a **new blueprint** with a new ID. The intent stops as failed, never
  follows it (decision 7). Player cancel uses `DestroyMode.Cancel`: nominally all
  materials actually in the frame, not the full build cost. Placement can fail or merge,
  so these rules do not prove returned-unit counts. There is no
  cancel-specific callback: only generic destroy/despawn signals and map events, without
  the destroy mode on the map events.
- **C7. Completion hooks.** `CompleteConstruction` sends the faction quest signal
  `BuiltBuilding` **before** destroying materials/the frame and spawning the building;
  it is not success proof. Counters and notifications are not an identity chain either.
  Capture the exact successor inside the matching completion context and commit only
  after successful spawn with the expected map/def/footprint/rotation (P1).
  Fate tracking uses our saved building ID and destruction/despawn hooks, not assumed
  inherited `questTags`. Despawn alone proves departure, not destruction;
  deconstruction uses `DestroyMode.Deconstruct`.

### Cooking

- **K1. Bill identity is stable.** A bill has a saved `loadID` and
  `GetUniqueLoadID()`; the owning bench is `BillStack.billGiver`. Tagging a bill by load ID
  works for existing and new bills. Clipboard/paste initialization assigns a fresh
  clone ID; see entry item 3. Also retain bench/map and intent generation for attribution.
- **K2. Per-iteration receipt.** `Toils_Recipe.FinishRecipeAndStartStoringProduct` makes
  the products, consumes the ingredients, then calls
  `Bill_Production.Notify_IterationCompleted(billDoer, ingredients)` and
  `RecordsUtility.Notify_BillDone` (`MealsCooked` for meals). The default
  `RecipeWorker.ConsumeIngredient` destroys ingredients, and `Thing.Destroy` zeros their
  stack counts **before** the iteration callback. It cannot supply consumed amounts.
  Snapshot the actual selected/split portions before consumption and correlate confirmed
  consumption with products in one iteration context (P2). The production override does
  not call the base method; patching only the base misses it. Only the bill doer carries ingredients
  (inside its own `DoBill` job), so "who cooked" is unambiguous per iteration.
- **K3. Products cannot be traced back.** A meal holds its ingredient defs
  (`CompIngredients`) but no bill or cook. Stacks merge (`TryAbsorbStack` destroys the
  absorbed stack) and split on partial eating (`SplitOff` makes a new thing without
  `questTags`). Per-unit fate would need additional tracking and is out of scope.
  Ordinary cooking at the same bench uses the same joined iteration/product receipts,
  measured before storage/merge; production does not prove successful storage.
- **K4. Restriction versus attribution.** The native `pawnRestriction` (and slaves/mechs
  flags, allowed skill range) is enforced in `Bill.PawnAllowedToStartAnew`; a restricted
  bill is exclusive. Attribution-only with binding refusal means leaving the bill open and
  filtering refusing pawns for tagged bills. The ordered path's `ConcordBill` subclass works
  only for bills we create; an **existing** player bill keeps its class, so enforcement there
  needs a narrow patch on the start check, keyed by tagged load ID. Preserve the
  player's original restrictions: our filter can reject, never broaden eligibility.
  This candidate check does not re-run throughout queued/running jobs (P3).
- **K5. Quota versus the player's repeat mode.** The production iteration override
  decrements `repeatCount` only in repeat-count mode. An existing bill may be "forever" or "do until X"
  (`RecipeWorkerCounter` counts map-wide, never per bill). The intent's quota must be its own
  counter from K2, not the bill's repeat settings, and tagging must not rewrite the player's
  bill.
- **K6. Interruption and deletion.** Simple meals have no unfinished thing (entry item 1).
  Ending that job loses its work progress; a new job cannot resume through an unfinished
  item. This is not a save/load reset: `JobDriver_DoBill.ExposeData` saves `workLeft`,
  `billStartTick` and `ticksSpentDoingRecipeWork` for the same active job. Observe actual
  leftover ingredients, including carried ones; do not infer their location from interruption.
  `BillStack.Delete` marks the bill deleted and notifies the bench; `Clear()` does not mark
  it, and `RemoveIncompletableBills` also removes bills without that flag. Reconcile
  actual bill-stack membership, not only a delete flag/hook. Suspend and pause are
  field toggles with no event, so the intent must poll them.
  `DoBill` jobs fail when the bill is deleted, dereferenced or suspended, or the bench is
  unusable.

### Not yet verified at Gate A

Five items were carried into Gate B entry and are now checked; see
[Gate B entry](#gate-b-entry-the-five-verification-items-checked-2026-09-25).

## Gate B freeze (signed direction; technical review corrections below)

Clawd's draft, signed by Fable on 2026-09-25 with the signature conditions below.
The assembly review corrections preserve that direction; the unresolved concrete
boundaries in P2/P3 still block technical merge approval. Method names only, from the
pinned decompile; this is source evidence, not runtime proof.

### Gate B entry: the five verification items (checked 2026-09-25)

Checked on staging data (read-only) and the pinned decompile; nothing proprietary is in
the repository.

1. **Recipe XML (K6).** No meal recipe in the installed Core, Biotech or Odyssey data
   sets `unfinishedThingDef` (the only two in any recipe file are components).
   `CookMealSimple` inherits from `CookMealBase` without one. An interrupted simple meal
   therefore has no unfinished-item resume path after the job ends; the same saved
   active job does retain its work state (K6). The campfire lists
   `CookMealSimple` and `CookMealSimpleBulk`; Gate C tags only `CookMealSimple`
   (decision 9).
2. **Forbid comp (C5).** Every generated blueprint and frame def gets the forbid comp
   from its base def, and the forbid check has no exception for them: the player can
   forbid a tagged blueprint or frame, and ordinary work (including delivery) then skips
   it. `PlaceBlueprintForBuild` never forbids, so a core-placed blueprint starts
   unforbidden, unlike the ordered path, which forbids its own on purpose. **Freeze:** a
   forbidden tagged blueprint or frame is not a stop; it is polled
   and shown ("forbidden by the player") while the deadline runs.
3. **Cloned bills (K1).** `Clone()` makes a new instance and copies the base and
   production fields one by one; a subclass's extra fields are not copied unless it
   overrides `Clone`. Copying to the clipboard leaves the clone without an ID; pasting
   assigns a fresh load ID (`InitializeAfterClone`) before adding it to the stack. The tag
   lives in our saved state, keyed by load ID, never on the bill, and core-added bills
   are plain `Bill_Production`. **A clone never inherits a tag by construction;** scripted
   cooking case 7 checks it.
4. **Placing over a tagged blueprint or frame (C6).** The player's build designator first
   cancels frames whose replace tags match the new def (nominal full refund), then wipes the
   footprint with `DestroyMode.Deconstruct`, which the leavings rules treat as cancel for
   frames (nominal full refund of held contents; actual placements need receipts).
   Blueprints never leave resources. Direct `PlaceBlueprintForBuild`
   calls use the default `Vanish` wipe: a frame's materials are lost and no leavings
   spawn. **Freeze:** a tagged blueprint or frame wiped by the player's designator is
   `stopped: replaced by the player`, with the refund proved; a vanish wipe is
   `failed: removed`, materials in the frame recorded, returned 0 (proved: vanish spawns
   no leavings). Our own blueprint placement only uses a candidate site that is clear, so
   it never wipes anything.
5. **Map-event lifetime.** `MapEvents` is rebuilt with no subscribers whenever a map is
   generated or loaded; it is not saved. Vanilla subscribers resubscribe from per-map
   constructors, and a `MapComponent`'s `FinalizeInit` runs on both generation and load
   (the debug stepper can call it repeatedly). **Freeze:** receipts use method patches
   only (P2); no map-event subscription is needed. If one is added later, it subscribes
   from a map component with a guard against double subscription.

### P1. Tag lifecycle

**Construction** (one intent per footprint key, decision 1):

| Stage | Entered at | Recorded |
|---|---|---|
| `offered` → `blueprint` | acceptance; the core placed a blueprint at a candidate site or tagged an existing colony blueprint | key, blueprint thing ID, tick |
| `blueprint` → `frame` | `Blueprint.TryReplaceWithSolidThing`, when the created frame has the tagged def on the tagged footprint | frame thing ID |
| `frame` → `built` (met) | `Frame.CompleteConstruction(worker)`, when the spawned building matches def and footprint | building thing ID, finisher |
| → `failed` | `Frame.FailConstruction(worker)`; a different def appears on the footprint; the tagged thing is destroyed other than by cancel | cause, materials as proved (P2) |
| → `stopped` | player cancel (`DestroyMode.Cancel`, which is also how a frame's deconstruction ends), or replaced by the player's build designator (entry item 4); all accepted pawns withdrew before any delivery | cause, refund as proved |
| → `expired` | deadline passed before `built` | stage reached |

- A forbidden tagged blueprint or frame stays in its stage with a visible note (entry
  item 2). Record one logical ending, after resolving the scoped transition below;
  "first callback wins" is unsafe.
- Both legitimate replacements destroy their predecessor before the successor is spawned.
  Capture map, key/generation and exact predecessor before entering the method; defer
  only that context's nested removal. Capture and validate its actual spawned successor
  before committing the new stage. On failure/exception unwind the guard and reconcile
  any real removal without inventing a successor. Do not select a same-def occupant by
  footprint alone. Failure's nested destruction is joined into its single failed record,
  not a successful transfer to the new ordinary blueprint.
- The tag moves only at the two replacement points; every other disappearance is an
  event, never a re-tag. The blueprint respawned by `FailConstruction` is untagged
  ordinary work (decision 7).
- The key, stage and current thing ID are saved in `WorldState`. On load, the intent
  resolves its current thing by ID; if it is missing, it checks the footprint once and
  records `failed: tagged thing missing after load` rather than guessing.
- After `built`, the building's fate is watched by thing ID until it leaves the map
  (decision 3).
- All-accepted withdrawal stops only before any contribution; after work has begun
  the intent stays open to the deadline and helpers may finish (signature C2).
  Credited prior work stands, but later ordinary effects by a withdrawn pawn are blocked.

**Cooking** (one intent per tagged bill load ID):

| Stage | Entered at | Recorded |
|---|---|---|
| `offered` → `open` | acceptance; the core added a bill to an existing colony bench, or tagged an existing colony bill | bill load ID, bench thing ID, recipe, quota |
| `open` → `met` | our counter reaches the quota (decision 8) | per-iteration receipts |
| → `stopped` | tagged bill removed from its actual stack, including `Delete`, `Clear` or other removal; all accepted pawns withdrew before any iteration (signature C2) | cause |
| → `failed` | bench destroyed or despawned | cause |
| → `expired` | deadline passed | iterations reached |

- Suspension and pause have no event (K6): polled. **Decided:** a suspended bill stays
  `open` with a visible "suspended by the player" note; the deadline keeps running.
- A core-added bill is an ordinary `Bill_Production` (not the ordered `ConcordBill`),
  so ordinary cooks can do it. **Decided:** its repeat count is set to the quota
  so the bench stops at the agreed number; a tagged existing bill is never modified
  (K5). Our counter decides `met` in both cases.
- A player-forced refused iteration still decrements native repeat count, but earns
  zero intent credit. Thus a quota-2 bill can reach native repeat count 0 with only
  one credited iteration. Record that shortfall honestly and leave the unmet intent
  to its lifecycle/deadline; do not fabricate `met` or silently replenish the bill.
- After retirement the bench is watched for "since then": every later completed
  ordinary cooking iteration at that bench is recorded per pawn (decision 4).
- Reconcile saved load ID and bench membership on load; a missing bill is not replaced
  by a matching recipe or clone. Generation ownership for jobs begun before tagging and for re-tagged carriers is
  specified in P5.1. A physical iteration must not be
  both a new intent's credit and an old record's "ordinary since" work.

### P2. Receipt hooks

| Receipt | Hook | Proves |
|---|---|---|
| Material delivered | wrap the returned deposit toil's `initAction`, after blueprint-to-frame replacement; measure the actual destination's positive per-def transfer delta on each execution | pawn, def, units, frame; identity includes generation, destination and physical deposit occurrence, not just job/toil |
| Construction work | measure the exact frame's `workDone` at job start/end/interruption (signature C1), settling the final job delta in completion before terminal snapshot | actual work delta, including native overshoot; no per-tick patch, final-tick loss or end/completion double count |
| Finisher | successful `Frame.CompleteConstruction(worker)` context with exact spawned successor validated under P1 | pawn and building, not an early signal |
| Failed construction | `Frame.FailConstruction(worker)` context: contents before, observed positive leavings placement/merge deltas after | held units and actually returned units; otherwise "not recorded", never nominal fraction or final merged-stack size |
| Carrier removed | `Thing.Destroy`/`DeSpawn` for blueprint, frame and building, with mode where present and scoped transition/caller provenance | one removal/fate record; distinguish cancel, player-designator replacement, failure and generic departure; despawn alone is not destruction |
| Ingredient consumption | within the actual recipe finish action, snapshot selected portions after `CalculateIngredients` splitting and before `ConsumeIngredients`, correlate successful consumption | actual consumed defs/counts, not zeroed ingredient references at the later callback |
| Cooked iteration | actual `Bill_Production.Notify_IterationCompleted` override, joined with consumption and product observations | bill/doer/iteration/tick; this override does not call the base; one logical receipt |
| Products | `RecordsUtility.Notify_BillDone(billDoer, products)` in that same captured job/bill/iteration context, before storage | produced defs/counts, not successful storage; no bill parameter, so pawn-only matching is insufficient |
| Ordinary cooking since | the same joined receipt at the retired bench for ordinary iterations, excluding new active-intent credits | per pawn, per iteration, with generation ownership |
| Bill removed | `BillStack.Delete` plus membership reconciliation covering `Clear`, other removals and restore | stopped, no clone/recipe-based retag |

Receipts carry actor, intent, tick and a deduplication identity, as in hauling;
restores and retries must not count twice. These are required boundaries, not a proven
patch implementation. The intermediate ingredient snapshot, successor identity and final work delta are
specified in P5.4.
No new leavings hook for Gate C (signature answer 4). Without observed return quantities,
do not infer either returned or lost units by subtraction from a nominal refund.

### P3. The three filter points (decision 6)

For ordinary scans, all three candidate filters reject a pawn who refused, deferred
or withdrew, otherwise preserving native eligibility and player restrictions. Explicit
player-forced jobs use the signed exception below. Patch
cost is measured as it was for hauling. These filters are necessary, **not sufficient**.

1. **Delivery:** `WorkGiver_ConstructDeliverResourcesToBlueprints` and `…ToFrames`.
   Each class is registered under both Construction and Hauling (C3), so one patch per
   class covers both registrations. The main target is filtered in `JobOnThing`, and the
   8-cell nearby-needer scan (`FindNearbyNeeders` / `IsNewValidNearbyNeeder`) must also
   skip tagged containers for that pawn, or a refusing pawn could fill the tagged site as
   a side effect of an untagged delivery.
2. **Construction work:** `WorkGiver_ConstructFinishFrames.JobOnThing` for tagged frames.
3. **Bill work:** `Bill.PawnAllowedToStartAnew`, keyed by tagged load ID (K4).
   Simple meals have no unfinished-item resume search, but queued, current and restored
   active jobs still need the checks below.

**Admission and effect boundaries (specified in P5.1–P5.3, P5.5).** Jobs can be created
before tagging/refusal, and a nearby destination queue can already contain the tagged
site. `TryGetNextDestinationFromQueue` does not rerun our work-giver filters.
`DoBill` reservation/work checks likewise do not continuously recheck our bill predicate.
Specify treatment of existing current/queued work at tag admission, with pre-tag
contribution baselines; do not retroactively claim ordinary work. Recheck generation,
consent and native validity at actual job admission, queued destination selection,
blueprint conversion/deposit, and before further construction or recipe effects after
a consent change. Settle work at job boundaries, not with a per-tick accounting patch
(signature C1); specify synchronous interruption of an ordinary running job at withdrawal
and guards that prevent a pre-existing queued job from bypassing it. Define safe interruption and cargo/ingredient disposition on
withdrawal, including cleanup effects; no prohibited contribution may slip through.
Persist ownership across restore and release it on termination. These ordinary-job
boundaries must preserve the explicit player-forced exception; engine-forced flags
alone must not misclassify cleanup or coordinator-issued work as a player order.

**Decided by Fable:** refusal does not veto a player's forced order. Such work is
"ordered by the player (had refused)", with no agreement credit, helper label or
violation. Carry explicit player-order provenance through job admission, target changes,
receipts and restore; `PawnAllowedToStartAnew` itself has no `forced` argument, so a
blanket rejection there would also block the approved player path. The concrete design
must distinguish that context without broadening ordinary scans.

### P5. Concrete boundaries (Clawd, answering the technical hold)

This names the mechanism for each boundary that P1–P3 require "before technical merge
approval". Method names are from the pinned decompile, checked for each point below. No
game code is reproduced. Everything here is design, not a proven patch; P4 is the proof.

**P5.1 Ownership and generation.**
- Each carrier key (footprint key, or bill load ID plus bench) has a monotonic
  **generation**. Tagging opens generation *n*; retiring closes it; a later intent at the
  same key is *n+1*.
- A saved **job record** holds job load ID, pawn, provenance (P5.5) and a deposit
  counter. Its **carrier-scoped ownership segments** hold carrier key, intent,
  generation, kind (delivery, work or bill), admission tick and work baseline. One
  delivery job may have several segments: two tagged destinations must not share one
  job-global intent owner. Bind/recheck the actual destination's segment at selection,
  conversion and transfer; a successful blueprint/frame transition updates that
  segment's carrier ID without changing its intent or generation.
- Every receipt carries (intent, generation, physical occurrence ID). The occurrence IDs:
  - delivery: (job load ID, destination thing ID, deposit counter);
  - work: (job load ID, settlement number);
  - iteration: (bill load ID, per-bill iteration counter).
  Counters live in the saved ownership state, so a restore rolls them back with the game
  and a replayed event produces the same ID.
- **One owner per physical effect.** Resolve the segment for the actual carrier and
  generation, never the job's first target or another destination. It selects active
  agreement credit, that carrier's applicable ordinary-work watch, or uncredited
  ordinary work. Never both active credit and archived "ordinary since". Pre-tag and
  refused-player exceptions below remain uncredited even while an intent is open.
  Retiring one segment does not close another site's segment on the same job; re-tagging
  cannot silently move an old segment into the new generation.
- **Jobs begun before tagging.** At tag admission, every current and queued job touching the
  carrier gets an ownership record with provenance `pre-tag` and a baseline taken at that
  moment (`workDone`, container per-def contents, iteration in progress). Mark only the
  affected carrier segment pre-tag, not every later destination of that job. Its effects
  stay uncredited ordinary work until that job ends; this is an accounting boundary,
  **not a consent exemption**. Apply P5.3 at attachment for already-excluded pawns before
  acknowledging the tag, and at subsequent consent changes. Blocked attempts are not
  violations; any actual prohibited post-exclusion contribution is a violation even
  from a pre-tag job. The pawn's next job is admitted normally.
- **Saving.** Ownership, generation, counters and exclusions are saved in `WorldState`,
  inside the game save. The call-scoped contexts (transition, ingredient snapshot, player
  order) are never saved: saves happen between ticks, never inside these calls.
- **Restore.** A paired or cold restore (signature C3) restores both sides to the same
  point; the coordinator never keeps receipts past it. After load, the world component
  re-checks each pawn's restored current job under P5.2(a), because restored jobs do not
  pass through `StartJob`. Keep the saved work baseline and settlement counters on this
  recheck; do not reset progress as though a new job had started. Recheck queued entries
  too, without granting player provenance from `playerForced` alone.
- **Release.** At termination (met, failed, stopped or expired), open ownership records
  settle (P5.4), exclusions and filters for that generation are released, and only the
  "since then" watch remains. Close only the terminating carrier's segments, retaining
  job counters and other carriers' ownership. Capture the ordinary-work boundary before
  further effects so the terminal contribution cannot be counted again.

**P5.2 Admission points.** Each point rejects only an excluded pawn (refused, deferred or
withdrew) whose job provenance is not a player order. Everything else passes unchanged.
- **(a) Job start:** `Pawn_JobTracker.StartJob` prefix, for any job whose targets or
  destination queue touch a tagged carrier or whose bill is tagged. This covers new jobs,
  queued jobs (`fromQueue`), paused jobs resuming, and restored jobs through the post-load
  check. At this prefix the incoming candidate is not yet `curJob`: snapshot its ID,
  skip the original start, extract its queued wrapper if still present, and run queued
  cleanup with pooling disabled (or clear its reservations directly if already dequeued).
  Release its saved ownership segments and record `rejectedStart`, not an invented
  completed/incompletable job. Do not call `EndCurrentJob` on an unrelated current job,
  mutate the rejected candidate, or return it to the pool: callers/menu closures can
  still reference it. Once unreferenced it may be garbage-collected. Preserve unrelated
  current work. If idle, let the next native job-tracker tick seek work; never recursively
  schedule from this rejection. An incoming reference equal to the current job uses the
  current-job exclusion sweep instead of candidate disposal. The post-load path likewise
  sweeps real current jobs, rather than treating them as unstarted candidates.
- **(b) Queued destinations:** `Toils_Haul.TryGetNextDestinationFromQueue` postfix. A tagged
  destination for an excluded, non-player job yields "no next destination", so the chain
  ends and the cargo stays with the pawn under native rules. Filters alone miss this,
  because the queue is built before consent changes.
- **(c) Conversion and deposit:** the wrapped deposit toil (P2) re-checks consent and
  generation before the transfer. If the check fails, the job ends incompletable with no
  transfer. `MakeSolidThingFromBlueprintIfNecessary` gets the same check first, so an
  excluded pawn cannot even turn the blueprint into a frame.
- **(d) Recipe:** the wrapped recipe-work and finish toils (`DoRecipeWork`,
  `FinishRecipeAndStartStoringProduct`) re-check before work starts and before the finish
  action. If the check fails, the job ends before any effect.
- **Construction work** has no per-tick check (C1). Consent changes act through the sweep
  in P5.3.

**P5.3 Withdrawal and refusal sweep.** This runs synchronously in the mod when an exclusion
is applied (and at attachment with existing exclusions). Publish exclusions first,
then remove queued candidates, then interrupt matching current jobs with
`startNewJob: false`; acknowledge only after all affected pawns are reconciled.
This avoids native synchronous job finding halfway through the sweep. The ordinary
scheduler may seek work afterward through the same admission guards. Player-provenance
jobs are never swept.
- **Queued jobs:** extract matching entries and run their native queued-job cleanup,
  releasing reservations and saved segments, not just removing list elements.
- **Current delivery:** ended (`InterruptForced`) whether or not the pawn is carrying.
  Cargo follows native cleanup: it is dropped or kept, never deposited. Unlike a hauling
  trip, a delivery to a tagged site after withdrawal is a prohibited contribution, so it
  is not allowed to finish.
- **Current finish-frame job:** ended. Its work settles at cleanup and stands (C2).
- **Current `DoBill` job:** ended. No iteration. Ingredients already hauled stay where the
  game leaves them and are noted only if observed.
- **Cleanup effects:** `InterruptForced` still runs driver/toil finish actions and native
  carry cleanup; it is not a general no-effects guarantee. The inspected delivery,
  finish-frame and simple-meal drivers perform transfer/build/production in their normal
  actions, not those cleanup actions. Keep effect guards active through cleanup, settle
  work before the driver is cleared, and record observed cargo disposition. Acceptance
  must show no tagged-container deposit, completion or iteration from this interruption;
  an ordinary ground drop is not agreement delivery. Our settlement only reads.

**P5.4 The three captures named in P2.**
- **Ingredient snapshot.**
  - The finish toil's `initAction` is wrapped (same technique as the deposit toil) to open
    a call-scoped context keyed by (pawn, job load ID).
  - Inside it, a postfix on the private `Toils_Recipe.CalculateIngredients(Job, Pawn)`
    records each returned thing's def and `stackCount`. This point is after the portion
    `SplitOff` and before `ConsumeIngredients`, in the same action.
  - A successful-return postfix on `Toils_Recipe.ConsumeIngredients` marks consumption
    complete for this captured list. The snapshot proves selected quantities until then;
    a thrown/partial consume must not turn all selected units into consumed units.
  - The `Bill_Production.Notify_IterationCompleted` prefix binds the pending iteration
    to this job and bill; its successful-return postfix marks the iteration complete.
    Entering the callback alone is not completion: its body also invokes recipe hooks.
  - The `RecordsUtility.Notify_BillDone(billDoer, products)` prefix, inside the same context
    and matched by job load ID rather than pawn alone, adds product defs and counts as they
    are at that moment, before storage. It commits the one completed receipt only when
    both successful-return markers exist, using a context-local committed flag to dedup.
  - In `finally`, a completed but not-yet-committed iteration gets one receipt with
    "products: not recorded". A failure before completion gets a partial/error record,
    not iteration credit: retain selected quantities separately, consumed quantities only
    when proved (otherwise "not recorded"), and do not invent a refund or undo native
    repeat-count changes. Clear context and snapshots on every exit. The capture applies
    only to the signed simple-meal path; `CalculateIngredients` also serves unfinished
    things, outside this scope.
- **Successor identity.**
  - Prefixes on `Blueprint.TryReplaceWithSolidThing` and `Frame.CompleteConstruction` open a
    transition context: map, key, generation, predecessor ID, expected successor def (frame
    def, or `entityDefToBuild`).
  - While the context is open:
    - the predecessor's nested `Destroy` is deferred from the removal classifier;
    - a `GenSpawn.Spawn` successful-return postfix collects actual spawned objects on
      that map of the expected def at the key's position and rotation. Deduplicate by
      object identity if forwarded overloads are patched; repeated callbacks for one
      object are not multiple successors.
  - Exactly one distinct, still-spawned candidate is required. Conversion must return
    true and its out `createdThing` must be that candidate; frame completion must return
    normally with the predecessor removed. Only then commit the successor's stage/ID.
  - A conversion returning false with the original blueprint still intact (for example
    a blocking thing) leaves the intent open at `blueprint`, with no identity transfer.
    This failed pawn job is not a failed building. Zero/ambiguous successors **after real
    predecessor removal** yield `failed: successor not observed`. No removal and no
    qualified successor retain the old stage with a diagnostic. Never pick an unrelated
    same-def occupant by footprint.
  - A Harmony finalizer closes the context on exceptions and reconciles any real removal.
  - `FailConstruction` opens a failure context. Its nested destroy and the fresh ordinary
    blueprint join the single `failed` record; the tag never moves to that blueprint.
- **Final work delta.** The ownership record holds the frame's `workDone` baseline from job
  admission (re-taken at every `StartJob`, including resume from pause). Settlement:
  - (1) the `Frame.CompleteConstruction` prefix settles the finisher. The native tick adds the
    increment before calling completion, so the last tick and any overshoot are included.
    The `built` record is written only after this.
  - (2) the `Frame.FailConstruction` prefix settles the failing worker. Failure is rolled
    before that tick's increment, so no work is invented.
  - (3) the `Pawn_JobTracker.CleanupCurrentJob` prefix settles ends, interrupts and pauses if
    not already settled and the frame still exists.
  - A settlement is recorded once per (job load ID, settlement number). A frame missing at
    cleanup without a settlement yields "work: not recorded".

**P5.5 Player-order provenance.** `playerForced` alone is not trusted. `TryTakeOrderedJob`
sets it for every ordered job, including engine and coordinator paths.
- **Menu eligibility, before selection:** wrap the synchronous
  `FloatMenuOptionProvider_WorkGivers.GetWorkGiverOption` call in a pawn/target/work-giver
  scoped **preview** context (prefix/finalizer), including `ShouldSkip`, `HasJobOnThing`
  and `JobOnThing`. The native method constructs the candidate before `Chosen`, so a
  Chosen-only exception would hide the refused bill before the player could select it.
  The preview suppresses only Concord's exclusion filter, never native capability,
  restriction, forbidden or reachability checks. Merely opening a menu grants no job
  ownership, reservations of our own, or saved player authority. Scope the synchronous
  method, not an iterator factory whose body executes after return.
- **Actual player order:** a separate scoped `FloatMenuOption.Chosen` context stamps the
  specific job passed through `TryTakeOrderedJob` as `player`, saved by job load ID.
  Admission still validates the candidate's current carrier/generation; a previewed but
  unchosen candidate gets no exception if later submitted by a non-player path.
- **Player prioritization:** save a priority-order token (pawn, map, work giver, cell,
  order generation) when `TryTakeOrderedJobPrioritizedWork` succeeds inside that Chosen
  context. Before predicates execute, wrap `JobGiver_Work.GiverTryGiveJobPrioritized`
  only when it matches that token and the pawn's current `priorityWork`. Mark its returned
  candidate player-provenance before `StartJob`. Do not scope the whole
  `TryIssueJobPackage`: its fallback ordinary scan must remain excluded. Clear the token
  when priority work clears/replaces or no longer matches; restore it with its saved
  order identity. A bare priority field or returned `playerForced` is not enough.
- **Mod-issued jobs** (those with our action record) are never `player`. Any other
  `playerForced` job is ordinary and goes through admission.
- **Bills:** `PawnAllowedToStartAnew` has no forced argument. Consult the matching menu
  preview or authenticated priority-probe context for candidate checks; consult the
  saved job provenance at admission/effects. Do not equate a scanner's `forced` argument
  with player authority, nor broaden ordinary scans after either context exits.
- The signed refused-player exception is carrier-specific: effects on a carrier whose
  exclusion is overridden read "ordered by the player (had refused)", with no credit,
  helper label or violation. Do not falsely add "had refused" to other player jobs or
  bypass native eligibility. An uncredited iteration still decrements native repeat
  count, as P1 records.

### P4. Scripted cases per carrier (lab, before any scene)

**Construction (campfire):**
1. The accepting pawn delivers and builds: delivery and work credited, finisher named,
   `built`.
2. An unasked pawn delivers: credited and labelled as a helper on first credit.
3. In ordinary work, a refusing pawn with Construction enabled never delivers to or
   works on the tagged site; a refusing pawn with only Hauling enabled never delivers
   (both registrations). Player-forced work is covered separately in case 13.
4. An untagged blueprint within 8 cells of the tagged one: a refusing pawn's delivery to
   the untagged one never fills the tagged one.
5. Work shared: the acceptor is interrupted mid-frame, a helper finishes; work shares sum
   to measured work deltas (including the final tick and any overshoot), and the helper
   is the finisher. Failure before a work increment earns no invented work.
6. Forced construction failure: `failed`, materials and returned units as proved; the
   respawned blueprint is untagged; a new offer needs fresh consent.
7. Player cancels the blueprint, then (separately) the partially filled frame: `stopped`
   with returned units observed or explicitly not recorded. Include odd counts, merging
   into an existing stack, and placement failure if claiming exact refunds.
8. A different def appears on the footprint: `failed`, no re-tag.
9. Save and cold restore at `blueprint` and at `frame`: stage, IDs and credits survive
   exactly, with no double counting.
10. After `built`, deconstruction: the "since then" line shows it with the clock time.
11. The player forbids the tagged blueprint: ordinary work stops, the note shows, the
    stage and deadline are unchanged; unforbidding resumes it.
12. The player places a different building over the tagged frame: `stopped: replaced by
    the player`, distinguished from a direct vanish wipe and generic destruction;
    nominal full refund is not a substitute for observed placed units.
13. Player-forced delivery and construction after refusal: see the signed added case below.
14. Successful blueprint/frame replacements each survive nested removal with exactly
    one stage transition (including forwarded spawn callbacks). A blocking thing makes
    conversion return false without removal: intent stays open at blueprint, then can
    convert after unblocking. Removed predecessors with absent/ambiguous successors fail;
    failed/aborted replacements never falsely complete or retag.
15. Tag with current/queued ordinary delivery or work; then refuse/withdraw while
    carrying, mid-work and after a nearby destination queue was built. Enforce the
    specified admission/cleanup disposition with no post-withdrawal credit or effect.
    Include already-excluded attachment, incoming-candidate rejection with an unrelated
    current job, pre-reserved queue entries and cleanup-triggered scheduling; no leaked
    reservation, wrong-job termination or reentrant prohibited start.
16. One job deposits into two independently tagged sites through the reused toil:
    both physical deposits count once at their own destination, including after restore.
17. Same-def replacement or a later intent at the same footprint never inherits an
    old generation's credit; pre-tag baselines remain ordinary work.

**Cooking (simple meal at the campfire):**
1. A core-added bill, quota 2, cooked by the acceptor: two iteration receipts, `met`.
2. A helper cook completes one iteration: credited and labelled.
3. In ordinary work, a refusing cook never starts the tagged bill but still cooks an
   eligible untagged bill at the same bench. Player-forced work is case 10.
4. A tagged existing player bill set to "forever": our counter reaches the quota, the
   bill's own settings are unchanged, and later iterations appear in "since then".
5. Delete or clear the tagged bill: `stopped`, including after restore. Suspension
   stays open with the note and deadline running (signature answer 2).
6. An iteration interrupted mid-work: no iteration recorded; ingredients noted at the
   bench only if the game left them there.
7. Copy and paste the tagged bill: the clone is untagged (entry item 3).
8. Save and cold restore mid-work: the same active job's saved progress, counter and
   receipts survive exactly; no duplicate or prematurely complete iteration.
9. The bench is destroyed: `failed`.
10. Player-forced cooking after refusal: see the signed added case below.
11. Consume a selected partial ingredient stack: the receipt records its nonzero
    consumed quantity, not the larger source stack or destroyed references' zero.
    Merge/drop products after production; produced units remain exact without claiming storage.
    Inject failure during consumption and inside iteration notification: selected is not
    automatically consumed, callback entry is not completed, and partial failure gets no
    iteration credit or duplicate fallback receipt.
12. Tag with a current/queued bill job, then refuse/withdraw during ingredient hauling
    and recipe work. Enforce the specified admission/cleanup boundary before prohibited
    effects, without widening the player's bill restrictions.
13. Re-tag a bill/bench while old jobs or archived records exist: no iteration receives
    both active-intent credit and ordinary-since attribution, and no stale generation wins.

**Scene (Gate C, decision 11):** one scene, two stages: the campfire agreement, then
cooking at it. The live read judges only whether the core strings the two agreements
into a plan; mechanism evidence is the scripted cases above.

### Gate B questions as posed (answered by the signature below)

1. Refusal and player-forced orders (P3).
2. A suspended tagged bill: open with a note (proposal), or stopped.
3. Core-added bills: repeat count set to the quota (proposal), or "forever" with only
   our counter.
4. If the leavings of a failed or cancelled frame cannot be observed reliably:
   "not recorded" (decision 10), or a narrow hook on the leavings spawn.
5. Construction deadline: one deadline for the whole build, or per stage.

## Gate B signature (Fable, 2026-09-25, at `e6ae274`)

Fable signed the freeze at `e6ae274`, with the five answers and conditions below.
Later assembly-review corrections above do not claim a new signature or runtime proof.
Conditions are part of the freeze; the implementation and the scripted cases must meet
them before Gate C is entered.

### The five answers

1. **Refusal binds the pawn's own work scan, not the player's orders.** The three filter
   points act when the work giver scans (`forced == false`). A player's forced order on a
   tagged site or bill goes through, because the player's authority is native and the
   agreement is between the core and the pawn. What that pawn then does is recorded as
   **"ordered by the player (had refused)"**: no agreement credit, no helper label, and
   **not a violation**. The violation measure counts only work the pawn's own scan let
   through. Two scripted cases are added for it (construction 13, cooking 10).
2. **A suspended tagged bill stays `open` with the note**, deadline running, the same
   way a forbidden blueprint or frame does. Only deletion stops it.
3. **Core-added bills get their repeat count set to the quota.** The bench then stops
   at the agreed number on its own, and our counter still decides `met`. A tagged
   existing bill is never modified.
4. **"Not recorded" first; no leavings hook for Gate C.** Case 6 shows whether the
   before/after reading in P2 sees the refund. If it does not, the record says "returned:
   not recorded". A narrow hook on the leavings spawn is added only if a reader of the
   scene asks for the number.
5. **One deadline for the whole build.** Stages are ours, not the game's, and the player
   cannot see them; at expiry the record names the stage reached, as P1 already says.

### Conditions

- **C1. Work shares are measured per job, not per tick.** The `Frame.workDone` delta is
  read when a finish-frame job on a tagged frame starts, ends or is interrupted, and
  credited to that job's pawn. No per-tick patch. Patch cost is measured as it was for
  hauling and reported with the scripted evidence.
- **C2. Withdrawal after work began does not stop the intent.** "All accepted pawns
  withdrew" stops the intent only before any delivery or iteration. After that the intent
  stays open to the deadline, helpers may finish, the withdrawal is recorded with its
  reason, and credited work stands, as in hauling.
- **C3. Cold restores run in a new coordinator process**, paired with a same-process
  restore, for construction case 9 and cooking case 8, as the hauling retirement did.
  Stage, IDs, counters and receipts must match exactly with no double counting.
- **C4. The readiness debt is paid in the implementation PR**, not after: the borrowed
  Hauling work-tag gate and the 35 % stop leave with the ordered build and cook, and
  capability comes from the Construction and Cooking work types' own disabled state.
  The retirement follows the hauling sequence: test-port PR, then deletion PR, only
  after Gate C.
- **C5. Every legibility text in the "Legibility" section ships with the migration**,
  including the forced-order and suspended/forbidden notes above, and the failure record
  with its refund line. Cells and IDs stay in the record, never in speech.
- **C6. The scene freeze is a separate document** (as `HAULING_MIGRATION_LIVE_FREEZE`
  was): frozen save and setup with SHA-256, the operator-declared candidate site, the
  materials on the map, the runtime commit, and the annotate-only grounding flag on. I
  sign that before the live run; nothing here authorizes one.

### Added scripted cases

- **Construction 13.** A refusing pawn is force-ordered by the player to deliver to, then
  to build, the tagged site: the work happens, the record reads "ordered by the player
  (had refused)", no credit, no helper label, no violation counted.
- **Cooking 10.** A refusing cook is force-ordered onto the tagged bill: first prove the
  real player menu exposes the eligible option before selection. An unchosen preview
  and a non-player `playerForced` submission must not bypass ordinary exclusion; a
  selected order and its authenticated priority continuation must pass, including restore.
  Then one iteration
  happens, recorded the same way, not counted toward the quota. For a core-added
  quota-2 bill, follow it with one credited iteration: native repeat count is 0,
  credited count is 1, and the intent is not falsely met or the bill silently refilled.

## Gate A open decisions (as posed; decided under "Direction")

1. **Build tag identity** across blueprint → frame → building: the footprint key
   proposed above, or something else.
2. **"Built by":** finisher only, largest work share, or every contributor; and whether
   material delivery alone is participation or helping.
3. **Construction "since then":** the building's fate only, or its fate plus later use.
4. **Cooking "since then":** (a) ordinary cooking at the bench, or (b) the tagged meals'
   fate.
5. **Where carriers come from:** existing colony blueprints and bills only, or also
   core-placed blueprints at operator candidate sites and core-added bills on existing
   benches.
6. **Refusal enforcement:** extend the narrow work-giver filter to delivery (both its
   Construction and Hauling registrations), construction work and bill work, or use a
   bill's native pawn restriction for cooking (exclusive, not attribution-only; K4).
7. **After a failed construction:** the game respawns a fresh blueprint (C6). Does the tag
   follow it, or does the intent stop as failed?
8. **Quotas:** one building per build intent; bill repeat count 1–3 or wider.
9. **Which defs:** campfire and simple meal only for Gate C, or a small listed set.
10. **Failure accounting:** how materials lost on a failed construction, and ingredients
   in an interrupted bill, appear in receipts and the crew log.
11. **One Gate C scene for both**, or construction first and cooking second.
