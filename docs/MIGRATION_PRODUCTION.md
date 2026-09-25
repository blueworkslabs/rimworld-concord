# Construction and cooking migration: native blueprints and bills (Gate A)

**Status: Gate A signed by Fable on 2026-09-25, with the eleven decisions recorded
under "Direction" and five verification items carried into Gate B entry.** Gate B
(design freeze) and Gate C (staging verdict) are not signed. This authorizes the
design work for the freeze, not implementation of runtime behaviour, a live run or
deletion of the ordered path. The pinned build is RimWorld 1.6.4871
(`Assembly-CSharp` prefix `082db1dd4f7f`), the same as the hauling migration.

## Goal

Build and cook agreements become native intents, following the hauling migration: the
core offers a shared piece of work, pawns fill it through their own work givers, and
the ordered build and cook jobs are retired once the native path has matched them.
The carriers are the game's own: a **blueprint** (becoming a frame, then a building)
for construction, and a **bill** on a workbench for cooking.

## Carried over from hauling (decided, not reopened)

- **Attribution-only by default.** Refusal, defer and withdrawal bind; helpers are
  credited as helpers, never as the accepting pawn. The exclusive variant stays
  scripted-only.
- **The tag is on the carrier, not on the materials.** Wood carried to some other
  blueprint, or berries cooked on some other bill, is not a violation.
- **No needs stop** for native intents: the game decides when a pawn eats or sleeps.
- **Capability comes from the game.** A pawn whose Construction or Cooking work type is
  disabled is never offered that work, and the reason is visible.
- **Silent wait, late answers lapse, observation age shown, failures counted per
  lane**, the bounded review wake, and the fitted-input evidence rule, all as merged.
- **Retirement writes one record** and the carrier becomes ordinary afterwards; a
  "since then" line reports what happened to it as ordinary play.
- **Growing hold stays parked.** Nothing here reopens B1.

## Direction (Fable, 2026-09-25; Gate A signed, Gate B not)

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
  (Gate A, C1), so a tag on one thing ID does not survive. **Proposal:** key the tag by
  (map, footprint cells, build def, rotation, placement generation), carried across the
  replacements, with the current thing ID recorded at each stage.
- **Who places it.** Mirroring hauling's stockpile source: the core may tag an
  **existing colony blueprint** (colony-public, placed by someone) or place one at an
  **operator-declared candidate site**. The core does not choose free map cells.
- **What counts as participation.** Two kinds of native work feed one build:
  **delivering materials** to the blueprint or frame, and **construction work** on the
  frame (several pawns may add work in turn; one finishes it). Each is credited per pawn.
  The game records neither delivery nor work shares, only the finisher (C2, C4), so both
  need our own receipts. Whether "built by" means the finisher, the largest work share,
  or everyone who did construction work is an open decision. Delivery also runs under
  Hauling (C3), so a pawn who cannot construct can still deliver.
- **What the receipt is.** Per pawn: units of each material delivered, construction
  work contributed, and who finished. **Complete** when a finished building of the
  tagged def stands on the tagged footprint. **Failed** when construction fails
  (materials partly lost, as the game does), the blueprint or frame is cancelled,
  destroyed or replaced, or the deadline passes. A refused pawn delivering or building
  on it counts as a violation, as in hauling.
- **What "since then" means.** Nothing more arrives at a finished building. The
  natural analogue is **its fate**, updated in place: "Since then: still standing, used
  for 4 meals", or "deconstructed at 14:00". Whether "used" belongs in that line (it
  needs bill attribution at the building) is an open decision.

### Cooking: a bill on a workbench

- **What the intent tags.** One bill on one colony workbench (today a campfire),
  identified by the bill's own load ID. The bill's repeat count is the quota: "cook up
  to 3 simple meals".
- **Who creates it.** The core may tag an **existing colony bill** or add a new bill to
  an existing colony workbench. It never builds the bench itself; that is a
  construction intent.
- **What counts as participation.** Each completed iteration has one bill doer, who
  fetched the ingredients and did the work. Credit is per pawn, per iteration: meals
  produced and ingredients consumed. Another cook completing an iteration is a helper.
- **What the receipt is.** Per iteration: doer, product def and count, ingredient defs
  and counts, tick. **Complete** at the repeat count; **failed or stopped** when the
  bill is deleted or suspended by the player, the workbench is destroyed or unusable,
  or the deadline passes. Making a meal is not eating it; eating stays the self-care
  choice it is today.
- **What "since then" means.** Two readings, both plausible, open for Fable:
  (a) **ordinary cooking at the same bench** after retirement, mirroring hauling's
  ordinary arrivals ("Since then: 5 more meals cooked here as ordinary work"); or
  (b) **the tagged meals' fate**: eaten by whom (the existing `ingested` receipts),
  spoiled, or still stored ("Since then: 2 eaten (Pedro, Beatrice), 1 stored").
  The internals favour (a): a meal carries no link to its bill, and stacks merge and
  split (K3).

## Scope

**In:** building one def at a time from a small listed set (campfire first); one
recipe at a time (simple meal first); tagging existing colony blueprints and bills;
operator-declared candidate build sites; several intents at once within topic
capacity; retirement of ordered build and cook; the legibility items below; paying the
readiness debt.

**Out:** the core choosing build sites or creating workbenches; research, mining,
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
- **The archive line** is the "since then" reading Fable selects above.

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
  replacement points (and at `FailConstruction`, below), which supports the footprint key
  proposed above.
- **C2. Who delivered what?** Not recorded natively. Delivery is a `HaulToContainer` job from
  `WorkGiver_ConstructDeliverResourcesToBlueprints`/`…ToFrames`; the deposit toil notifies
  only `INotifyHauledTo` containers, which `Frame` is not. The only per-pawn trace is
  transient (`HaulEnrouteAdded`/`Released` map events). Per-pawn delivery credit needs our
  own hook at the deposit into a tagged blueprint or frame, deduplicated like hauling's
  placement receipts. One delivery job may also fill other constructibles within 8 cells:
  credit must be per container, not per job.
- **C3. Delivery is also hauling.** Both delivery work givers are registered under
  **Construction and Hauling**. A pawn with Construction disabled can still deliver
  materials through Hauling, and `GenConstruct.CanConstruct` skips skill checks for the
  Hauling-typed givers. So "capability from the game" differs by participation kind, and
  refusal enforcement must cover both registrations.
- **C4. Who built it?** `JobDriver_ConstructFinishFrame` reserves the frame for one pawn at
  a time and adds to the saved `Frame.workDone`, so several pawns can contribute in turn,
  but only the finishing pawn is known natively (`CompleteConstruction(worker)`): quality,
  art and the `ThingsConstructed` record all go to the finisher. Work shares need our own
  per-tick or per-job accounting; "built by = finisher" is the only native answer (open
  decision 2).
- **C5. Eligibility.** Every construction work giver requires the target to be the
  pawn's faction; ordinary work skips forbidden things (`JobGiver_Work`). The ordered path
  forbids its blueprint precisely so ordinary work ignores it; a native intent must be
  unforbidden. `CanConstruct` also checks the work type is active (unless forced),
  construction/artistic skill prerequisites, ideology `MembersCanBuild`, blocking things,
  reach and reservations.
- **C6. Failure and cancellation.** `Frame.FailConstruction(worker)` destroys the frame
  (refunding half the materials) and spawns a **new blueprint** with a new ID, so a tag
  must follow it or the intent must stop (a decision for Gate B). Player cancel destroys a
  blueprint or frame with `DestroyMode.Cancel` (full refund for a frame). There is no
  cancel-specific callback: only generic destroy/despawn signals and map events, without
  the destroy mode on the map events.
- **C7. Completion hooks.** `CompleteConstruction` sends the faction quest signal
  `BuiltBuilding`, increments `ThingsConstructed`, notifies a lord, and spawning fires
  `BuildingSpawned`. Any of these can confirm completion; the finished building's own
  saved `questTags` fire `Destroyed`/`Despawned` later, which serves the fate reading of
  "since then" (deconstruction goes through `JobDriver_Deconstruct` with
  `DestroyMode.Deconstruct`).

### Cooking

- **K1. Bill identity is stable.** A bill has a saved `loadID` and
  `GetUniqueLoadID()`; the owning bench is `BillStack.billGiver`. Tagging a bill by load ID
  works for existing and new bills. (Who assigns the ID after `Clone()` or paste was not
  verified.)
- **K2. Per-iteration receipt.** `Toils_Recipe.FinishRecipeAndStartStoringProduct` makes
  the products, consumes the ingredients, then calls
  `Bill.Notify_IterationCompleted(billDoer, ingredients)` and `RecordsUtility.Notify_BillDone`
  (`MealsCooked` for meals). That call gives doer and ingredients per iteration; the
  product list is available in the same toil. Only the bill doer carries ingredients
  (inside its own `DoBill` job), so "who cooked" is unambiguous per iteration.
- **K3. Products cannot be traced back.** A meal holds its ingredient defs
  (`CompIngredients`) but no bill or cook. Stacks merge (`TryAbsorbStack` destroys the
  absorbed stack) and split on partial eating (`SplitOff` makes a new thing without
  `questTags`). The "meals' fate" reading of "since then" (open decision 4b) therefore
  needs our own per-unit tracking, which is fragile. Ordinary cooking at the same bench
  (4a) comes from the same `Notify_IterationCompleted` hook and is robust.
- **K4. Restriction versus attribution.** The native `pawnRestriction` (and slaves/mechs
  flags, allowed skill range) is enforced in `Bill.PawnAllowedToStartAnew`; a restricted
  bill is exclusive. Attribution-only with binding refusal means leaving the bill open and
  filtering refusing pawns for tagged bills. The ordered path's `ConcordBill` subclass works
  only for bills we create; an **existing** player bill keeps its class, so enforcement there
  needs a narrow patch on the start check, keyed by tagged load ID.
- **K5. Quota versus the player's repeat mode.** `Notify_IterationCompleted` decrements the
  bill's own `repeatCount`. A tagged existing bill may be "forever" or "do until X"
  (`RecipeWorkerCounter` counts map-wide, never per bill). The intent's quota must be its own
  counter from K2, not the bill's repeat settings, and tagging must not rewrite the player's
  bill.
- **K6. Interruption and deletion.** Without an unfinished thing, recipe progress lives only
  in the job and is lost if interrupted; hauled ingredients stay at the bench. (Whether the
  simple-meal recipe uses an unfinished thing is set in XML and was not verified.)
  `BillStack.Delete` marks the bill deleted and notifies the bench; `Clear()` does not mark
  it. Suspend and pause are field toggles with no event, so the intent must poll them.
  `DoBill` jobs fail when the bill is deleted, dereferenced or suspended, or the bench is
  unusable.

### Not yet verified (for Gate A review)

Recipe XML (unfinished thing for simple meals and campfire recipes), whether blueprint
and frame defs carry the forbid comp, who assigns a cloned bill's ID, destroy modes when
a blueprint is wiped by placing over it, and map-event subscription lifetime without
Harmony.

## Open decisions for Fable

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
