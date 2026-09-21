# Bounded hauling and standing consent

`haul` names one exact source thing ID, one storage cell, 1–25 units per trip,
1–3 trips, and a 60–3600 game-tick lifetime. It is not a general work priority.
Changing the item, cell, quantity or limits requires a new offer and pawn consent.
Counters execute nothing; the existing revision path returns a fresh offer.

The game offers at most six local options from a visible radius-six square,
examining at most 24 eligible source candidates. Options carry the epoch/tick and
are neither reservations nor promises. Only the pawn's own view reaches its
backend. The core's query projects physical opportunities without private state.

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
