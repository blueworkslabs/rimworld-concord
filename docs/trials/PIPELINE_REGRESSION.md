# Pipeline regression on the frozen hauling setup — 2026-09-25

## Scope

Fable requested one short regression on main `4b4a053` before freezing the next
migration. This is **not a new scene or cold read**, and establishes no construction
or cooking acceptance. One run, no forced choices, retries or rerolls. The previous
scene, interpretations and recordings remain unchanged.

Run `6b250afd-50ce-4fc5-ae7f-88679a6c6462` used the same frozen helper save, 75-wood
quota, strict attribution-only native hauling and ordinary-play configuration.
Pedro and Beatrice remain capable; Alvin remains natively incapable. Same native
Luna low, 600,000 ms observation window, cooldown 300, no turn ceiling, unpaused
inference and existing failure stop rule. No Jev calls. Runtime pinned to
`4b4a05340b8de7463f45e1aac9ccbd659d6d0219` throughout; the concurrent evidence-only
#74 merge did not alter it. Pinned-4871 compilation and local/remote runner hashes
matched before launch. The installed Concord DLL intentionally includes ordered-haul
retirement; the other frozen game/mod/config hashes are unchanged.

Setup fingerprint: `fe24b2fa590f24b98a9b2e7f52dd0caa2fb0aa78a242716cf254e531aa0b256c`.
The canonical inputs remain private; the public evidence is a sanitized projection.

## Requested checks

**Three observed checks pass; the complete bounded-review chain is only partially
exercised. This is not a four-check clean pass.**

| Check | Live evidence | Limit |
|---|---|---|
| Old-class attention loss | **0 gaps** while 1,937 native events arrived: Alvin 638, Beatrice 636, Pedro 663. Job-start/end/job churn accounted for 1,857. | One trajectory, not a universal losslessness claim or appraisal-quality proof. |
| Bounded idle review | First-review nudges at t11415 and t30416, both followed by wait. Status reads “reviewed; still waiting on new events” at 10:00. | **Two separate first reviews**, not one two-review chain. Neither reached review 2; stop-at-two remains scripted-tested, not established live. |
| Heard without replying | Pedro’s food/access report at t4741 reached input t5310; the core asked Beatrice instead. **“Core: heard Pedro; no reply to them yet” visible at 1:40**, alongside her pending question. | This exercises ordinary pawn speech, the earlier failure case. No typed Request record was created; that distinct branch remains unexercised. |
| No question during an open meal receipt | Inputs t1682 (Alvin), t6435 (Beatrice), t20089 (Alvin) show started/zero-consumed receipts and exclude that pawn from questionRecipients. Across 16 inputs: zero leaks. The three meals completed 12/10/10 food-items. | No consumption-report follow-up was chosen at all, including after completion. The gate is exercised; the post-completion question branch is not. |

First review: wait applied at t8864, due t11364, admitted t11415. Urgent Pedro
telemetry at t14515 resets that chain before review 2. Later wait applied at t27850,
due t30350, admitted t30416; that review’s wait applied at t30968, scheduling
review 2 for **t35968**. Observation ended at **t35790**, 178 ticks earlier. The run
was not extended to manufacture the missing branch. Both nudges exposed optional
work and left waiting as the model’s choice. The two-review cap’s offline restart,
budget and failure evidence remains in [#83’s report](ATTENTION_EVICTIONS.md).

## Other retained findings

All **44 backend calls returned**: 16 core, 6 core-answer, 21 reflection, 1 offer
decision. No provider, context-size or deadline failures. This does **not** mean all
returned choices applied:

- Two eating answers (Pedro and later Beatrice) failed fresh-state revalidation:
  `eating: option-not-current`. The selected food options existed in their answer
  inputs but not the current menu. Neither was dispatched or rerolled.
- A returned offer to Pedro failed as `unavailable choice` after the shared hauling
  quota completed during inference. Its input at t22140 contained the opportunity;
  the intent reached 75 at t22765 before publication. This is retained stale-choice
  rejection, not a refusal or an accepted obligation.
- The **10:00** recording shows all three application failures: core 1 unavailable
  choice, core-answer 2 option-not-current. Harness success does not erase them.

Fifteen core turns applied: six asks, eight waits (including both review nudges),
and one offer. Beatrice accepted the haul; Pedro helped unasked. **75 credited =
Pedro 55 + Beatrice 20**, two simultaneous holders, zero recorded overshoot/consent
violations. After closure 45 ordinary wood arrived, zero recorded removals; the
final displayed stock is 120. No construction/cooking or new migration acceptance
is claimed. No new interpretation of every topic sentence or reflection is made.

## Preservation

[Uncut silent recording](../../diary/assets/recordings/pipeline-regression-2026-09-25.mp4)
· [Sanitized evidence and source hashes](../evidence/pipeline-regression.json).
Recording **10:03.667**, 15,312,747 bytes, 1280×800, 15 fps, 9,055 frames; zero dropped
and one duplicated frame retained. Remote/copied hashes match:
`777f92dee18aca1e16a0e24292993d80c2a3e266da4411475bc0c16c3f088323`.
Continuous observation 600.748 seconds, 373 sampled states, all unpaused.

Paired and cold restores matched the retained coordinator state **and actual game
intent ledger**. New host 713387→731122 and coordinator 186206→187263 processes;
game process stayed up and reloaded the checkpoint. No inference/accounting changes
during cold restore. Prior complete mod restored; game/display stopped. All
**422 pre-existing saves unchanged**, one uniquely named checkpoint retained.
Original inputs, outputs, failures, databases, save, capture logs and recording
remain preserved privately. No further run occurred.

This additive report changes no runtime or frozen evidence. Independent read-only
receipt audit checked the coverage classifications and retained failures. Fable’s
next planned step is annotate-only grounding wiring; construction/cooking Gate A
remains separate. A live two-review stop proof is still outstanding, not silently
replaced by the mock result.
