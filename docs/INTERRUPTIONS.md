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

An explicit rescue decision tracks its offered proposal. Withdrawal, rescuer
unavailability or an observed map change invalidate it. Fresh pawn-local visible
facts also invalidate it when the specific patient has recovered or is in bed,
or the specific bed is occupied, nonmedical, forbidden, converted or moved.
These bounded physical observations contain no other pawn's private mental state.

**Missing information is not contradictory evidence.** Range, occlusion,
reservation and shortlist truncation can remove a pair from the available options
without showing that the question is invalid. Missing or stale observations do
not alone cancel a known offer. A slower scripted rehearsal exposed an earlier
shortlist-absence guard cancelling a rescue thought; that rehearsal is retained,
and the guard was replaced before live inference.

Observed contradictions abort provider work and record `decision-invalidated`;
delayed answers cannot authorize a job. Final acceptance uses the same newly
ingested snapshot, including when reflection selects an existing rescue proposal.
Validation precedes completion bookkeeping, while a durably accepted decision
survives loss of the dispatch reply. Open-ended reflection is not cancelled merely
because an unrelated option changes. Native dispatch remains the final authority:
a target no longer visible can still make execution fail after consent. There is
no override, automatic reroute or retroactive success.

## Verification and follow-up experiment

Unit tests cover deferred conversation, later reflection, old saved interrupt
flags, proposal withdrawal, observed target/bed/map/readiness changes, unknown or stale
observations, fresh checks without polling, and reflection-selected stale consent.
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
