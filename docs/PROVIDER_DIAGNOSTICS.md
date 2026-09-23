# Provider diagnostics and observed names

PR35 retained a schema-valid inner refusal but lost the surrounding rejected
provider result. Its exact parsing failure cannot be reconstructed. The prior
run remains evidence of retention, not an applied refusal.

## Private result diagnostics

The native Claude adapter now records an allowlisted result summary before
parsing or process-exit acceptance: known result/subtype tags, boolean error
status, finite turn/cost readings, presence and counts of expected/other model
routes, and structured-output presence. Unknown string values are replaced with
`other`; arbitrary provider text, session IDs, account details and model-usage
payloads are not copied. Existing raw structured decisions remain private.

Parsing failures retain up to sixteen validation issue codes with bounded,
allowlisted field paths. Unknown paths are replaced, never copied verbatim.
No success, route, turn-limit, output-schema, isolation or accounting checks are
relaxed. A plausible inner choice inside a rejected envelope still authorizes
nothing. The records are operator diagnostics, not pawn perspectives or crew-log
entries. Nonzero exits retain the summary if a result was received first; a
transport failure without a result still has no result summary.

## Names without a global directory

Delivered correspondence snapshots the native sender and recipient labels beside
their stable IDs. Retained outlook citations carry the same snapshot through
save/reload. Labels do not replace identifiers, establish ownership or consent,
and may be duplicated or renamed. Old messages without labels remain valid and
are not rewritten. Quoted speech is never rewritten to substitute names.

A pawn's current perspective gets ID/name pairs only for fresh locally visible
subjects. A captured native experience can retain a subject label if that subject
is locally visible when it is ingested. This is the label at capture, not proof of
the name at the original event time. No other-pawn facts or global character
registry reaches the model. Missing names remain unknown. This bounded slice
does not reconstruct names for all historical memory strings or hidden people.

## One new native pair

The user authorized one repetition of [the native retention design](NATIVE_RETENTION.md)
after these changes: same authored direct request, same common native event and
physical baseline, same two reflection choices, then fresh one-trip work consent.
Use an explicit `policy: "retention-names-v1"` in the private host configuration,
with a new ledger: four Claude attempts / 0.40 USD API-equivalent reservation,
zero Jev, no retries or reoffers, at most sixty seconds of native activity per arm.
The historical live runner policy is frozen against new calls through this host
runner; old ledgers and evidence are unchanged. The existing lifetime-lock,
scripted rehearsal and no-inference cold-restore commands remain in use.

This is a versioned follow-up, not an identical prompt replication: names and
their explanatory contract are newly supplied. Both recent speech and outlook
reach later choices, so note influence is not isolated. Indirect-message scenarios
remain a separately frozen next experiment; no allowance is enabled here for them.

## 2026-09-23 result

[Sanitized receipts](evidence/named-retention.json) retain both scripted and live
pairs. Live control formed a Food concern, accepted and delivered ten wood.
The message condition formed a stance citing Beatrice's request plus a Food-related
note, then **applied a refusal**, with no hauling job. Its reply used “Beatrice”
and cited low Food as well as the request; the native public log preserved it.
No prose rewriting was used. Both notes and outcomes survived paired/cold restore.

All four provider calls validated: success, two turns, only the expected model
route. All 96 activity samples were unpaused. Four attempts, zero Jev, no retries;
cleanup clean, staging stopped. All 239 Node checks passed. Independent Codex
source review found no actionable defects; direct sandbox probing separately
verified readable source and denied writes. An intentionally injected global-name
leak was rejected by the privacy test. All 73 historical databases were unchanged.

This does **not** explain PR35's missing envelope or establish that its parser
was incorrect. No validation rule was relaxed. Future failures can retain more
useful diagnostics, but none occurred in this four-call pair. The next behavioral
check is a separately frozen indirect-message contrast, not a claim that this
explicit request demonstrated indirect persuasion.


## Bounded typed failure sequence

The [provider failure investigation](PROVIDER_FAILURE_PROBE.md) adds allowlisted
API-error metadata and a bounded ordered formatting sequence. Inputs and raw
error text remain excluded. Concord input checks are distinct from provider
JSON-schema checks. The linked report documents the subsequent core-only,
trace-proven formatting-recovery rule; it is not a blanket turn-limit increase.
The saved-situation probe is not a new colony allowance.
