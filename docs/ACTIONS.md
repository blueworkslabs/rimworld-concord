# Actions and agreements

Concord-directed colony work goes through the same path: an **offer**, the
pawn's own **answer**, and, if accepted, an **agreement** that native RimWorld jobs
carry out and the game's receipts account for. Eating is the one pawn-initiated
exception and has its own section.

Two execution models share these rules:

- **Ordered jobs** (move, rescue, build, cook, eat): each capability is a hand-built
  shortlist, validator and custom job issued as an ordered job under a persisted action
  ID, with one receipt per job.
- **Stockpile hauls** (`haul-zone`): native intents. The pawn agrees to help fill a
  tagged stockpile through its ordinary hauling work; the game's intent ledger reports
  aggregate progress ([NATIVE_INTENTS](NATIVE_INTENTS.md),
  [MIGRATION_HAULING](MIGRATION_HAULING.md)). The ordered exact-stack haul was retired
  in [#80](https://github.com/blueworkslabs/rimworld-concord/pull/80).

Status: implemented. Move, rescue and eat have live-model evidence; build and cook are
scripted-tested (real game, scripted decisions) only; stockpile hauling is
scripted-tested and passed Gate C on the game side in ordinary live play
([HAULING_MIGRATION_GATE_C](trials/HAULING_MIGRATION_GATE_C.md)). Rules below apply
to both unless they name one.

Code: `src/protocol.ts` (schemas), `src/coordinator.ts` (lifecycle),
`src/native-intents.ts` (haul-zone schema, frozen entries, wakes, progress),
`src/rescue-planning.ts`, `src/production-planning.ts`, `src/pawn-eating.ts`,
`src/decision-validity.ts`; native side in `mod/` (`NativeIntents.cs` and
`IntentPatches.cs` for hauling).

## Offers and answers

An offer (`Proposal`) names one pawn, one action and a reason (≤1000 characters). The
operator/scripted core creates offers with `core().propose`; the live core creates them
only from listed opportunities ([CORE](CORE.md)). Offer IDs are UUIDs; re-sending the
same content is idempotent, different content under the same ID is rejected.

Only the addressed pawn answers, through its own handle:

| Answer | Effect |
|---|---|
| `accept` | Creates the agreement; ordered work dispatches its first step, a stockpile haul asks the game to admit the pawn |
| `refuse` | Nothing starts; the live core won't offer this pawn the same work again (nor work that was withdrawn or stopped). For a stockpile haul the game also excludes the pawn from that intent |
| `defer` ("not now") | Nothing starts; from then on the live core makes this pawn no ordinary offers, and re-offers the deferred work once only if the pawn asks ([CORE](CORE.md#not-now-and-fresh-offers)). A stockpile haul also excludes the pawn in the game |
| `counter` | Nothing starts; proposes an alternative action |

A counter is adopted with `core().revise` (or the core's `adopt_counter`), which creates
a new offer with the exact counter action for the same pawn. It needs fresh consent.
A thread has at most two revisions; each child records `parentId` and `round`. The
pawn deciding a revision sees at most its two ancestors, all its own. A counter to a
stockpile haul must name the same intent, and can be adopted only while the intent is
still pending; after the first acceptance the quota is fixed and the counter stays
recorded.

Every answer adds an owner memory (`<kind>: <offer reason>; <reply reason>`). A pawn
with a commitment or a running agreement cannot answer another offer, except a
replacement offer for that agreement.

## Agreements

Accepting an action other than `move` creates a standing agreement with a deadline of
acceptance tick + `maxTicks`.

**Ordered agreements** (rescue, build, cook) have a number of steps (meals for cook,
otherwise 1). Accepting them requires a bridge that can cancel work.

- **Progress**: one native job per step. `advanceIntentions()` (polled by the
  operator) starts the next meal of a cooking agreement only when the previous step
  finished and the pawn has no pending thought. A non-completed receipt stops the
  agreement; there is no automatic retry. It completes when all steps completed.
- **Stops**: the deadline, the pawn no longer being ready (below), withdrawal, or a
  failed step. The agreement's receipts stay; stopped work is not completed work.

**Stockpile-haul agreements** have no steps, no action ID and no commitment. Accepting
queues the pawn's admission (`intent-accept`), which is resent on reconcile until the
game's intent view lists the pawn as accepted; if the game excluded the pawn or closed
the intent without admitting it, the agreement stops.

- **Progress**: the intent's aggregate view (delivered, quota, per-carrier credit).
  The agreement completes when the shared quota is met, and stops when the intent
  expires or the operator stops it. There is no needs or readiness stop; the game's own
  work givers handle needs, schedules and priorities.
- **Lapsing**: an offer still pending when its intent closes lapses. An answer that
  arrives afterwards is kept as said and starts nothing.

For both:

- **Withdrawal by the pawn** (a reflection choice or `pawn(id).withdraw`): the stop is
  persisted first. Ordered work: the specific job is cancelled, and an action that was
  never dispatched gets a tombstone so it can't start later. Stockpile haul: the pawn is
  excluded from the intent (retried until confirmed); a trip it is already carrying
  finishes natively and is credited to the carrier, flagged as started before the
  exclusion. Withdrawal authorizes nothing else.
- **Withdrawal by the core**: `withdrawOffer` works on pending offers only. It cannot
  cancel an agreement the pawn has accepted.
- **Moves** are commitments without a standing agreement: no deadline, no withdrawal.
- **Checkpoints** are refused while a pawn holds a commitment (an ordered job or eating
  in flight). They are allowed between meals and while a stockpile haul is open.

### Replacement handover

A running stockpile haul can be replaced by a rescue (see
[requests](#rescue-alternative-requests); design in
[MIGRATION_HAULING B7](MIGRATION_HAULING.md#b7-rescue-replacement-for-a-native-agreement)).
The handover is durable and re-entrant from reconcile:

1. **Consent.** Accepting persists consent and a dispatch ID before anything is sent.
   The old agreement stops and the pawn's exclusion from the intent is queued. The
   rescue is held as a running agreement with no step yet, owned by the pawn and
   withdrawable.
2. **Exclusion.** Nothing proceeds until the game's intent view confirms the exclusion.
3. **Drain.** Then the pawn must have empty hands and no longer be on the tagged haul
   trip captured at consent. That trip finishes natively; the haul job is never
   cancelled.
4. **Dispatch.** A fresh observation must still validate the rescue and the pawn must
   still own it; the rescue is then dispatched once under the persisted ID.

The handover stops, dispatching nothing, if its deadline (acceptance tick + the
rescue's `maxTicks`) passes, the pawn no longer holds the replacement, or fresh
validation fails. The old agreement is already stopped and does not resume. The crew
log records the dispatch request and any stop. The code keeps a replacement path for
ordered agreements, but it is unreachable: a request can only be made against a
running stockpile haul.

## Observations and holds

Shortlists are only usable when fresh: same epoch, observed at the current game tick,
on a known map. A missing observation is unknown, never "impossible".

Pending offers and running agreements **hold** their resources, so two pawns aren't
offered the same stack or bed. Holds have no timer; refusing, deferring or countering
releases them.

| Action | A new offer is blocked when this pawn has… | Conflicts with other pawns' holds on… |
|---|---|---|
| Stockpile haul | no per-pawn hold check; the pawn must be able to haul (Hauling work enabled), and the offer must match a frozen entry whose intent is pending or open (at its fixed quota once open) | — (the quota is shared; the game's ledger reserves in-flight units) |
| Rescue | any held non-move offer, a commitment or a running agreement | the same patient or bed |
| Build, cook | any held offer or agreement | the same stack, the same campfire, or the same cell |
| Move | nothing (no check) | — (a pending move still holds its pawn against new build and cook offers, and its cell against build and cook) |
| Eat | a commitment, running agreement, pending offer or unanswered counter | — |

For every kind, a pawn whose intent exclusion is not yet confirmed gets no new offer.
The live core adds its own filter: it lists opportunities only for pawns without a
pending offer, unanswered counter, commitment or running agreement
([CORE](CORE.md#what-the-core-sees)), and a pawn has to be free to answer.

## Readiness

Native readiness of ordered work is checked at dispatch and on every reconcile (items
marked * only at dispatch):

| Action | Ready when |
|---|---|
| Move | spawned, alive, not downed, not in a mental state, not drafted |
| Rescue | as move, plus Caring work enabled, Manipulation, Food ≥ 35 %, Rest ≥ 35 %, carrying nothing* |
| Build, cook | as move, plus the Hauling work tag enabled, Manipulation, Food ≥ 35 %, Rest ≥ 35 %, plus Construction or Cooking enabled (`Production.Ready`) |
| Eat | available, has a Food need, Manipulation; Food < 90 % at dispatch and ingestion, not already eating*, carrying nothing* |

A stockpile haul has no readiness check after acceptance and no needs stop. A pawn whose
Hauling work type is disabled is never offered one, and the reason is recorded.

## Capabilities

### Move

`move {x, z}`. The mod lists up to 12 nearby cells (Manhattan distance 1–3, in line of
sight, standable, reachable without danger). Pawns see their own list; the scripted
core can query it. The live core cannot propose moves. Dispatch rechecks availability
and reachability. Completion means the pawn stood on the cell; any job change means
interrupted.

### Stockpile haul

`haul-zone {intentId, thing, x, z, w, h, quota 1–75, maxTicks 600–60000, variant,
label?, zoneId?, hold?}` (`HaulZone` in `src/native-intents.ts`):

- `thing`: a def name such as `WoodLog`;
- `x, z, w, h`: the stockpile's rectangle (each side 1–64);
- `variant`: `exclusive` or `attribution`;
- `zoneId`: an existing colony stockpile, or -1 for an operator-declared candidate site
  of at most 64 cells;
- `hold`: `strict` (the migration configuration) or `growing` (parked; only an explicit
  experiment may configure it);
- `label`: the stockpile's name in speech and records.

The operator freezes the list of offerable hauls once (`configureNativeHauls`), at most
one per (stockpile or site, def). An offer must match one frozen entry field by field
(spike-era actions without `label`, `zoneId` or `hold` mean the defaults). The quota
can differ only while the intent is pending; once the first acceptance has opened it,
it is fixed. The first acceptance tags the stockpile in the game; accepted pawns haul
there through their ordinary work, others may help, and each carrier is credited for
its own deliveries. The game decides trips, order and timing. Semantics, ledger and
accounting: [NATIVE_INTENTS](NATIVE_INTENTS.md) and
[MIGRATION_HAULING](MIGRATION_HAULING.md).

The ordered `haul {thing, x, z, count, trips, maxTicks}` was retired in
[#80](https://github.com/blueworkslabs/rimworld-concord/pull/80). A store or paired
checkpoint that still holds one fails to open or restore; there is no automatic
migration.

### Rescue

`rescue {target, bed, x, z, maxTicks 60–3600}`: carry one downed colonist into one
exact medical bed. The patient must be a downed, living colonist of the colony on the
same map, not in a bed. The bed must be a single-slot colony medical bed, free,
reachable and usable. The mod lists up to 6 visible patient/bed pairs within 12 tiles.

An offer is invalid, before or after the pawn answers, if a fresh observation shows the
rescuer downed or not ready, a changed map, the patient standing or in bed, or the bed
moved, occupied or no longer medical. Missing observations are unknown, not invalid.
A pending rescue decision is aborted as soon as it becomes invalid.

Completion requires the patient alive, in that bed, and no longer carried. If the job
is interrupted, the patient is dropped where the carrier stands. Rescue is not
treatment, and there's one attempt with no retry.

### Rescue alternative requests

A pawn with a running stockpile haul can ask for one rescue of a casualty it has
observed, without giving up its current work (reflection choice
`request_rescue_alternative`). The request creates no job and holds nothing. Only the
operator/scripted core can answer it today: `declineRequest`, or
`offerRequestedRescue`, which makes a **replacement** offer if the haul agreement is
still running and a **standalone** offer if it has completed and the pawn is free. A counter must name the same patient. Any answer other than a
counter closes the request.

### Build a campfire

`build {thing, x, z, maxTicks 60–3600}`. Offered only when no campfire, blueprint or
frame is visible within 12 tiles; uses the nearest visible wood stack with at least 20
logs and offers up to 2 legal sites. The mod places a forbidden blueprint (so ordinary
work can't pick it up), has the pawn carry the 20 wood, then build. Completion means a
finished campfire. On failure the leftovers stay forbidden and nothing is refunded or
finished for free.

### Cook simple meals

`cook {thing, target, x, z, count 1–75, meals 1–3, maxTicks 60–7200}`. `target` is a
usable campfire; `thing` is one visible ingredient stack; `count` is the ingredient
units one simple meal needs. Each meal is one native bill with repeat count 1,
restricted to the accepting pawn, limited to that ingredient and invisible to
ordinary work. A meal completes when exactly one simple meal is made from exactly
`count` ingredients. Making a meal is not eating it.

### Eat

Eating is not an offer. It exists only as a choice when a pawn answers a core question:
`say`, `stay_silent`, or `eat {thing, text}`. The core cannot order it.

The mod lists up to 6 visible raw berries or simple meals within 12 tiles that the pawn
will eat, with a portion of at most 25 items sized to its nutrition need. The
coordinator offers them only to a pawn without commitments, pending offers or
unanswered counters. After the choice it re-reads the options and dispatches the fresh
(possibly smaller) portion with an 1800-tick limit.

The receipt counts **food items**, not nutrition: it completes if at least one and at
most the portion were eaten and nutrition went up. Only the operator-held
`pawn(id).stopEating` can stop it; no model route can. The completed receipt is what
closes a self-care follow-up topic ([CORE](CORE.md#topics)).

Native RimWorld picks food on its own, and its ordinary food search skips raw berries
until these fixture pawns are urgently hungry; native genes can alter that rule
(in our diagnosis: no eating at 20 % Food, eating at 10 %). The `eat` choice lets
a pawn decide earlier; it still respects `WillEat`, forbidden items and reservations.

### Eating rejection diagnostics

Admission checks and their limits are unchanged. A failed eating revalidation records
an operator-audit `eatingValidation` object on `core-answer-failed`: first failed
coordinator gate, selected ID, offered/check/observation ticks, map IDs and offered/
current portion counts. Examples include an existing commitment, stale observation,
changed map or option no longer on the eligible shortlist. An eat choice is identified by
its thing. The dispatched count is the chosen count, and at most the current portion (the
smaller of the two). A portion that grows while the pawn thinks no longer fails the
choice; one that shrinks dispatches the smaller current portion. The mod rejects only
counts above its current portion.
`option-not-current` does **not** explain why native option generation omitted it.
**One fresh-menu deliberation (Fable).** When an eat choice fails only because the chosen
food is no longer on the menu (`option-not-current`), the pawn gets exactly one more
deliberation, within the same deadline: a fresh question view with the current menu and
the note "The food you chose is no longer available…". This is new input, not a reroll;
the pawn may choose again, say something or stay silent. The audit records
`core-answer-requeued` with the validation. A second rejection stands and is recorded as
`core-answer-failed`. No other rejection code is requeued. The rejected first answer
is never published; only a successfully applied answer appears. Cancellation during
the fresh-state read cannot record a requeue or start a second call.
Earlier schema failures, cancellations or a question no longer being answerable keep
their existing errors. This diagnostic is not added to a character's public core perspective.

Native eating dispatch receipts add `failureCode` and `validatedTick`, persisted
with the action. Codes distinguish unavailable pawn/manipulation, satisfied Food,
existing carrying/ingestion, missing/unsupported/forbidden/inedible food, diet,
map/local-view, portion, reservation/reachability, position, deadline and scheduler
rejection. Only the **first failed check** is reported, not all possible causes.
`outside-local-view` retains the existing combined radius/fog/line-of-sight test.
Old receipts remain readable; a missing code is unknown, not success. Later native
job interruption still uses its existing lifecycle reasons. These additions do not
retroactively determine the causes of PR61's two historical Alvin failures.

## Receipts

Ordered-job receipts report `started`, `completed`, `failed` or `interrupted` with the
delivered count where it applies (meals, eaten items). A stockpile haul has no per-job
receipt: its receipt is the intent's aggregate view (`pending`, `open`, `met`,
`expired` or `stopped`, delivered against quota, per-carrier credit, helpers and
ordinary arrivals). Progress shown to pawns, the core and the crew log is derived from
these only: `completed`, `active`, `unconfirmed`, `unsuccessful`, `notStarted`, and
`unfulfilled = agreed − completed` ([CREW_LOG](CREW_LOG.md#agreement-progress)).
