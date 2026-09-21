# Model access and adapter plan

Checked 2026-09-21. No live inference was used in foundation acceptance. Runtime authentication and billing configuration stay outside this repository.

## Jev on OpenRouter

Confirmed via the model page and the model-specific endpoint:

- Model: `typesafe/jev-1.13`
- Provider: TypeSafe
- Context: 32,000 tokens
- Listed input price: USD 0.042 per million tokens; output: free
- Modality: `text->decisions`
- Interface: **OpenRouter Decisions API**, not the OpenAI-compatible chat-completions endpoint. A chat SDK/adapter is not sufficient.

The general `/api/v1/models` catalog did not include Jev during the check, while the model-specific endpoint did. Availability checks must account for specialized APIs; absence from the general catalog does not establish absence from OpenRouter. No inference request or account-specific availability test has been made yet.

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
