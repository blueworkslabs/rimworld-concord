# Bounded hauling and standing consent

`haul` names one exact source thing ID, one storage cell, 1–25 units per trip,
1–3 trips, and a 60–3600 game-tick lifetime. It is not a general work priority.
Changing the item, cell, quantity or limits requires a new offer and pawn consent.
Counters execute nothing; the existing revision path returns a fresh offer.

The game offers at most six local options from a visible radius-six square,
examining at most 24 eligible source candidates and at most two destinations per source.
Nearby cells are searched nearest-first. Options carry the map ID, epoch/tick and
are neither reservations nor promises. Only the pawn's own view reaches its
backend. The core's query projects physical opportunities without private state.

## Observed supplies and planning holds

The separate `supplies` array pairs each source/cell option with its item label,
`sourceCount` and `destinationFree`. These are quantities observed now, not a
promise that three trips will finish. `count` remains units **per trip** and
`trips` a maximum consent bound. Native suggestions use up to three trips where
both observed supply and storage capacity permit. A pawn may choose fewer.

New haul offers and revised counters require a fresh mapped observation and
sufficient observed quantity/capacity for their full bounded scope. Per-trip
quantity cannot exceed the observed option. Older bridges without quantity/map
metadata cannot create new grounded haul offers. Existing durable receipts still
replay; an old pending agreement without a map fails native dispatch rather than
silently targeting another map.

Within one coordinator, pending offers and accepted work hold the whole source
stack and storage cell for planning purposes. Offer creation serializes the
check and durable write; there is no second reservation database. Queries and
pawn perspectives omit options held by another pawn, without disclosing that
pawn's private reasons. One pawn cannot accumulate competing haul offers.
These conservative holds prevent our own duplicate plans; they do not reserve
anything in RimWorld, stop native workers, or guarantee future availability.

Refusal or a counter releases the original offer's hold. A counter by itself
holds nothing: adopting it requires fresh preflight and consent. The core can
`withdrawOffer(id, reason)` for a **pending** offer, invalidating late acceptance.
It cannot use that operation to cancel accepted pawn-owned work. Accepted holds
remain between trips and across paired checkpoints; completion or pawn withdrawal
releases them, but uncertain active-job cancellation retains its hold until
reconciled. Pending holds have no automatic timer; an abandoned offer must be
explicitly withdrawn. Restoring a checkpoint restores that timeline's holds.

This is conservative coordination, not a global hauling optimizer. A blocked
bounded shortlist does not prove that no other work exists. Unrelated native work
can still invalidate an accepted offer; failures remain terminal and visible.

Native execution rechecks source, quantity, storage settings/capacity,
reachability, reservations, voluntary availability, manipulation and hauling
capability. Native toils reserve, walk and carry. A job-specific exact-cell drop
records delivered units; pawn position or an unrelated inventory change cannot
establish completion. No opportunistic additional stack or alternate destination
is allowed. A failed or interrupted trip stops the agreement rather than retrying.

The pawn owns a standing intention. `reconcile()` records outcomes; explicit
operator polling of `advanceIntentions()` starts the next accepted trip without
inference. Each ID and commitment is committed before dispatch. Lost replies
reconcile by ID. A stopped intention never schedules further work. Acceptance of
another proposal is blocked even in the gap between trips.

Food or rest below 35%, unavailability, elapsed game time, native interruption,
or withdrawal stops work. The native game checks needs/time itself during a trip,
so a disconnected coordinator cannot keep a trip running indefinitely. Withdrawal
cancels only the matching owned haul job, never an unrelated native job. A pawn
reflection can withdraw a running intention; continuing does not extend its
scope or deadline. Important events retain the normal interrupt policy.

Checkpoints remain **quiescent**: an active native job must finish/reconcile first.
A between-trip checkpoint preserves remaining consent and the absolute simulation
deadline. Restoring it rewinds game and character state together under a new epoch;
active-job save continuation is not claimed. Provider usage never rewinds.

## Operator trials

`src/hauling-fixture.ts` copies the owned `lab-initial` fixture, relocates existing
steel and creates local steel-only stockpiles. Native work priorities are disabled
to prevent untested haulers moving the supplies. No save/binary is committed and
no fixture/editor capability enters character interfaces.

Run compiled fixture/acceptance entry points under the normal exclusive mailbox
lock. `hauling-acceptance.js` and `--cold` exercise actual item delivery,
withdrawal/refusal and between-trip restore. `run-hauling-game.mjs` is opt-in:
a fresh `hauling-v1` Claude ledger allows six native Max calls, $0.60 reserved
API-equivalent usage; a separate `jev-hauling-v1` ledger allows six appraisals,
$0.012 conservative reservation. No CLI/API billing fallback or rerolls.
The observer runs three minutes after the initial paused offers. Exhausted
allowances stop inference, not native behavior. Operator shutdown is labelled
separately from a pawn deciding to stop. `--cold` performs no inference.

This is a bounded integration test, not an evaluation of naturally developed
personalities, long-run balance or an autonomous strategic core.

If the initial three offers all return unanswered counters, an explicit
`--reply-counters` follow-up may restore that completed trial checkpoint and offer
the three exact alternatives back. It requires exactly three retained Claude
attempts and spends only the remaining three from the **same** ledger, with no
further appraisals. It observes another thirty seconds and records a separate
receipt. This is fresh consent to revised offers, not a reroll of earlier answers.
An interrupted follow-up cannot silently restart from the original checkpoint.

`haul-planning-acceptance.js` and `--cold` are scripted, zero-inference checks of
three distinct resource plans, supply quantities, hold release, map-affinity
rejection and restored multi-trip execution. They do not reopen live ledgers.
