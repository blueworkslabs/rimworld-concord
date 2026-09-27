# Attention and timing

How a colonist notices things, decides whether they deserve a thought, thinks without
stopping the game, and gets interrupted when the world changes.

Code: `mod/Awareness.cs`, `mod/Casualties.cs`, `mod/DecisionPause.cs`,
`mod/IntentPatches.cs` and `mod/NativeIntents.cs` (hooked events),
`src/routing.ts`, `src/attention.ts`, `src/reflection-pacing.ts`,
`src/decision-validity.ts`, and ingest/attention in `src/coordinator.ts`.

## Three speeds

1. **Native habits** never stop: eating, sleeping and ordinary jobs continue while a
   pawn thinks.
2. **Fast appraisal** (optional, Jev) scores whether an event deserves a thought.
3. **Deliberation** (Claude, or Luna in ongoing mode) handles offers, reconsideration
   and requests.

## What a pawn perceives

**Self facts** from the game: traits (with degree), skills, every need, surviving
thought memories (with whom they concern), and direct relations. Never another pawn's
thoughts or opinions.

**Native events** come from two sources into one saved ring of 256 events with a
monotonic sequence number:

- **Sampling**, every 30 game ticks (and on every state request) for free colonists on
  the current map: job change (`job`), health change, Food/Rest/Mood band change, new
  memory, a downed colonist sighted (`casualty`) and that colonist later seen no longer
  downed (`casualty-recovered`). The first sample after a load is only a baseline.
- **Harmony hooks**, written as they happen: `job-start` and `job-end` for colonists,
  `ingested`, `interaction` (the interaction def, with the recipient as subject), and
  the stockpile-haul ledger's `intent-*`, `haul-delivered` and `quota-escape` kinds.
  Hooked events can be far more frequent than sampled ones; in the
  [pipeline regression](trials/PIPELINE_REGRESSION.md) job start/end and job-change
  churn accounted for 1,857 of 1,937 events. Events with no pawn (some intent
  ledger events) reach no pawn's history.

**Local sightings**: up to 8 visible colonists (those downed and not in bed are
casualties) and up to 12 visible beds with a medical flag, within 12 tiles in line of
sight. The first casualty sighting per observer and subject emits one `casualty` event;
it re-arms once the subject no longer needs help (recovered or in a bed). This is a local
scan, not a colony monitor; missing observations stay unknown.

The coordinator ingests each event into the experiencing pawn's history only (last 64
per pawn). A gap in the sequence, or evicting an experience before it was considered,
is recorded as a gap, never silently skipped. Names of visible people are attached at
ingest.

## Routing

| Event | Route | Interrupts a pending thought? |
|---|---|---|
| Job change (`job`, sampled) | native | no |
| `NATIVE_KINDS`: `job-start`, `job-end`, `ingested`, `haul-delivered`, `quota-escape`, `intent-opened`, `intent-excluded`, `intent-incidental`, `intent-ordinary`, `intent-admitted-start`, `intent-rejected-start`, `intent-retired`, `intent-trued-up`, and the lab-only `lab-fault`, `lab-drafted` | native; texture and receipts, never a per-event wake (intent wakes for the core come from aggregate progress, [CORE](CORE.md#wake-ups)) | no |
| Food, Rest, Mood band change | native (Fable, post-Gate-C item 7: the game feeds the pawn; the deliberate eating choice comes through the core's question) | no |
| A pawn's own Food or Rest band reaching `urgent` (band 0, under 20%) | deliberation | no, queued for the next turn |
| Health change | deliberation | yes |
| `casualty` | deliberation | yes |
| `casualty-recovered` | native | no |
| `interaction` `Chitchat`, `DeepTalk` | deliberation | no |
| Any other `interaction` | deliberation | yes |
| Memory `Chitchat`, `DeepTalk` | deliberation | no, queued for the next turn |
| Any other new memory | deliberation | yes |
| Any other kind | appraisal (kept defined for the day an appraiser has evidence) | no |

"Any other kind" currently includes hooked stockpile-haul kinds that are not in
`NATIVE_KINDS`: `intent-pretag`, `intent-pretag-marked`, `intent-retarget`,
`intent-retarget-unadmitted`, `intent-pickup`, `intent-pickup-skipped`,
`intent-pickup-bound-violation`, `intent-duplicate-admitted`, `intent-nested-end` and
`intent-ledger-violation`. They route to appraisal, not native. Without an appraiser,
a pawn's pending batch that contains one can neither be settled natively nor start a
model turn until a deliberation event joins it (then they are shown to the model with
it). As non-native experiences they are not preferred for eviction, and an unconsidered
one that is evicted counts as an attention gap. This is current behaviour, not a
decided policy.

The core has one telemetry rule of its own (details in [CORE](CORE.md)):

| Core wake cause | Core turn? |
|---|---|
| Only shared Food/Rest band changes, nothing offerable, no band worsened to `urgent` | no: bands consumed, silent status, no attempt or cooldown |
| A crew member's Food or Rest band got worse and reached `urgent` | yes, even with nothing to offer |
| Band changes while an opportunity or a counter is offerable | yes |
| Improving or lateral band changes on their own | never |
| Any message, answer, agreement, request, self-care or native-intent cause | yes, as before |
| `review`: nothing new, but the core waited with work offerable 2,500 (then 5,000) ticks ago | yes, at most twice per deliberate wait |

A queued urgent need event is not coalesced away by a later native recovery; the
recovery remains in the shown history, without being a new reflection trigger.

An appraisal score of 0.5 or more sends an event on to deliberation; a lower score
leaves it to native behaviour, with no pause and no badge.

An interrupting event aborts whatever the pawn is thinking about (an offer decision, a
reflection, a social turn, a core question) and is recorded as an interruption. Queued
events stay beyond the current thought and are considered next time. One exception: a
pawn's own meal memory ("Ate…") does not interrupt the core question it is answering. It
is queued (`experience-deferred`, "Meal memory queued behind the pawn's answer"), so the
answer about that meal is not aborted by the meal itself.

## Invalidation versus interruption

Interruption is about news. Invalidation is about an offer that can no longer be right:
a pending rescue decision is rechecked on every ingest and aborted if a fresh
observation contradicts it (see [ACTIONS](ACTIONS.md#rescue)). Acceptance is always
revalidated against the fresh snapshot, whichever path chose it. Missing or stale
observations count as unknown, never as a contradiction.

## The attention pump

`AttentionPump` is polled by the operator; it is never a background service.

- **Limits**: 1–3 concurrent pawns (default 2); a turn budget of 1–100 (default 12),
  or separate native and model budgets.
- **Eligibility**: a pawn is busy while it has a pending thought, or a commitment
  without a standing agreement (a running agreement doesn't block reflection). Batches
  that need a model require an appraiser unless they contain a deliberation event.
  Cooldown (default 300 ticks) applies unless the batch has an interrupting event.
  Interrupting pawns go first, then whoever waited longest.
- **Coalescing**: interrupting events are kept individually; everything else collapses
  to the latest per kind (memories per type), so repeated chatter is one item.
- **At most once**: the event cursor and a `running` receipt are committed before
  inference. Errors are recorded and behaviour continues natively. On restart or
  restore, running attempts become `interrupted`.

A reflection sees the pawn's own view: its agreement and progress, the coalesced
events, up to 8 pending offers, up to 8 deferred offers, its last 8 requests, and offer
histories. The allowed replies are listed in [MODELS](MODELS.md#reflection-choices);
each is rechecked against a fresh ingest before it applies. A pawn keeps its last 16
reflections.

**Lost experiences are failures.** On overflow the 64-entry experience buffer evicts the
oldest native or already-considered experience first, so job churn cannot push out
unconsidered changes ([diagnosis](trials/ATTENTION_EVICTIONS.md)). When it must evict an
unprocessed, non-native experience, the coordinator counts it in
`diagnostics.attentionGaps` (by kind) as well as the `attention-gap` audit record. The
ongoing runner reports the count, so a harness pass is never mistaken for clean
cognition.

## Reflection pacing

`ReflectionPacer` spreads a fixed allowance of model reflections over an observation
window, so the budget isn't spent in the first minute. Routine slots open one per
interval (window ÷ routine slots) and expire unused; urgent slots are reserved for
batches with health or casualty events. Admission happens before the cursor advances,
so a denied batch stays pending. A slot held through appraisal is returned if the
result is native; once reflection starts it is spent. Nothing is admitted after the
window.

## Timing modes and pauses

- **Continuous** (default): no pauses. Native routines run while the pawn thinks.
- **Pause at decision** (explicit test mode): the coordinator places a pause claim
  while a pawn decides on an offer, reflects after appraisal, or speaks in a social
  turn. Core turns and core-question answers do not acquire these coordinator pause
  claims. Trial launchers can separately pause inference, as the recent core trials
  explicitly do.

A pause claim belongs to one pawn and one epoch, lasts at most 120 s of wall-clock
time, and at most three coexist. The mod shows a small movable notice using RimWorld's
`forcePause` and never touches the player's time speed, so a human pause stays a human
pause. Claims are released in `finally`, expire on wall time even while paused, and are
not saved. They are not a watchdog against a hung game.

## The thinking badge

A small badge above a pawn shows it's deciding on an offer, reflecting, or speaking. It
expires on its own (timeout + 2 s, at most 120 s), can only be cleared by the matching
activity and epoch, and is not saved. Appraisal, core turns and core-question answers
show no badge.
