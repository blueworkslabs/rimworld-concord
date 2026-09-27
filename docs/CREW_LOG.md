# Crew log

The **Concord** main tab opens a compact, read-only observer sidebar (420 pixels wide at the lab’s 1280×800 resolution). **Full journal** expands the existing message, record, agreement and supplies views; **Compact** returns to the map-friendly view. It doesn't start agents,
pause the game, send messages or authorize work. It shows what was said, what the game
recorded, and what is still outstanding, and keeps those apart: speech is not fact, and
observation is not mind-reading.

Code: `src/crew-log.ts` (projection, progress), `publishCrew` in `src/coordinator.ts`,
`mod/CrewLog.cs` (tab, validation, persistence), `mod/HarnessNarration.cs` (harness
action records merged into the tab).

## Watching without covering the colony

The compact view shows the actual game’s running/paused state, native pawn activity,
coarse shared Food/Rest bands, known scheduler state, and newest addressed events.
Activity is a current native job label, not the character’s claimed intention. The
**Core topics** button shows the core-authored interpretation board, not verified
outcomes or private pawn thoughts. Disagreements retain their addressed reasons in
the event feed; blue records distinguish physical outcomes from amber speech.

**Hold feed** freezes only the displayed event list. The game, needs and activity
continue; **Live feed** returns to current entries. A live timeline change clears
held events, including when the coordinator is disconnected. Coordinator history
remains bounded to the most recent 128 entries; harness action records are merged on
top ([below](#harness-action-records)), so the tab can show more. Fast bursts can still exceed comfortable
reading speed; holding or scrubbing the recording is available, not proof of usability.

The observer can show known legacy allowance/window exhaustion, cooldowns, pending
answers and thinking. Without a known scheduler it says the next call depends on the
operator/scheduler; it does not guess why an external launcher stopped. Stale reports
are labelled as such. The compact view shows unknown need bands after ten seconds or
120 game ticks without a fresh report; native activity and game pause state remain
current. This does not change any character’s perspective or scheduling policy.

## Entries

The log keeps the newest 128 entries with monotonic sequence numbers and game ticks.
Only allow-listed kinds become entries:

**Messages** (addressed speech, shown with sender and recipient):

- core → pawn: offers and revised offers; declines of requests
- pawn → core: answers to offers, rescue requests, fresh-offer invitations
- core ↔ pawn: questions and answers
- core → crew: the core's public reason for each turn that is not a wait (a wait is
  shown only in the status line)
- pawn → pawn: delivered speech in an encounter

**Records** (what the game or the coordinator's validation reported):

- ordered-action outcomes: `<kind>: <status>`, plus "Casualty placed in the agreed bed;
  treatment not implied" for a completed rescue and "Produced N simple meals; eating
  is separate" for completed cooking
- stockpile-haul offers: a structured record next to the core's sentence ("Offer to
  Beatrice: haul up to 30 wood to the shared wood pile; others may help")
- stockpile-haul progress, from the intent ledger:
  - first delivery, with delivered/quota and per-carrier credit;
  - a helper's first credited placement ("Pedro is helping with the … (not asked)"),
    once per pawn and intent;
  - hauls already on their way when the agreement started ("Already on its way…"),
    never credited;
  - "Since then: N arrived as ordinary work (…), M removed", one line updated in place;
  - a trip started before withdrawing and finished afterwards, credited to the carrier;
  - agreement complete, expired (topic stays open) or stopped, with credit and any
    overshoot beyond reservations
- pawns not offered stockpile hauling and why (for example "cannot do hauling")
- lapsed offers (below)
- core outputs rejected before publication: whom the offer or question was for and
  the cause, never its text
- rescue handover: dispatch requested (not yet confirmed), started, or stopped with
  its reason
- offers withdrawn and agreements stopped (a stop is never shown as completion)
- eating: chosen, stopped, and the outcome in food items
- observations: `casualty` (a pawn saw someone downed) and `casualty-recovered` (the
  same observer later saw them no longer downed), at the native observation tick

**Never shown**: reflections, private memories, outlooks, traits, event details,
health values. Reasons a pawn gives in a rescue request or fresh-offer invitation are
shown, because those are addressed to the core.

Seeing a message in the log doesn't make it common knowledge: the log is not part of
any pawn's or the core's perspective.

**Lapsed offers.** An offer on a shared intent that closes before the pawn's answer
lapses. If the answer arrives afterwards, it is kept as said and the log reads "Pedro
answered accept after the stockpile haul was already complete; no agreement started".
If no answer came, the log reads "Offer to Pedro lapsed unanswered". A lapsed offer is
never counted as agreed or unfulfilled and never labelled withdrawn. A helper's credit
stays with the intent's progress lines, not an agreement.

### Harness action records

Every narrated harness `act` receipt ([HARNESS](HARNESS.md#receipt-backed-narration-clawd-2026-09-26-phase-2-step-a1))
is merged into the tab as `Core · RECORD`, in game-time order with the coordinator's
entries. The mod reads these from the saved harness receipts, not from the coordinator
report, and they are not counted against its 128-entry bound. In a harness run without
a coordinator report the tab shows them alone, in both views.

## Board

Above the log, the report carries:

- **Waiting**: pending replies, running work and active eating, or "No outstanding
  offer or running agreement."
- **Shared status**: every pawn's Food and Rest band ([CORE](CORE.md#shared-status-bands)).
- **Agreements**: up to 12, running first, then the most recent accepted.
- **Supplies**: local food and campfire sightings; saved or stale readings are
  labelled "current supplies unknown".

## Agreement progress

Derived from receipts only. For ordered work `agreed` is the number of meals, or 1. Each
step is `completed`, `active`, `unconfirmed` (issued, no known receipt), `unsuccessful`
or `notStarted`; `unfulfilled = agreed − completed`, even after a stop, and it grants no
permission to resume. Delivered quantities are counted for meals; unknown quantities
stay unknown.

For a stockpile haul `agreed` is 1 if the offer was accepted, otherwise 0 (a lapsed,
withdrawn or unanswered offer is never agreed). `completed` is 1 only when the shared
quota was met; `unconfirmed` means the game has not yet confirmed the admission; an
expired or stopped intent counts as `unsuccessful`. `delivered` is this pawn's own
credit, not the pile's total, and `completedTick` is the last credited placement.

The owning pawn sees the same fields about its own agreement when it reflects or
decides on a replacement.

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

## Recording pilot

The operator-only `scripts/run-observer-pilot-lab.sh pair RUN_UUID` compares a
75-second scripted scene without capture and then with capture. It requires the owned
game, current mod/coordinator, prepared campfire-v2 fixture, ffmpeg, xdotool and the
fixed lab display. Set `RIMWORLD_LAB_ROOT` to the isolated lab root. The launcher
holds the coordinator lock through loads, work cleanup and recorder finalization;
direct Node invocation is refused. `cold RUN_UUID` checks the final paired checkpoint
after a full game restart. These are diagnostic commands, not character capabilities.

The silent MP4 is 1280×800 at 15 fps, H.264, with an explicit scripted-pilot overlay.
It is uncut; the sidecar retains wall times, game ticks, pause state and scripted event
markers. Recorder spawn is only an approximate time origin, not frame-exact alignment.
Capture stops at 75 seconds or 128 MiB, with 512 MiB free required before starting.
SIGINT/SIGTERM goes through cleanup; a launch failure is retained, not rerolled.
Original footage, detailed receipts and process logs stay outside Git. A recording
can support timestamped human comments and later video-model checks; neither a
successful encode nor author inspection establishes usability or engagement.
