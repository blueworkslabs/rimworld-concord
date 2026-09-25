# The core

The core is a bounded planner, not a controller. It sees attributed local observations, explicitly shared telemetry and
addressed communication, proposes listed work, asks questions, remembers open topics, and wakes
only when something public changes. It is opt-in per trial; the scripted core remains
the regression baseline.

Code: `src/core-planner.ts` (view, choices, validation, topics),
`src/core-scheduler.ts` (wake-ups), `Coordinator.planCore`/`planCoreWhenDue`/
`answerCoreQuestion` in `src/coordinator.ts`, `src/shared-status.ts`,
`src/food-observation.ts`, `src/self-care-followup.ts`, `src/reoffers.ts`.

## Setup

The operator initializes the core once with a brief (1–600 characters, immutable) and,
for event-driven operation, a schedule (below). Legacy domains allow at most 16 core
turns in their lifetime. Explicit ongoing schedules have no lifetime turn ceiling;
only one core turn runs at a time. Each turn has a timeout (default 45 s, at most 115 s).

## What the core sees

An explicit projection (`coreView`); nothing is spread in from internal state.

| Field | Contents |
|---|---|
| `brief`, `crew` | The operator's brief; crew IDs and names |
| `opportunities` | Up to 6 per pawn: grounded haul, rescue, campfire and cook options, each with a stable ID, excluding work this pawn refused or whose offer was withdrawn or agreement stopped. Haul options carry `supply {sourceThingId, label, sourceCount, destinationFree}` |
| `availability` | Per pawn, why it has options or not (busy, deferred, no grounded option) |
| `agreements` | The last 24 offers with status, reply and receipt-based progress |
| `counters` | Countered offers the core may adopt (round < 2) |
| `messages`, `requests`, `reoffers` | Addressed speech, alternative requests and fresh-offer invitations, all labelled `attributed-speech` |
| `questions`, `questionRecipients` | Its questions so far; who it may still ask |
| `sharedStatus` | Coarse Food/Rest bands per pawn ([below](#shared-status-bands)) |
| `foodSightings`, `foodKnowledge` | Local food and campfire sightings, when any pawn reports them ([below](#food-sightings)) |
| `selfCare` | The last 12 eating records with linked question and reply |
| `topics`, `topicClosures` | Its retained topics and which closures are currently allowed |
| `capabilities`, `limits` | What it can and can't do, in plain text |

It never sees private memories, reflections, outlooks, exact need meters, pawn-to-pawn
speech it wasn't part of, or the operator's diagnostics.

**Observation age (as-of rule).** Every tick in the core view is an observation time:
the view's `tick`, agreement progress `observedTick` and topic `basedOnTick` say when
something was *seen*. Only receipts date events. Agreement progress carries
`completedTick`, the receipt time of the last credited placement, and has no bare
`tick`. When a core message or question, or a pawn's answer, is published after a
receipt newer than its snapshot (an ingestion, a haul delivery, an intent opening or
retiring, a casualty), the crew log prefixes it with `[as of tN; newer receipts since
tM]`. The native-haul live run showed why: two statements that were true at snapshot
time were false by publication.

## What the core may do

One action per turn, each with a public reason (≤600 characters):

**Public reasons are in the world's voice.** The core's sentence is a concrete reason
("the wood by the wall is getting wet"), never an eligibility or consent disclaimer. The
structured offer record next to it says what is offered ("Offer to Beatrice: haul up to
30 wood to the shared wood pile by the north wall; others may help"). The core view's
limits say so in native-haul modes.

**Native hauling modes.** `configureNativeHauls(entries)` freezes the operator's list of
stockpile hauls: an existing colony stockpile (`zoneId`) or a candidate site, one per
(stockpile, def). The list is shown in a fixed order: label, then def, then ids.
- **Ordinary play:** ordered hauling is replaced by these offers; rescue, construction
  and cooking stay available.
- **Intent-only scenes** (`{intentOnly: true}`, and the spike's frozen live harness):
  the stockpile hauls are the only proposable work.
- The view carries the colony `clock`.
- A wait produces no crew-log entry; the status line reads "Core: waiting on <first
  open topic>".

| Action | Effect |
|---|---|
| `propose {opportunityId}` | Creates an offer for that opportunity; the pawn still decides |
| `adopt_counter {proposalId}` | Turns a pawn's counter into a revised offer needing fresh consent |
| `ask {pawn, text ≤240}` | Asks one question to a listed eligible pawn, never a downed pawn; legacy mode permits one per pawn, three total |
| `wait` | Nothing; native behaviour continues |

The output schema only contains IDs that exist in the current view, and the
coordinator validates the choice twice: against the view the model saw, and against a
fresh view just before applying it. A turn is also discarded if core state changed while
it was thinking (for example a question was answered) or its schedule window ended.

The live core **cannot** propose moves, answer alternative requests, offer
replacements, order eating, or change work priorities. Those remain operator/scripted
functions or pawn choices.

### Questions and answers

A question goes to one pawn, whose model answers with `say` (≤240 characters),
`stay_silent`, or `eat` if eating options are offered ([ACTIONS](ACTIONS.md#eat)).
Answers go to the core only: naming another pawn in the text doesn't deliver anything
to them. Speech starts no work.

## Source separation in model requests

The runtime `CoreView` remains the validation contract. Model prompts project it into
four explicitly named sections rather than a flat mix of records and summaries:

- `currentRecords`: timestamped shared telemetry, question status, receipt-backed
  self-care/work progress and eligible topic closures; local sightings retain their
  own observer, scope and freshness. Unknown/stale telemetry is not current fact.
- `communication`: attributed messages, requests and offer/reply wording. These
  record what was said, not a verified cause or authorization to act.
- `availableChoices`: eligible questions, opportunities and counters, with existing
  capability/consent limits. Eligibility is not a requirement to act.
- `plannerHistory`: fallible topic interpretations, not proof of current needs or
  of a reply's absence. `basedOnTick` records the input snapshot and `updatedTick`
  the application tick. Reading a topic or taking an unrelated turn does not refresh
  either date; legacy undated topics expose null, not an invented timestamp.

New topic dates follow paired saves and rewind. Historical text is retained, not
silently repaired. This organization is implemented and mechanically checked;
**better model grounding from it has not yet been demonstrated**. No free-text truth
filter, private-state access, new action or model escalation is added.

## Topics

The legacy core keeps up to 8 topics, each tied to a source it can see (the brief, a message,
an agreement, a request, an opportunity, a re-invitation or a self-care record). A turn
may update several topics at once; `actionTopicId` links a new offer to a topic (it
must be null for `ask` and `wait`). Invalid updates reject the whole turn before any
effect.

Statuses are `open`, `blocked`, `deferred`, `resolved` and `declined`. The last two are
only allowed when the receipts say so (`topicClosures`):

- **resolved**: every linked offer, followed through counters and re-invitations to
  its final revision, is accepted and fully completed with no active, unconfirmed or
  unsuccessful steps; and every linked self-care record completed eating.
- **declined**: every linked final offer was refused. A self-care topic is never
  declined.
- A topic with nothing linked can't be closed. Prose can't close anything.

## Not now, and fresh offers

A `defer` answer retires the offer without starting anything. From then on, that pawn
gets **no ordinary offers** from the core. The pawn can invite exactly one fresh offer
for the deferred work (reflection choice `request_fresh_offer`), but only while it has
no commitment, running agreement, pending offer or unanswered counter. The core then
sees a re-invitation and may propose that exact work again; the pawn answers it
freshly. The invitation is consumed by the new offer, not by the answer.

## Ongoing context and questions

With `maxAttempts: null` and `windowTicks: null`, a pawn can be asked again only after
its public Food/Rest band or work/self-care state changes. A pending question blocks
another one. Reply text, private need values, and elapsed time alone do not make a
pawn eligible again. This is permission to ask, not pressure to accept.

The prompt keeps the last 12 questions and their messages, 12 self-care records, 24 agreements,
up to eight active topics and the last eight closed topics. Closed history remains
in the audit/domain; it is not erased to make room. Ongoing topic admission counts
active topics, and closure still requires the exact linked receipts. Deduplication
survives context eviction and checkpoint restore. Persistent audit storage is not a
bounded-memory service; this is an operator-run slice, not indefinite unattended hosting.

## Wake-ups

With a schedule, the core runs only when admitted:

- **Schedule**: `maxAttempts` 1–16, `cooldownTicks` 60–3600, `windowTicks` 60–36000,
  set once before the first turn; the window starts at that tick. Both limits may
  instead be explicitly null for ongoing mode (never just one). The same cooldown
  and event checks apply; three consecutive failed core turns block for diagnosis.
- **Admission order**: inside the window, budget left, cooldown passed since the last
  attempt, and at least one new wake cause. The attempt and the causes it consumed are
  persisted before inference, so the same consumed causes do not automatically retry a failed turn. A later new
  cause may admit another attempt within the remaining allowance, or without a count
  ceiling in ongoing mode. Waiting is a valid success, not a non-progress failure.

Wake causes are public changes only:

| Cause | When |
|---|---|
| `start` | The brief (once) |
| `agreement` | An offer becomes completed, stopped, refused, deferred, countered or withdrawn (and again if its receipt counts change while in one of those states) |
| `request` | An alternative request changes status; a fresh-offer invitation arrives (once) |
| `message` | A pawn's answer text to a core question (arrives with `answer`) |
| `answer` | A question is answered, stays silent or fails |
| `telemetry` | A pawn's Food or Rest band changes (including to `unknown`) |
| `self-care` | Eating completes, fails or is interrupted |

Passing time, private needs, changing opportunities, food sightings and the core's own
prose never wake it. Consumed causes stay consumed even if the observation later
disappears.

## Shared status bands

The shared link exposes Food and Rest as bands only: `urgent` below 20 %, `low` below
50 %, otherwise `satisfied`. A reading from another epoch, from the future, or older
than 120 ticks is `unknown`. The same projection goes to the core, to every pawn's
perspective, and to the crew-log board. Bands inform; they are not consent and don't
authorize work. Only band changes wake the core, not timestamp refreshes.

**Telemetry-only wakes (implementation proposed after E2).** A wake whose only causes are band changes spends
no core turn when the core has nothing it could act on: no listed opportunity and no counter
to adopt, so no eligible offer recipient. The bands are consumed, so they don't wake the
core again. No attempt is counted and no cooldown starts. The event is recorded as
`core-wake-silent`, and the status line reads "Core: waiting on …", as for a silent wait.
Nothing is written to the crew log. The next real turn clears the status. Any other cause
(message, answer, agreement, request, self-care, native intent) still wakes the core, and so
does a band change while something is offerable. This implementation excludes question
recipients. In the retained E2 sample they are available on every turn, so counting them
would suppress none of this sample; in general that list can be empty. On the E2 native-haul run
this silences exactly the six telemetry-only wakes (turns 3–7 and 13). That includes
turn 7, where the core asked a question. Exact exported inputs classify the suppressed
set as four waits, one ask and one cancelled attempt, not six waits.
**Direction pending:** the implementation interprets "eligible recipient" as an offer
recipient, excluding available question recipients. Fable must resolve this before
merge/live; these measurements do not establish that the question was dispensable.

## Food sightings

Each pawn reports what it can see within 12 tiles (line of sight, no fog): up to 8
food items (count, whether nutrition-giving, whether forbidden, ingredients needed per
simple meal) and up to 4 built campfires, nearest first, with a `truncated` flag. This
is independent of whether the pawn could act on it. A reading is `unknown` if it's
invalid, stale (over 120 ticks), from another epoch or map, or has duplicate IDs.

The core gets every pawn's sightings plus a plain-language `foodKnowledge` note:
sightings are not inventory, and the same stack seen by two pawns is not twice the
food (there is no deduplication in code). Sightings create no opportunities and never
wake the core.

## Persistence

Core state (brief, schedule, topics, questions, turns) lives in the domain and follows
paired checkpoints. On restart, checkpoint or restore, running turns and answers in
progress become failed; questions nobody has started answering stay pending. Late
answers from a discarded timeline can't apply. Model attempts are
counted in separate ledgers for the core and for pawns, which never rewind.
