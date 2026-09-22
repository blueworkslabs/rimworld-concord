# Discuss a rescue alternative before abandoning work

A pawn hauling under an agreement may ask the core about one locally observed
casualty. This is deliberate communication, not inferred intent from prose.
The request names the current agreement and patient; it creates no native job,
withdrawal or planning hold, and the hauling agreement stays active.

## Bounded conversation

- Reflection choice `request_rescue_alternative` maps to a typed `request_rescue`
  message. Only the bound pawn's running hauling agreement and a casualty in its
  supplied local observation may be named. Fresh observed recovery/map changes
  reject stale requests. One request per agreement; no automatic reasking.
- The core reads an explicit projection of the communicated request, not the
  pawn's private reflection or mental state. It may decline, leaving work intact,
  or offer a currently grounded rescue of that same patient to one specific bed.
- A reply is a replacement proposal with `requestId` and `replacesAgreementId`.
  Merely offering it does not stop hauling. The pawn receives the explicit
  consequence: accepting ends that agreement and consents to this rescue;
  refusing or countering leaves the current agreement intact.
- A counter must remain rescue of the requested patient. Adopting it creates
  another exact proposal requiring fresh consent, with existing round bounds.
  No replacement proposal may bypass a pawn-originated request.

Requests and replies are persistent domain data. Old saves have no requests and
need no migration. Pawn reflection receives only its own recent request records.
The original hauling agreement, pending proposal and request must still match
when a delayed answer is applied. Completion/withdrawal of the old agreement
invalidates replacement consent; there is no automatic reinterpretation.

## Confirmed handover, not simultaneous jobs

Accepted replacement consent is saved before cancellation. The old agreement
then stops using its existing native cancellation path. Only a matching terminal
cancellation result (or already settled old work), current validation and an
uncancelled decision allow the replacement action ID and running agreement to be
saved and dispatched. The game still validates physical execution.

If cancellation is uncertain, a timeout intervenes, or fresh facts invalidate
rescue after stopping, the old agreement stays stopped and no replacement job
starts. Consent is retained as an accepted proposal with stopped, undispatched
handover state. Reopening does not retry that switch; reconciliation may only
finish cancelling the old job. This is a fail-closed sequence, not an atomic game
transaction or a promise that failed rescue will resume hauling.

## Fixed follow-up experiment

The existing lifetime-locked runner accepts `--alternative` (mutually exclusive
with `--intent` and `--relevance`) and uses distinct `alternative-v1` ledgers and
runtime paths. Same authored casualty/hauling fixture, scripted core, no personality
or relationship overrides. At most six Claude attempts, four Jev appraisals, one
discovery-triggered reflection, 96 native attention claims and two minutes of
continuous observation, with the existing settled-branch early stop after 15s.
Initial negotiation is paused; subsequent deliberation is continuous.

The core responds once if a valid request arrives. Missing current rescue options
produce a decline, not fabricated alternatives or a retry. Explicit withdrawal
remains an independent choice using the earlier follow-up policy. Refusal,
continuation, counters, incomplete handovers and failures all remain evidence.
No output is rerolled to obtain a request or rescue. Scripted checks separately
exercise request/decline, refusal, counter, handover failure and persistence.

## A pending request outlasting its original work

`core.offerRequestedRescue(requestId, action, reason)` answers an **unanswered**
request against current evidence. If its original hauling agreement still runs,
it creates a replacement with the existing cancellation-before-dispatch rules.
If that agreement completed and the pawn has no new commitment, it creates a
standalone rescue offer linked by `requestId`, **without** `replacesAgreementId`.
The pawn receives receipt-based progress for the completed origin and must give
fresh consent. No completed work is cancelled or resumed.

The core consumes a freshly observed terminal receipt before selecting the offer
mode. The patient and map remain those requested; the exact bed must be currently
grounded. Observed recovery rejects an offer even if a shortlist still contains
an older option. An unavailable option is not an instruction to invent a bed.

This does not reopen declined, closed or already-answered requests, nor turn a
stopped/withdrawn origin into a completed one. A new commitment blocks the fresh
standalone offer. Counters retain the original offer mode and requested patient,
and require a revised offer and fresh consent. An already-issued replacement
that becomes stale remains stale: its answer is never replayed as standalone
consent. `offerAlternative` retains its replacement-only contract.

The request is a deliberate goal communication, not an autonomous persistent
planner. The operator/core must choose when to answer or decline it. There is no
automatic retry, request revival or inference loop.
