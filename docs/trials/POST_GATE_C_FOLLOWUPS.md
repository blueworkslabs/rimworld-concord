# Post-Gate-C follow-ups 1–5 — verification

[PR #82](https://github.com/blueworkslabs/rimworld-concord/pull/82), behavior
`6669461`, after the [native freshness fix](../MIGRATION_HAULING.md).
This does not replace any earlier recording, cold read or Gate C verdict.

## Review correction

Independent Codex review found that reflection handoff used the fitted copy but the
coordinator still validated outlook citations against the original, longer history.
The corrected coordinator retains its own fitted snapshot and hands the backend a
separate copy. Outlook updates may cite only evidence in that fitted snapshot; fresh
revision checks still apply. A real `DecisionChannel` regression rejects a citation
removed by trimming without changing the pawn's outlook or stored evidence.
Claude also uses the shared prompt-limit constant, rather than a second literal.

## Offline verification

- Full suite: **416 pass, no failures or TODOs**; 117 focused regressions pass.
- Meal memories are queued during the pawn's core answer; `Insulted` still interrupts.
  An unsettled self-care receipt blocks a new question until reconciliation settles it.
- Archive rendering includes gross arrivals and removals and refreshes the changed
  entry's timestamp/order. A request wake answered elsewhere still shows "heard".
- Authored core and reflection turns used `DecisionChannel`, with their captured views
  passed through the actual Codex request and Claude schema builders. Core prompt:
  **23,643 bytes** (12 old messages removed). Reflection prompt: **23,897 bytes**
  (7 old memories removed). Both fit the unchanged 24,000-byte limit, include the
  trimming note, retain the newest item, leave stored history unchanged, and refit
  without further changes. No provider was invoked.

## Game verification

All four cases passed on the controlled historical eating fixture: speech alone
created no action and consumed nothing; typed eating completed **16 berries**
(225 → 209); pawn stop and operator cleanup each interrupted with zero consumed.
Only completed eating permitted exact self-care topic closure; broader food closure
was rejected in every case. Paired restores and a separate coordinator-process cold
check passed for all four cases.

All **413 pre-existing saves** are unchanged; nine new fixture/checkpoint saves are
retained. The previous complete mod is restored and game/display are stopped.
The helper ordinary-play fixture was not used; no video was recorded.

[Sanitized acceptance receipt](../evidence/post-gate-c-followups.json).

## Limits

Memory-interruption, archive rendering and acknowledgement cases are mock-tested;
this is not a new in-game memory/answer collision or visual acceptance claim. The
trimmed-input cases are offline, not new live-model calls. Cold restore recreates the
coordinator process, not the game process. Bounded re-wake design and attention-buffer
eviction diagnosis remain separate follow-ups (items 6 and 7).
