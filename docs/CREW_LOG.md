# Concord crew log and agreement progress

The **Concord** main tab is a read-only observer display. It does not start agents,
pause the game, send messages or authorize work. A connected coordinator publishes
bounded reports through the epoch-scoped lab bridge; ordinary mod users without
that coordinator see no fabricated conversation.

## Speech is not fact, and observation is not mind-reading

- Messages: core proposals/revisions, explicit pawn decision replies, pawn rescue
  requests and core declines. These are deliberately addressed communications in
  the existing protocol. The sender and recipient are shown.
- Records: native action states and completed quantities/bed placement, agreement
  stops and offer retirement. An agreement stop is not recorded as completion.
- Excluded: general attention/reflection reasons, private memories, traits and
  background withdrawal reasoning. A private thought is not converted to dialogue.
  Scripted and live model claims have no authority over recorded outcomes.
- An observer can read addressed communications; this does not make them common
  knowledge or add the observer log to any pawn/core model perspective.

The domain retains the newest 128 log entries with monotonic sequence numbers and
simulation ticks. Old saves start with an empty log; historical private audit
records are not replayed or reclassified as speech. Up to 12 running/recent
accepted agreements appear in the progress board. This is a bounded recent log,
not a complete campaign archive or a pawn-to-pawn communications system.

## Progress means receipts, not an explanation

Progress distinguishes completed, active, unconfirmed (issued without a known
receipt), unsuccessful and not-started trips. Unfulfilled is agreed minus
completed, even when the agreement has stopped; it grants no permission to resume.
For hauling, delivered units come from successful receipt quantities; missing quantities remain explicitly unknown. The pawn's
own reflection and replacement-decision view include these explicit progress
fields, using current matching game receipts where available. No other pawn's
private state is added. This improves supplied information, not a guarantee of
model comprehension or truthful explanations.

## Display transport and persistence

The report contains only an explicit public projection. Full snapshots replace
previous display contents; old epochs, branches and decreasing revisions/ticks
are rejected within the active timeline. Reports are sent after serialized
coordinator operations and before paired saves. Display errors do not authorize
work or fail a valid pawn decision; the coordinator exposes `crewSyncError` and
retries at its next operation. Stale content is visibly labelled as the last
report, not live state.

The game save retains its last report as UTF-8/base64 for viewing without the coordinator, preserving JSON escape sequences through native string loading. The transport is bounded at two million characters in addition to entry and field limits. A load
changes the game epoch; saved contents are marked non-live until a valid new
report arrives. Paired restore replaces coordinator log history with that saved
branch and republishes it, excluding discarded future messages. Publication is
not a new action channel. Text is rendered without rich-text interpretation.

## Verification entry point

Use `RIMWORLD_LAB_ROOT=/absolute/lab bash scripts/run-crew-log-lab.sh game|cold`
with the existing disposable reconsideration fixture. The launcher holds the
exclusive coordinator lock throughout loads, actions and saves; direct invocation
is rejected before transport. The scripted scenario checks progress during
negotiation, refusal, rescue, privacy exclusion, old-report rejection and paired /
cold restore. It deliberately supplies an inaccurate public completion statement
so the UI can show a claim alongside distinct verified progress. It is not a live
model judgment trial. Native UI screenshots require separate visual inspection.
