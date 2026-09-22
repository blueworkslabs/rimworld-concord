# Requested-goal follow-up

This focused trial tests an unanswered rescue request after its original hauling
finishes. It uses the existing authored single-worker fixture and scripted core.
The core deliberately waits for the hauling agreement to settle before answering
a request; it offers standalone rescue only after ordinary completion and current
local grounding. A stopped origin is declined. A pawn that continues or withdraws
instead of requesting is not asked again to produce the desired branch.

Fresh `goal-v1` ledgers cap native Claude at six attempts (USD 0.60 reserved
API-equivalent accounting, not cash billing) and Jev at four appraisals (USD 0.008
reserved). Initial hauling negotiation is paused. Continuous observation lasts at
most two minutes, ending after a settled branch and at least fifteen seconds.
Only one casualty-discovery reflection is enabled; this is not a general colony
intelligence or pacing trial. Refusal, cancellation, unavailable scope and unused
allowances remain in the evidence. No rerolls.

Build with `npm test`; use `scripts/run-reconsider-lab.sh fixture` on staging under
the existing lifetime exclusive lock. The operator host invokes
`node scripts/run-reconsider-game.mjs /absolute/private/config.json --goal`,
with `--scripted` for rehearsals or `--cold` for no-inference restore. Rehearsal
configuration can select `scriptedReflection: "request_rescue"` and
`scriptedAlternativeDecision: "refuse"` or `"counter"`. All trial files and
provider receipts remain private; sanitized results are published separately.

The crew log continues to distinguish addressed messages and verified work.
Native recovery visibility and general reflection pacing are separate follow-ups.

## Verified result — 2026-09-22

The single live run completed three hauling trips (thirty steel), then one rescue.
Alvin requested rescue while hauling; the delayed core reply issued a standalone
offer after all three trips completed. Fresh acceptance led to exact-bed delivery.
His completion claim matched the receipts in this response. No treatment implied.

Three Claude attempts and zero Jev calls were used, with no rerolls. The continuous
portion settled after 25.765 seconds / 1,502 ticks; all 25 sampled states were
unpaused. Only one discovery reflection was enabled, with five native attention
turns. Paired and full cold restore preserved the result without further inference.
Cleanup found no outstanding work; 51 historical database files were unchanged.

Scripted acceptance completed the same three hauls then rescue, with paired/cold
restore. Scripted refusal completed the hauls without rescue, with paired restore.
153 automated checks passed. Independent read-only Codex review of behavioral
commit `ec9446ad563e39f59f5cef00046659d44a1c947e` found no actionable defects.
No mod changes or new live strategic core were involved. See
[evidence](evidence/requested-goal-live.json).
