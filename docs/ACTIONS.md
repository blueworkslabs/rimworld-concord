# Actions and agreements

Concord-directed colony work goes through the same path: an **offer**, the
pawn's own **answer**, and, if accepted, an **agreement** that native RimWorld jobs
carry out and the game's receipts account for. Eating is the one pawn-initiated
exception and has its own section.

Code: `src/protocol.ts` (schemas), `src/coordinator.ts` (lifecycle),
`src/haul-planning.ts`, `src/rescue-planning.ts`, `src/production-planning.ts`,
`src/pawn-eating.ts`, `src/decision-validity.ts`; native side in `mod/`.

## Offers and answers

An offer (`Proposal`) names one pawn, one action and a reason (≤1000 characters). The
operator/scripted core creates offers with `core().propose`; the live core creates them
only from listed opportunities ([CORE](CORE.md)). Offer IDs are UUIDs; re-sending the
same content is idempotent, different content under the same ID is rejected.

Only the addressed pawn answers, through its own handle:

| Answer | Effect |
|---|---|
| `accept` | Creates the agreement and dispatches the first step |
| `refuse` | Nothing starts; the live core won't offer this pawn the same work again (nor work that was withdrawn or stopped) |
| `defer` ("not now") | Nothing starts; from then on the live core makes this pawn no ordinary offers, and re-offers the deferred work once only if the pawn asks ([CORE](CORE.md#not-now-and-fresh-offers)) |
| `counter` | Nothing starts; proposes an alternative action |

A counter is adopted with `core().revise` (or the core's `adopt_counter`), which creates
a new offer with the exact counter action for the same pawn. It needs fresh consent.
A thread has at most two revisions; each child records `parentId` and `round`. The
pawn deciding a revision sees at most its two ancestors, all its own.

Every answer adds an owner memory (`<kind>: <offer reason>; <reply reason>`). A pawn
with a commitment or a running agreement cannot answer another offer, except a
replacement offer for that agreement.

## Agreements

Accepting an action other than `move` creates a standing agreement with a deadline of
acceptance tick + `maxTicks` and a number of steps (haul trips, meals, or 1). Accepting
requires a bridge that can cancel work.

- **Progress**: one native job per step. `advanceIntentions()` (polled by the
  operator) starts the next haul trip or meal only when the previous step finished and
  the pawn has no pending thought. A non-completed receipt stops the agreement; there
  is no automatic retry. It completes when all steps completed.
- **Stops**: the deadline, the pawn no longer being ready (below), withdrawal, or a
  failed step. The agreement's receipts stay; stopped work is not completed work.
- **Withdrawal by the pawn** (a reflection choice or `pawn(id).withdraw`): the stop is
  persisted first, then the specific job is cancelled. An action that was never
  dispatched gets a tombstone so it can't start later. Withdrawal authorizes nothing
  else.
- **Withdrawal by the core**: `withdrawOffer` works on pending offers only. It cannot
  cancel an agreement the pawn has accepted.
- **Moves** are commitments without a standing agreement: no deadline, no withdrawal.
- **Checkpoints** are allowed between steps, not while a job is running.

### Replacement handover

A running haul can be replaced by a rescue (see [requests](#rescue-alternative-requests)).
Accepting the replacement persists consent with the new action not yet dispatched,
withdraws the old agreement, and dispatches the rescue only after the old job's
cancellation is confirmed and a fresh observation still validates the rescue. If the
old work completed in the meantime, or its stop can't be confirmed, the handover fails
and nothing new is dispatched. The old agreement is already stopped at that point and does
not resume.

## Observations and holds

Shortlists are only usable when fresh: same epoch, observed at the current game tick,
on a known map. A missing observation is unknown, never "impossible".

Pending offers and running agreements **hold** their resources, so two pawns aren't
offered the same stack or bed. Holds have no timer; refusing, deferring or countering
releases them.

| Action | A new offer is blocked when this pawn has… | Conflicts with other pawns' holds on… |
|---|---|---|
| Haul | any held offer or agreement | the same source stack or destination cell (haul, build, cook) |
| Rescue | any held non-move offer, a commitment or a running agreement | the same patient or bed |
| Build, cook | any held offer or agreement | the same stack, the same campfire, or the same cell |
| Move | nothing (no check) | — (a pending move still holds its pawn against new haul, build and cook offers, and its cell against build and cook) |
| Eat | a commitment, running agreement, pending offer or unanswered counter | — |

## Readiness

Native readiness is checked at dispatch and on every reconcile (items marked * only at
dispatch):

| Action | Ready when |
|---|---|
| Move | spawned, alive, not downed, not in a mental state, not drafted |
| Haul | as move, plus hauling work enabled, Manipulation, Food ≥ 35 % and Rest ≥ 35 % |
| Rescue | as move, plus Caring work enabled, Manipulation, Food ≥ 35 %, Rest ≥ 35 %, carrying nothing* |
| Build, cook | haul readiness, plus Construction or Cooking enabled |
| Eat | available, has a Food need, Manipulation; Food < 90 % at dispatch and ingestion, not already eating*, carrying nothing* |

## Capabilities

### Move

`move {x, z}`. The mod lists up to 12 nearby cells (Manhattan distance 1–3, in line of
sight, standable, reachable without danger). Pawns see their own list; the scripted
core can query it. The live core cannot propose moves. Dispatch rechecks availability
and reachability. Completion means the pawn stood on the cell; any job change means
interrupted.

### Haul

`haul {thing, x, z, count 1–25, trips 1–3, maxTicks 60–3600}`. `count` is per trip;
`trips` is a maximum, not a promise; `maxTicks` covers the whole agreement.

The mod scans a 13×13 area in line of sight (up to 24 source stacks, 2 destinations
each, 6 options), skipping items already in valid storage. `supplies[]` reports each
stack's `sourceCount` and the destination's `destinationFree` at the observation tick.
The mod offers at most 10 units per trip (or the whole stack if smaller), and an offer
must fit the option: in practice `count ≤ 10` and `count × trips ≤ min(sourceCount,
destinationFree)`.

Each trip is revalidated at dispatch (map, readiness, stack, storage cell, reservation,
carry capacity, reachability) and at the drop. A trip completes only if exactly the
agreed count lands on the agreed cell; anything else fails with no rerouting.

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

A pawn running a haul can ask for one rescue of a casualty it has observed, without
giving up its current work (reflection choice `request_rescue_alternative`). The
request creates no job and holds nothing. Only the operator/scripted core can answer
it today: `declineRequest`, or `offerRequestedRescue`, which makes a **replacement**
offer if the haul is still running and a **standalone** offer if the haul has completed
and the pawn is free. A counter must name the same patient. Any answer other than a
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
changed map, increased portion or option no longer on the eligible shortlist.
`option-not-current` does **not** explain why native option generation omitted it.
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

Receipts report `started`, `completed`, `failed` or `interrupted` with the delivered
count where it applies (haul units, meals, eaten items). Progress shown to pawns, the
core and the crew log is derived from receipts only: `completed`, `active`,
`unconfirmed`, `unsuccessful`, `notStarted`, and `unfulfilled = agreed − completed`
([CREW_LOG](CREW_LOG.md#agreement-progress)).
