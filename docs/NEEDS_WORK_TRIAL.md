# Needs versus optional work

This second native scenario introduces no casualty: two existing colonists receive
optional nearby wood-hauling offers. In a disposable copy of the owned initial
save, the first eligible worker has Food 0.4 / Rest 0.9 and the second has both
0.9. Existing injuries and traits remain. These are different pawns, not a
controlled causal experiment of hunger alone. Native hauling eligibility requires
Food and Rest at least 0.35 as well as other capability checks.

The fixture relocates existing wood and meals, adds wood-only stockpiles, clears
old jobs/paths and disables ordinary work priorities. Native need routines remain.
Actual loaded need levels, wood options and absence of downed pawns are asserted
before inference. No fixture/admin access is supplied to the character.

Offers and at most one response to each smaller, same-source/destination haul
counter occur in an explicitly paused setup. Refusal is not followed by another
ask. Then native activity runs for two minutes (30 seconds in rehearsal), without
reflection or further proposals. This is not a continuous-decision performance
claim. The runner records actual jobs, needs, receipts, failures and operator
cleanup separately. A pending/accepted intention is not a delivered load.

The fresh `needs-v1` policy allows at most four Claude attempts, reserving at most
0.40 API-equivalent USD on the native subscription. Zero Jev calls. Failed calls
consume their reservation; no rerolls. Host markers prevent batch replay. Cold
restore makes no inference. The launcher holds the coordinator lock through all
loads, execution and saves; direct entries fail before accessing the mailbox.

Operator launch: `scripts/run-needs-lab.sh fixture` on isolated staging, then
`scripts/run-needs-game.mjs CONFIG [--scripted] [--cold]` on the native-login host.
Config contains absolute labRoot, remoteRepo, ledger, scratchRoot, receipt and a
trusted sshTarget. Never place credentials in it. Host verifies both src and
trials compiled hashes before use. Keep saves, raw responses and databases private.

## Corrected offline bank

`trials/perspective-v2.ts` preserves v1 inputs/results and changes only need-case
readiness cues: low needs have both readiness flags false; unknown has neither
flag nor action-option view. Bank-specific consistency assertions reject the
original defect. `scripts/export-perspective-v2.mjs` prepares the corrected bank;
the existing inference runners deliberately still accept only their frozen v1
bank. No new offline inference is required or implied by this correction.

## Evaluation follow-ups

- Add narrow post-hoc checks for explicit numerical/status contradictions, with
  supported / contradicted / unsupported / unscorable kept distinct. Mechanical
  matching cannot establish arbitrary prose entailment or causation. Do not block
  an otherwise valid choice on a prose score.
- Matched outlook cases: hold world/proposal constant, vary only the pawn outlook,
  record choices and explanations over predetermined repetitions. An unchanged
  action is not by itself proof that an outlook had no influence.
- Prepare an unannotated real public-log packet for a cold reader before extending
  entry types. A reader's narrative should be compared with the actual record.
  No cold-read result is claimed yet.
