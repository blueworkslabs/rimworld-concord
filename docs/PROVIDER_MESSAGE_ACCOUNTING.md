# Identity-checked provider message accounting

PR49 delivered one repaired core question but rejected another repaired result:
the latter had three assistant events and two distinct message IDs. An assistant
message can span several stream events. The old exact-two-events shortcut was
stricter than a two-message bound.

## Correction

The stream observer now tracks identities in memory and records only local
message ordinals, a versioned completeness flag, and the number of covered
assistant events. Raw message/tool IDs, text, thinking content and tool inputs
are not retained in these diagnostics.

For the existing core-only recovery rule:

- Every assistant event must have a nonblank string message ID of at most 200
  characters and a content array whose blocks have known valid shapes (text,
  thinking, redacted thinking, or StructuredOutput tool use). Unknown types,
  non-object blocks and malformed required fields invalidate coverage. Split text/thinking events may share the same
  current message ID. IDs are opaque; they are not treated as timestamps or order.
- The first formatting call belongs to message 1, the second to message 2. Exactly
  two distinct messages and two formatting calls remain required. Each call must
  have its correctly matched, ordered tool result.
- An earlier message cannot reopen after a new one begins, or after its own tool
  result closes it. Assistant/user data after the final result invalidates coverage.
  Missing, empty, oversized or unmatched identities fail closed.
- Identity coverage must include every counted assistant event. Maps are bounded
  to 32 identities and counters to 4096 events; overflow invalidates recovery.
  Existing 32-event diagnostic and 262144-byte transport bounds remain.
- The sequence still requires one Concord-invalid input/provider schema failure,
  one Concord-valid repair/tool success and a successful final result with counter
  three. CLI max-turns stays two. Other character modes keep their prior guard.
  Isolation, final envelope/model/context checks, cost/time limits and rejection
  of unconsumed stream bytes remain unchanged.

This is a correction to message accounting, not a new attempt allowance, retry
loop or permission for a third model message. Receipts still mark accepted
formatting recoveries explicitly. Diagnostics remain operator-only.

## Evidence boundary

Offline fake-client tests cover split text and thinking blocks, both message
positions, missing/blank/oversized IDs, a third identity, reopened identities,
unknown tool results, duplicated call IDs, malformed content and events after a
result. Full subprocess tests exercise adapter acceptance, final context rejection
and retained failures. A deliberate raw-ID-for-ordinal mutation fails the privacy
regression; the compiled artifact is then restored and relevant tests pass.

The original PR49 receipt has aggregate counts, not per-event identity coverage.
It remains rejected by the new proof check. The synthetic three-event/two-message
case models a plausible split, **not a reconstruction of the original stream**.
Historical traces, failures and allowances are unchanged. No new character-model,
Jev or game calls were made. Staging stays stopped.

The correction has automated/offline verification, not fresh live confirmation.
It does not establish useful planning, eating, construction or better explanations.

[Ten synthetic event-shape cases](evidence/provider-message-accounting.json)
retain the observed counts and new coverage metadata. The normal two-event repair
and splits in either message pass; missing identity, a third message, reopening
post-result events and malformed content blocks fail. They use the retained PR49 inner choice/view with
an authored invalid first input and authored IDs; the original trace remains
unproven and rejected.

313 Node checks and ten Python checks pass. All 226 historical database-related
files are unchanged. The privacy mutation and independent review artifacts remain
private. No new allowance or model route is introduced.
