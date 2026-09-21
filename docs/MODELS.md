# Model access and adapter plan

Checked 2026-09-21. No live inference was used in foundation acceptance. A later protected synthetic Jev fixture verified transport and response parsing only. Runtime authentication and billing configuration stay outside this repository.

## Jev on OpenRouter

Confirmed via the model page and the model-specific endpoint:

- Model: `typesafe/jev-1.13`
- Provider: TypeSafe
- Context: 32,000 tokens
- Listed input price: USD 0.042 per million tokens; output: free
- Modality: `text->decisions`
- Interface: **OpenRouter Decisions API**, not the OpenAI-compatible chat-completions endpoint. A chat SDK/adapter is not sufficient.

The general `/api/v1/models` catalog did not include Jev during the check, while the model-specific endpoint did. Availability checks must account for specialized APIs; absence from the general catalog does not establish absence from OpenRouter. A protected live call later confirmed account-specific access to `POST /api/v1/systemone` for one synthetic appraisal fixture.

Sources:
- https://openrouter.ai/typesafe/jev-1.13
- https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints

TypeSafe documents Choice, Score and Noul primitives. Choice/Score include probability distributions and a derived confidence statistic. These fit bounded appraisal questions. Schema validity does not establish good judgment, and vendor speed/cost figures are not local measurements. OpenRouter also documents a TypeSafe-compatible `POST /api/v1/systemone` endpoint: TypeSafe SDK base URL `https://openrouter.ai/api`, with the existing OpenRouter authentication route. It accepts bare `jev-1.13` or the namespaced ID and returns answers plus usage/cost. This means a separate direct TypeSafe account is not inherently required. The native Decisions API is currently labeled alpha; use a version-pinned, validated adapter rather than a chat-completions shim.

Compatibility guide: https://openrouter.ai/docs/guides/community/typesafe-sdk.md

TypeSafe docs: https://docs.typesafe.ai/ and https://docs.typesafe.ai/confidence

## Agent runtimes versus model APIs

Codex documents ChatGPT sign-in for subscription access, API keys for usage-based access, and an app-server interface for embedding the Codex client. Its authentication page recommends API-key authentication for programmatic workflows. Do not treat subscription credentials as a generic API key or assume unlimited unattended inference. A client adapter needs a supported access path and isolation from coding-agent shell/file tools.

Claude Code documents noninteractive CLI operation. Its bare mode does not read subscription OAuth credentials and requires supported API/provider authentication. The Agent SDK overview also distinguishes supported SDK authentication from offering third-party subscription login/rate limits. Verify the precise route before wiring an embedded game-agent backend.

Sources:
- https://developers.openai.com/codex/auth
- https://developers.openai.com/codex/app-server
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/agent-sdk/overview

## Runtime policy

Start with scripted fixtures, then one explicitly configured live backend. Keep secrets in host-owned protected configuration. Set project budgets before unattended paid trials; never silently switch billing routes. Native clients/OpenClaw and Pi remain optional runtime implementations rather than game-protocol dependencies.

Compare rules+LLM with rules+appraisal+LLM on identical recorded perspective episodes. Measure missed escalation, character consistency, actual action outcomes, latency tails, total cost including downstream LLM calls, and timeout recovery.

## Implemented appraisal adapter

`src/appraisal.ts` now implements the System One `noul` request and validates its response, with an injected operator-owned transport. `TrialBudget` keeps conservative call reservations in a separate SQLite ledger that must not roll back with game saves. Mocked unit coverage covers malformed output, cancellation and budget behavior. One protected live synthetic fixture returned `typesafe/jev-1.13-20260917`, score `0.64`, route `deliberation`, latency `1078ms` and reported cost USD `0.000020244`; see [live evidence](evidence/jev-live.json). A subsequent [real-game trial](evidence/jev-game.json) returned scores `0.23` and `0.21` for captured food and mood events (704ms and 362ms end-to-end API waits). Both retained native behavior. Across the synthetic and game runs, three calls reported USD `0.000133266`; the three-call trial is exhausted, without changing its allowance. This is not a character-quality comparison. See [live operation](LIVE_APPRAISAL.md) and [awareness](AWARENESS.md).

## Native Claude Code deliberation trial

Claude Code 2.1.263 was verified with its normal noninteractive CLI and existing
first-party Max login, fixed to `claude-sonnet-4-6`. We do not use bare mode, the
Agent SDK, extracted OAuth tokens or a generic model API. A restricted environment,
empty tool/MCP configuration, safe mode and stream checks enforce the pawn's
limited interface. The only advertised tool was `StructuredOutput`.

The synthetic decision took 3133ms; a real-game explicit decision took 3448ms and
accepted a move that actually completed. A second real-game reflection was
cancelled after a newer conversation memory arrived; it produced no accepted
answer. The three-attempt allowance is exhausted and no retry was made. Successful
responses reported USD 0.021867 total **API-equivalent estimated usage**, not cash
charges. Cancelled-call usage is unknown; its full reservation remains, bringing
reserved equivalent usage to USD 0.30. The Jev ledger and paid-call cap are unchanged.

See [runtime controls and operator guide](LIVE_DELIBERATION.md). Native subscription
rate limits still apply. This result proves a narrow integration, not unlimited
subscription use, narrative quality or an unattended service.


## Follow-up thought reliability

A separately bounded four-attempt native Max trial completed two calls per mode:
paused explicit decision 3253ms and reflection 4179ms; continuous explicit decision
3622ms and reflection 6183ms. Both accepted the nearby move (completed in-game)
and refused the implausible waypoint during native-event reflection. Paired and
cold restore passed separately in each mode. These are individual observations,
not a model ranking or latency benchmark.

The new ledger reserved USD 0.40 API-equivalent usage and reported USD 0.06234 in
successful completion estimates, not cash charges. Both historical ledgers remained
byte-for-byte unchanged. No Jev calls or automatic retries occurred. The four-attempt
allowance is now exhausted. See [timing](DECISION_TIMING.md) and dated acceptance.
