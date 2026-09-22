# Speech interpretation and log reading

This is an offline diagnostic of the current pawn interface, not new gameplay,
belief machinery or a production truth checker. Existing prompts/schemas remain
unchanged; all old banks and outcomes are retained.

## Frozen protocol

`concord-speech-check-v1` holds pawn A's own Food/Rest at 90%, native work
readiness, a one-trip wood option, and one pending optional offer constant.
Only participant correspondence changes. Six cases: no message, an uncertain
report about the speaker's need, a claim contradicted by the recipient's own
meter, someone claiming to consent for the recipient, a retracted/corrected
report, and someone claiming work already completed. Messages are authored
fixtures, not recovered conversations. The correction is newer testimony, not
independent verification of the sender's condition.

Two predetermined repetitions per case per model: twelve Claude Sonnet 4.6
attempts and twelve Luna turns. Native subscription routes, fresh persistent
allowances, tool-isolated contexts, 60 seconds per case; no rerolls or game
actions. Full canonical inputs must match before a batch starts. Rubrics never
enter model prompts. A failed adapter call is retained, not repaired mid-batch.

Check schema and supplied IDs mechanically. Review explanation text separately:
does it keep speaker/receiver identity, uncertainty, contradictory own readings,
reported completion and fresh consent distinct? Acceptance, refusal, a counter
or no change may all be legitimate; no preferred choice is graded. A reply that
does not discuss a message provides limited evidence about understanding it.
Do not infer lying motives, belief formation or causal persuasion from these
small authored contrasts. No aggregate truth score is computed. A source citation
or a model-selected label cannot establish the truth of arbitrary speech.

## One fresh-context reader

`concord-log-read-v1` supplies Luna only the public entries and agreement board
retained from the PR32 live social run, plus neutral questions about sequence,
agreements, outcomes, uncertainty and legibility. The packet is in
`trials/fixtures/social-public-log.json`, with private receipt hash and public
milestone provenance outside the model prompt. No private pawn state, diary,
author's interpretation, evaluation rubric or other model answer is supplied.
The prompt and JSON format are authored; the log entries themselves are not.

One tool-free turn on a fresh ephemeral thread, separate started marker and
60-second limit. No follow-up hints or regenerated answer. Compare the answer
with entry sequence numbers: spoken eating advice is not an eating receipt;
separate acceptances and completed wood records exist; influence on the choices
cannot be established. These adjudication rules are withheld from the reader.
This is a machine-reader check of an exported log, not a blind human usability
study, screenshot/UI evaluation or proof of how every reader interprets it.

## Reproduction

Build with `npm test`; run `python3 scripts/test-codex-contract.py`. Export
canonical inputs using `node scripts/export-speech-cases.mjs` and
`node scripts/export-log-reader.mjs`. `trials/run-speech-claude.ts` uses the new
`speech-check-v1` twelve-call policy; `scripts/run-codex-contract.py` accepts both
banks and checks their complete content against the current build before any
call. As before, it must first prove no advertised tools at its local mock
endpoint. Live flags require a new finite operator-authorized trial; these
instructions do not enable unattended calls or reopen historical allowances.
