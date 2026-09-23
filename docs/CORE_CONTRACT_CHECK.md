# Corrected core contract check v1

This is an offline provider-interface check after [PR42](https://github.com/blueworkslabs/rimworld-concord/pull/42), not a fourth colony run. No game launch, pawn calls, Jev calls or action dispatch. The previous three failed trials and their ledgers remain unchanged.

## Frozen cases and budget

The source is the exact public core perspective at tick77, revision1 of campfire live run one. It includes coarse shared telemetry, available work and an optional question for each pawn, but no private pawn state. `trials/fixtures/core-contract-v1.json` is hash checked before use.

Six calls maximum, native Claude Max / `claude-sonnet-4-6`, no route switch or rerolls. Fresh `core-contract-v1` ledger reserves up to 0.60 USD API-equivalent, not cash billing; existing adapter reserves 0.10 per attempt. Each case has a 60-second signal timeout. Failures stop the batch; unused slots are not filled with retries.

Order: original, question-or-wait, wait-only, then the same three again. Each is an independent fresh call with no earlier model answer carried forward.

- **Original:** unchanged saved perspective, including all ten opportunities.
- **Question-or-wait:** authored menu restriction removes opportunities and counters, adjusts availability to no eligible work. Questions remain available; asking is not required.
- **Wait-only:** same restriction plus an empty question-recipient list. This deliberately restricted interface case is not a naturally occurring game state or evidence of voluntary restraint.

Both variants otherwise preserve the original perspective, including capability descriptions and telemetry. They test narrower action menus, not causal behavioral comparisons. Propose is valid in the original; a preferred story or refusal is not required. There is no counter-adoption case or live execution coverage.

The runner checks the full archived prompts, instructions, schema and views against its current canonical suite before creating a backend. It claims a one-shot marker before calls, records each started case before inference, persists raw provider responses and diagnostics after every attempt, and uses the existing strict runtime validator. It cannot apply a choice to the game.

## Invocation

After fresh finite operator authorization and independent review:

```
npm run build
node --input-type=module -e "import {coreContractSuite} from './dist/trials/core-contract-cases.js'; console.log(JSON.stringify(coreContractSuite(),null,2))" > /absolute/private/cases.json
node dist/trials/run-core-contract.js /absolute/private/cases.json /absolute/private/fresh-output --live
```

Use a new output only for a separately authorized experiment, never to bypass a consumed marker or allowance. Frozen historic requests require their original build; contract drift is rejected before inference.

## Assessment

Separate provider success, strict runtime acceptance, action/topic-link consistency, supplied-ID use and manual explanation grounding. A valid ask is not a delivered conversation; a valid proposal is not pawn consent or completed work. Zero validation failures in six calls would support this small interface sample only, not general reliability, live planning or native campfire/cooking behavior. No automatic long-trial follow-up.

## Result

All **six replies passed provider parsing and strict runtime validation**: four questions to Alvin with null action-topic links, and two waits in the restricted wait-only cases. No proposal or counter branch was selected. Six attempts, no retries, zero pawn/Jev calls and zero game actions. Median host-observed latency was 7447.0 ms; reported API-equivalent usage was 0.1452912 USD (not cash billing).

All replies described the supplied need bands consistently. Two questions used “your food looks low”; some topic/reason wording says the pawns “report” needs. Their surrounding text identifies telemetry, but the fixture contains neither a visual observation nor pawn testimony. This source-attribution ambiguity is retained, not counted as perfect grounding.

The original-view cases freely selected questions rather than construction offers. The other waits were the only action allowed; they do not demonstrate character restraint. These offline choices were never delivered or applied, and no follow-up conversation occurred. Six valid answers support this corrected interface sample, not general model reliability or a working colony plan. The earlier 23 rejected outputs remain unchanged.

[All outputs, raw structured returns and assessment](evidence/core-contract-check.json) · [Exact archived requests](../trials/fixtures/core-contract-requests-v1.json).

293 Node checks and independent Codex review passed. All 218 historical database-related files are unchanged. Staging remained stopped. No production behavior change beyond adding the isolated trial policy and runner. No separate diary entry for this narrow contract check; the PR and evidence carry the result.

Next useful evaluation: one separately bounded in-game question → voluntary reply → core follow-up, permitting work proposals or waiting without requiring construction. Do not automatically append another long colony run to this completed probe.
