# Crew log

The **Concord** main tab is a read-only observer display. It doesn't start agents,
pause the game, send messages or authorize work. It shows what was said, what the game
recorded, and what is still outstanding, and keeps those apart: speech is not fact, and
observation is not mind-reading.

Code: `src/crew-log.ts` (projection, progress), `publish` in `src/coordinator.ts`,
`mod/CrewLog.cs` (tab, validation, persistence).

## Entries

The log keeps the newest 128 entries with monotonic sequence numbers and game ticks.
Only allow-listed kinds become entries:

**Messages** (addressed speech, shown with sender and recipient):

- core → pawn: offers and revised offers; declines of requests
- pawn → core: answers to offers, rescue requests, fresh-offer invitations
- core ↔ pawn: questions and answers
- core → crew: the core's public reason for each turn
- pawn → pawn: delivered speech in an encounter

**Records** (what the game reported):

- action outcomes: haul units delivered (or "not reported"), rescue "placed in the
  agreed bed; treatment not implied", meals cooked
- offers withdrawn and agreements stopped (a stop is never shown as completion)
- eating: chosen, stopped, and the outcome in food items
- observations: `casualty` (a pawn saw someone downed) and `casualty-recovered` (the
  same observer later saw them no longer downed), at the native observation tick

**Never shown**: reflections, private memories, outlooks, traits, event details,
health values. Reasons a pawn gives in a rescue request or fresh-offer invitation are
shown, because those are addressed to the core.

Seeing a message in the log doesn't make it common knowledge: the log is not part of
any pawn's or the core's perspective.

## Board

Above the log, the report carries:

- **Waiting**: pending replies, running work and active eating, or "No outstanding
  offer or running agreement."
- **Shared status**: every pawn's Food and Rest band ([CORE](CORE.md#shared-status-bands)).
- **Agreements**: up to 12, running first, then the most recent accepted.
- **Supplies**: local food and campfire sightings; saved or stale readings are
  labelled "current supplies unknown".

## Agreement progress

Derived from receipts only. `agreed` is the number of trips, meals, or 1. Each step is
`completed`, `active`, `unconfirmed` (issued, no known receipt), `unsuccessful` or
`notStarted`; `unfulfilled = agreed − completed`, even after a stop, and it grants no
permission to resume. Delivered quantities are counted for hauls and meals; unknown
quantities stay unknown. The owning pawn sees the same fields about its own agreement
when it reflects or decides on a replacement.

`progress.tick` is when the snapshot was taken; `entry.tick` is the game tick when the
coordinator recorded the entry (for casualty observations, the native observation tick).

## Recovery watches

A downed colonist seen by an observer (in bed or not) creates a saved watch, at most
128. The observer emits one `casualty-recovered` record when it later sees that
colonist no longer downed; death removes the watch. Entering a bed, disappearing or
leaving sight is not recovery, so a record can lag the physical change. The log never
claims why someone recovered, or full health, treatment or rescue.

## Transport and persistence

- The coordinator publishes a full snapshot after each serialized operation and before
  paired saves. Publishing errors set `crewSyncError` and never fail the operation.
- The mod rejects a report with the wrong epoch or world, over 2,000,000 characters,
  a bad branch, a future tick, more than 128 entries or 12 agreements, non-increasing
  sequence numbers, oversized fields, or an older revision within the same timeline.
- The header says "Latest" only if the epoch matches and the report arrived within the
  last 10 seconds; otherwise "Saved / last report — not live".
- The game save keeps the last report, so it's readable without a coordinator. A paired
  restore replaces the log with that branch's history. Text is rendered without rich
  text.
