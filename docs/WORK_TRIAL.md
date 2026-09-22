# Supply-informed useful-work playtest

This is an opt-in finite experiment, not a daemon or new gameplay authority.
The core remains scripted and receives only local physical haul opportunities.
The three pawns use their native self-perspectives without authored personality
overrides. They can accept, refuse or counter. Refusal is a valid outcome, not a
failed compliance test.

## Fixed policy

- Initial optional two-trip, ten-unit offers are assessed while paused.
- At most one exact counter revision per offer, subject to fresh grounding.
  A repeated counter or refusal is not pursued.
- Observe five minutes continuously. At two minutes, offer another bounded job
  only to pawns whose prior accepted work completed. No reoffers after refusal,
  withdrawal, dispatch failure or unfinished negotiation. If a thought is active,
  wait for that thought to finish before starting the later round.
- Native trip execution needs no per-trip inference. During the later round,
  observation/reconciliation and game time continue; explicit negotiations do not
  overlap automatic thoughts on the single decision channel.
- At most twelve Claude Max attempts with $1.20 reserved API-equivalent usage
  (not cash billing), twelve Jev appraisals with $0.024 conservative reservation,
  and three automatic reflection requests. Separate immutable `work-v1` ledgers;
  all historical trial ledgers remain untouched. Calls are maxima, not targets.
- At the observation deadline, stop the attention pump and close pending decision
  channels. Any outstanding agreement is stopped explicitly as **operator trial
  shutdown**, not reported as a pawn's voluntary withdrawal. Retire pending offers.
- Retain failures, cancellations and partial results. A durable start marker blocks
  rerunning even if a failed run consumed no model attempts. No rerolls or automatic
  continuation. Cold restore is separate and permits no inference.

## Measurement and interpretation

Record each decision and latency, actual trip outcomes/delivered units, standing
agreement outcomes, reflection/appraisal results, total model accounting, paused
samples and ticks sampled during pending continuous thoughts. Save partial results
periodically and after explicit choices. Verify paired and full process cold
restore of the final quiescent checkpoint.

The supply fixture relocates owned steel, creates stockpiles and disables native
work priorities. This isolates the supported voluntary work path, not ordinary
colony management. Five minutes need not produce hunger, danger, a reconsidered
promise or an appraisal escalation: report these as unobserved, never manufacture
success. The earlier trial is context, not a controlled A/B baseline.

## Operator execution

After building and syncing, use `scripts/run-work-game.mjs CONFIG`. It keeps native
Claude authentication and protected Jev egress on the operator host; only scoped
views/responses cross the exclusive SSH mailbox relay. Configuration has absolute
paths `ledger`, `jevLedger`, `scratchRoot`, `receipt`, `labRoot`, `remoteRepo`, and
an `sshTarget`. No credentials belong in the config or command. Protected transport
must pass preflight; there is no plaintext or different-billing fallback.

`--scripted` uses no providers and a fifteen-second dry run with a second round at
five seconds. Give it separate config paths. It verifies orchestration, not model
behavior. `--cold` restores the matching run identity without model calls; combine
with `--scripted` for the dry-run checkpoint. The wrapper checks compiled source
hash equality before starting the staging process. Results remain private until
sanitized for the repository. Stop the shared lab at handoff.
