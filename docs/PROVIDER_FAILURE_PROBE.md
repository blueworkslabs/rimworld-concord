# Provider failure investigation

This follows the retained failures in PR44 and PR47, not a new colony trial.

## Evidence and instrumentation

Installed Claude Code 2.1.280 exposes typed API-error categories and HTTP error
status, and validates StructuredOutput inputs against the requested JSON schema.
Its successful-result turn counter and max-turn stop counter use different paths.
PR47 retained two formatting calls and one tool-result error on its final
three-turn result, but not enough detail to identify that error. Its early
provider errors lacked retained status/category. Those historical causes remain
unresolved; new diagnostics cannot retroactively recover discarded data.

The adapter now records:

- HTTP status 400–599 and known API category/code enums; unknown strings become
  `other`, absent fields `missing`. No arbitrary provider error text is kept.
- At most 32 ordered events: typed API errors, formatting calls, their results
  and the final result. Temporary tool IDs become local numbered references,
  not persisted IDs. Repeated call IDs are deduplicated in this ordered view;
  the older event counters still count stream occurrences. Truncation is explicit.
- Attempted formatting input is checked in memory against Concord's existing
  structural/context rules. Only bounded validation codes and allowlisted paths
  remain; the input is discarded. This is **not** a reproduction of the provider's
  JSON-schema/AJV check. A `valid` label here cannot overrule a provider rejection.
- Tool-result error prose is reduced to a known schema-mismatch/input-validation
  marker or `other`. Values, messages, arguments and account details are not kept.

During the frozen probe, CLI max-turns 2 and successful-result num_turns<=2
remained unchanged, along with model route, tools, authentication, cost and time
limits. The subsequent correction below is not part of that tested build.
Diagnostics are operator-only: no new game authority or character knowledge.

## Frozen four-attempt probe

Use the exact first and final CoreViews from PR47's public receipt, without
changing their choices. Alternate initial/final twice: four requests total,
one attempt each, with exact instructions, prompt and output schema archived.
The first view has observed food and work opportunities; the final view has
empty local sightings and no work options. Neither is a newly observed colony.

- Fresh `provider-diagnostic-v1` native-Claude-Max ledger: at most 4 core attempts,
  reserving 0.40 USD API-equivalent, not cash billing. Historical caps unchanged.
- 60s per case; same model/client and strict provider guard.
- No pawn calls, Jev, game launch or action application.
- Retain every result, including failures. Preflight login/setup/budget/isolation failure
  stops the run; otherwise move to the next predetermined case, never replay a
  failed case to replace its result. Internal provider formatting attempts are
  recorded separately from operator/backend attempts.
- Canonical request bank validation occurs before backend creation; an exclusive
  start marker prevents rerunning an output directory. Reopened ledgers keep caps.

Generate the private bank from `providerDiagnosticSuite()`, then after finite
operator authorization and independent review:

```
node dist/trials/run-provider-diagnostic.js /private/cases.json /private/output --live
```

This small probe tests the interface and diagnostics, not character judgment,
colony planning or a general failure rate. Successful calls do not explain old
failures; even recurrence would diagnose only the newly retained sequence.

## Observed result and narrow correction

All four fixed attempts completed: two original successes and two original
rejections. Both initial-with-food replies asked Alvin about raw berries. Both
final-without-local-food replies first exceeded the 240-character topic-text
limit (`core.topics[0].text`), received a provider schema-mismatch result, then
returned a valid repair. Successful-result `num_turns` was three, so the existing
adapter rejected those two repairs. The frozen receipt retains those failures.
No API-error event recurred; the earlier transport failures remain unresolved.

The installed client counts initial input plus user/tool-result events in its
successful result, separately from its max-turn stop counter. A **core-only**
correction now recognizes exactly this bounded recovery sequence:

1. Two assistant events with two distinct message IDs and two formatting calls.
2. First attempted input fails Concord validation and its matching provider tool
   result reports a schema mismatch.
3. Second attempted input passes Concord validation and its matching tool result
   succeeds.
4. Exactly two user events/tool results, one tool error and one successful final
   result with `num_turns: 3`. The five-event trace must be complete and ordered.

Only that proof permits the three-valued result counter. Missing, truncated,
extra, unmatched or differently failing traces retain rejection. Other character
modes retain the two-valued guard. CLI max-turns remains two; tools, model route,
success envelope, cost/time limits and final choice/context validation remain
mandatory. Counts describe stream events, not a guarantee about HTTP attempts.
Accepted recoveries are explicitly marked in adapter receipts.

The correction is tested with fake native streams and offline replay of retained
allowlisted metadata/outputs, **not another live call**. The four-call result is
not retroactively relabelled successful, and no repaired choice was delivered to
a pawn or applied to a game. A new colony trial remains a separate next step.

### Grounding limits

“Your food looks low” blurs telemetry with visual observation. The first response
calls observed berry stacks “patches”; topics also sometimes describe telemetry
as a pawn report. These descriptions are retained, not corrected in the outputs.
Contract validity does not establish grounded prose, useful planning or a general
failure rate. This operational check has no separate narrative diary entry.
