# Fixed-snapshot Luna contract probe

This is an offline operator benchmark, not a Codex pawn backend. No coordinator,
game bridge, job dispatch, save restore or social feature is added. Staging stays
stopped. The five synthetic authored perspectives are quiet, noticed casualty,
active hauling, pending rescue and recovery after an earlier private concern.
Continuation is always valid; the evaluation has no obedience or heroism quota.

## Native route and isolation

Use the installed native Codex app-server with ChatGPT sign-in, selected model
`gpt-5.6-luna`, low effort, standard service tier and fresh ephemeral threads.
Native Codex owns authentication; credentials are never copied into the probe.
The account type must be ChatGPT and the returned model/provider must match.
There is no API-key or alternate-model fallback. This client rejects overrides
of built-in provider IDs. A per-process `concord_native` provider entry therefore
pins the SAME native ChatGPT endpoint (https://chatgpt.com/backend-api/codex),
requires native OpenAI authentication, and sets request/stream retries to zero.
It is not an API-billing endpoint, copied credential or global provider change.

Both thread and turn explicitly specify no execution environments; dynamic tools
are empty. Shell, apps, plugins, MCP, skills, hooks, web search and delegation are
disabled, including the separate legacy `notify` command. The model metadata's tool presentation overrides client feature flags,
so a LOCAL catalog snapshot changes only `tool_mode` to `direct`,
`multi_agent_version` to `disabled`, and `supports_search_tool` to false. The model
ID and all other model metadata stay unchanged; installed/global configuration
and account settings are untouched. A local HTTP mock captures real outgoing
requests for all five cases and rejects any top-level or additional tools before
native inference. The same executable, catalog and tool configuration are used
for the subscription run; only the mock provider is replaced by the pinned native ChatGPT provider.
Unexpected tool items, approval requests or instruction sources fail closed.

Codex's structured-output dialect uses anyOf instead of disjoint tagged oneOf
branches, and singleton enums instead of const. Citation uniqueness stays a
runtime validation check. The pawn contract/perspective and executable choices
otherwise match the current reflection interface. Explanations and contextual
choices must still pass strict runtime parsing; schema validity is not semantic
truth. A separate review examines claims against the supplied snapshot.

## Finite operation

Five cases, at most one turn attempt each, 60 seconds per case. Consumption is
saved before starting each case. A failed/timeout attempt stays spent, and an
existing started marker prohibits replay or resuming that batch. Native transport
retry settings are zero; no choice is retried or repaired by the probe. A failed
transport stops the batch; provider-level failed turn results remain recorded.
Remaining allowance is not a mandate to use it. These are native subscription
turn attempts, not dollar estimates or proof of cost savings.

Build and run from a private operator directory (paths below are placeholders):

```sh
npm test
codex debug models --bundled > /absolute/private/source-catalog.json
node scripts/prepare-contract-cases.mjs /absolute/private/cases.json /absolute/private/source-catalog.json /absolute/private/luna-catalog.json
python3 -B scripts/run-codex-contract.py /absolute/private/cases.json /absolute/private/luna-catalog.json /absolute/private/dry
# Only after source review and inspection of the dry request capture:
python3 -B scripts/run-codex-contract.py /absolute/private/cases.json /absolute/private/luna-catalog.json /absolute/private/live --live
```

The live command repeats the no-inference transport preflight before invoking the
native model. Preserve receipts, fixed case/catalog hashes, raw answers and all
failures. Validate each answer with `checkContractResult` from contract-cases.
Do not execute its canonical choice. Inspect explanation/action agreement and
factual grounding separately; choices between valid alternatives are not errors.
Latency includes native runtime overhead. This small smoke test cannot establish
model rankings, causal character continuity, price savings or gameplay success.

Sources: [App server](https://learn.chatgpt.com/docs/app-server),
[model catalog setting](https://learn.chatgpt.com/docs/config-file/config-reference),
[models](https://learn.chatgpt.com/docs/models),
[structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
