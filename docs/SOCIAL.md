# Social: speech, outlooks and who knows what

Colonists talk to the core and to each other, and form private views of their own. All
of it is kept separate from game truth and from permission to act.

Code: `src/social.ts`, `src/outlook.ts`, `src/observed-names.ts`, `src/reoffers.ts`,
`openSocial`/`socialTurn`/`requestRescue`/`requestReoffer` in `src/coordinator.ts`.

## Who knows what

| Information | The pawn | Other pawns | The core | Crew log (you) | Operator |
|---|---|---|---|---|---|
| Own exact needs, traits, skills, memories | yes | no | no | no | yes |
| Own private outlook and reflections | yes | no | no | no | yes |
| Food/Rest bands | all pawns | all pawns | yes | yes | yes |
| Names of people currently visible | yes | no | crew names | no | yes |
| Messages addressed to a pawn | recipient and sender | no | only its own conversations | yes | yes |
| Own offers, agreements and progress | yes | no | yes | yes | yes |
| Nearby grounded options | own shortlist | no | as opportunities | no | yes |
| Local food sightings | own | no | everyone's | yes | yes |
| In-game clock (day and hour) | yes | yes | yes | yes | yes |
| Colony stockpiles (label, location) | yes | yes | yes | yes | yes |

The clock and the colony's stockpiles are colony-public: the clock is the shared sky,
and a stockpile exists because someone placed it ([MIGRATION_HAULING](MIGRATION_HAULING.md)).

"Operator" means `inspect()` and the audit log. None of it reaches a model.

## Offers and requests

Offers, counters, revisions and "not now" are part of the agreement lifecycle in
[ACTIONS](ACTIONS.md#offers-and-answers). A pawn's answer reason is a deliberate reply
to the core. Two kinds of request originate with the pawn:

- **Rescue alternative**: while hauling, ask for one rescue of an observed casualty
  ([ACTIONS](ACTIONS.md#rescue-alternative-requests)).
- **Fresh offer**: after "not now", invite the core to offer that work once more
  ([CORE](CORE.md#not-now-and-fresh-offers)).

Neither creates a job. Both are shown to the core as attributed speech.

## Encounters between pawns

An encounter is one addressed exchange between two nearby pawns: an opener and a reply.

- Opened by the operator with a UUID (idempotent); at most 32 per timeline and one
  open encounter per pawn. Both pawns must be free. It expires 3600 ticks after
  opening.
- Each turn is `say` (1–240 characters) or `stay_silent`. Silence, failure, timeout,
  interruption, lost contact or expiry closes it; there is no retry. A restart or
  restore closes running encounters.
- Contact is checked before and after each turn: both on the same map, each currently
  seeing the other, neither downed or in bed.
- A delivered message `{id, exchangeId, tick, from, to, fromName, toName, text}` goes to
  both participants' message windows. Nobody else receives it. The speaker sees only
  its own contact and the exchange.
- Speech creates no job, no offer and no belief. The crew log shows it as a message.

Each pawn's message window holds its latest 16 messages, including questions from and
answers to the core.

## Names

Messages carry name snapshots of sender and recipient. Events get the subject's name
only if the pawn could see that person at ingest. Beyond that, a pawn's perspective
includes names only through shared status (all crew) and its current sightings.

## Private outlook

A pawn can keep a small, private, revisable account of what matters to it.

- Up to **4 notes**, each a `value`, `concern` or `stance`, 1–240 characters.
- Every note cites its evidence: 1–3 of the pawn's own events **or** 1–3 messages
  addressed to it, never both, no duplicates. Cited evidence is copied into the note,
  so it survives the 64-event history limit.
- A `stance` names a subject: someone in the cited events, or the sender of a cited
  message. Values and concerns have no subject.
- An update replaces all notes at once and must name the current revision
  (`expectedRevision`); it is validated against the frozen view and again against the
  live one.
- Messages from the core count as addressed messages too.

An outlook is interpretation, not fact. It changes no trait or relationship, starts
no job, and is never published as speech. It appears in the owner's own offer,
reflection, appraisal, encounter and core-question perspectives, and nowhere else.

## Rewind

Messages, encounters and outlooks live in the coordinator's domain, so they rewind
with paired checkpoints. A late answer from a discarded timeline is rejected by the
generation check.
