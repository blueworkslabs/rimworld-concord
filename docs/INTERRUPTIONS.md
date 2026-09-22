# Relevance and a pending rescue question

Importance to a character and invalidation of a pending decision are different.
This increment makes a deliberately bounded policy, not semantic understanding
of arbitrary events or a universal emergency classifier.

## Experiences that wait

Chitchat and DeepTalk still enter the pawn's private experience archive and route
to deliberation. They do not abort an existing thought. Events arriving after a
reflection's claimed cursor remain pending for a later turn and obey cooldown;
they are not silently consumed by the older answer. Explicit proposal decisions
likewise do not consume the attention queue. `experience-deferred` records when
conversation arrives during thought. Historical stored interrupt flags are
preserved, but current quiet-memory policy controls scheduling after restore.

Health changes, new casualty signals and unfamiliar significant memories still
supersede conservatively. Native reactions remain independent of model latency.
We have not established that every other social memory is irrelevant, or that
DeepTalk cannot ever change somebody's priorities. Its game event gives no
conversation content from which to infer that it invalidated this question.

## A question about a specific patient and bed

An explicit rescue decision tracks its offered proposal. Each observation checks
only that question: the rescuer must remain available and the exact offered
patient/bed/coordinate pair must remain in fresh, map-matching local rescue
options. Changes to unrelated options do not cancel it. Withdrawal of the offer
also invalidates its pending question. Loss of support aborts provider work and
records `decision-invalidated`; delayed answers cannot authorize a job.

**Losing a bounded shortlist entry is not proof the rescue is impossible.** This
is a conservative loss-of-grounding rule, including range, readiness, reservation
or shortlist changes. The implementation does not infer an unseen death or claim
to know why an option vanished. A later offer needs fresh grounding and consent;
this experiment does not automatically reoffer it.

Final acceptance uses the same newly ingested snapshot to recheck rescue support,
including when a reflection selects an existing rescue proposal. Open-ended
reflection is not cancelled merely because one unrelated pending option changes;
its selected rescue is checked before acceptance. Native dispatch remains the
last authority and may still fail after consent. No override, automatic reroute
or retroactive success is introduced.

## Verification and follow-up experiment

Unit tests cover deferred conversation, later reflection, old saved interrupt
flags, proposal withdrawal, exact target/bed/map/readiness changes, unrelated
options, fresh checks without polling, and reflection-selected stale consent.
The native recovery fixture shortens anesthesia in a disposable save copy: a
patient actually stands while a scripted decision is pending. The late acceptance
must create no rescue job. This is an authored recovery, not a spontaneous event.

The prior reconsideration trial is preserved. The follow-up uses the same
[bounded scenario](RECONSIDERATION.md), a distinct `interruption-v1` policy and
fresh ledgers: at most six Claude attempts, four Jev appraisals, two minutes of
continuous observation with the existing settled-branch early stop. No rerolls
or forced rescue. `--relevance` selects this policy in `run-reconsider-game.mjs`;
use the same flag for cold restore. Private output prefixes separate both trials.

Scripted-only reflection/rescue delays (0–20000 ms) can exercise native activity
while thinking; they are never inserted into the live provider. The recovery
check uses the lifetime-locked `run-rescue-lab.sh interruptions` and
`interruptions-cold` entry points, with direct-invocation guards. Trial summaries
include interruption/deferred-event audit records so absence of cancellation is
not mistaken for proof that a social event actually occurred during thought.
