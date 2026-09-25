# Hauling migration — clock acceptance and wake review

2026-09-25 · [PR #73](https://github.com/blueworkslabs/rimworld-concord/pull/73)
· [summary and retained hashes](../evidence/hauling-migration-clock-wake.json).

**Technical re-review clear at `4a52059`; merge/live held for the recipient-policy
interpretation.** 409 tests, pinned mod compilation and documentation checks pass.
No model calls. Growing remains parked, B1 2/2 exhausted.

## Telemetry-only wake behavior: mock/offline verified

Only band changes, with no offer opportunity and no counter, are consumed without
a core call, attempt or new cooldown. Tests now start from a non-wait turn, compare
entries before/after the silent wake, reopen the durable coordinator state, and
verify that a real message/answer still wakes it. This corrects the original test's
prior-wait and same-post-state comparisons; no runtime defect was identified.

The exact retained E2 inputs select indices **3, 4, 5, 6, 7, 13** under the proposed
predicate: **four waits, one ask and one cancelled attempt**, not six waits. Index 7
(t18211) asked Beatrice about her food after telemetry became urgent. All selected
inputs had question recipients. Such recipients are not always available in general.
This is an input-level replay, not an alternate live history: without that question,
its later answer and downstream wakes would differ.

Fable's phrase "no eligible recipient" therefore needs an explicit disposition:
accept **offer recipients only**, including suppression of this question-capable
turn, or narrow the trigger to preserve the desired question opportunity. Counting
all question recipients would suppress none of this retained sample. The reviewed
implementation has not been merged or used for live inference. No threshold or
Jev wiring was added.

## Clock: recorded one-map strict check passed

The previous known-map assertion accepted any correctly formatted time. The probe
now exposes the pinned game's native hour for the explicit event map independently
of the crew formatter, and the runner checks exact text at three fixed ticks:

- t0: `Day 1, 6h (t0)`.
- t2500: `Day 1, 7h (t2500)`.
- t60000: `Day 2, 6h (t60000)`.
- Missing provenance and an unknown map ID both yield only `t291`.

The strict legibility case completed 20 wood and checked the frozen records and zone
label restoration. No invariant detector finding or native-event gap. The clock
comparison tests formatter/native-hour consistency, not GenDate's implementation.
**Verified on one map; multi-map deferred until the first two-map scenario exists.**
The earlier actual Show/UI evidence remains separate; this run does not retest clicks.

Staging is stopped after a new uniquely named handoff save. All **403 pre-existing
saves** are unchanged and the new recording's local hash matches the remote copy.
The migration's ordinary-play live setup still needs final reviewed code, its freeze
and Fable's signature. Live #71 measures and the post-run coordinator process-restart
restore remain required; this scripted check is not Gate C approval.
