# Models

What each model sees, what it may return, and how it is run and accounted for. The
rule underneath all of it: a model chooses among options it was given; it never gets an
action tool, a game handle or the database, and its prose never becomes an action.

Code: `src/model-perspective.ts`, `src/reflection-choice.ts`, `src/claude-decision.ts`,
`src/provider-diagnostics.ts`, `src/appraisal.ts`, `src/protected-jev.ts`,
`src/decision-trials.ts`, `src/prompt-accounting.ts`, `scripts/run-codex-contract.py`, `src/codex-decision.ts`, `src/ongoing-usage.ts`.

## Routes

| Use | Model | Route | Status |
|---|---|---|---|
| Pawn decisions, reflections, speech, core answers | `claude-sonnet-4-6` | Native Claude Code CLI, existing Max login | live trials |
| Core planner | `claude-sonnet-4-6` | same, own system prompt and ledger | live trials |
| Fast appraisal | `typesafe/jev-1.13` | OpenRouter System One (`POST /api/v1/systemone`), protected credential | bounded live trials; not in recent runs |
| Core and pawn decisions (ongoing mode) | `gpt-5.6-luna` | Native Codex app-server, ChatGPT login | live core/answers/reflections in one continuous check; work decisions and encounters not exercised through this adapter |
| Recorded-session feedback | `google/gemini-3.8-flash` | Protected OpenRouter, MP4 `video_url` | two offline responses on one scripted clip; not a character backend |
| Diary drafts | `moonshotai/kimi-k2` | OpenRouter via OpenClaw `llm-task` | editorial only |

Claude and Luna use no bare API mode, Agent SDK or extracted OAuth tokens. Their subscription logins are
used through their native clients. Claude subscription figures are API-equivalent estimates; the ongoing Luna route records native token usage, not per-call cash charges. Missing usage stays unknown. Jev and the Gemini video reviewer use the paid OpenRouter API: their reported usage cost
is monetary accounting, not a subscription estimate. Billing routes are never
switched silently.

## What a pawn sees

Offer decisions and reflections go through `modelPrompt`, which sends
`{task, perspective, executableChoices, contracts}`. Encounter turns (`socialPrompt`)
and core answers (`coreAnswerPrompt`) send the same perspective with a single fixed
contract. All pawn calls share a short fixed system prompt (`pawnInstructions`, about
670 characters).

- **Perspective**: the pawn's own facts and history, plus explicitly shared facts
  ([SOCIAL](SOCIAL.md#who-knows-what)). Needs are **self-describing**: Food, Rest and
  Mood are always listed, each with `known`, `fractionFilled`, `percentFilled` and a
  plain meaning ("0 = empty/starving; 1 = full/well fed. Higher is LESS hunger.").
  A missing, conflicting or invalid reading is `known: false` with a reason, never
  zero.
- **Contracts**: short rules. `knowledge`, `identity`, `evidence` and `sharedStatus`
  always; `move`, `haul`, `rescue` and `production` whenever the pawn has that
  observation (in the live game, always); `progress` when agreement progress is
  present; `offers` when offers are in view.
- **Choices**: every option carries its effect in words, e.g. counter: "Suggest
  different implemented work; execute nothing. Adoption requires another offer and
  fresh consent."

## What a model may return

Contextual schemas constrain supplied choice IDs, such as core opportunity IDs,
reflection agreement/proposal IDs and eating-stack IDs. This is not a guarantee for
every identifier: offer counter-actions use a static action schema with bounded
strings for item, patient and bed IDs. A structurally valid counter can be recorded
without grounded IDs; adoption must pass fresh proposal validation before creating
an executable offer. Contextual choices are revalidated before application.

### Offer decisions

`accept`, `refuse`, `defer` or `counter {action}`, each with a reason (1–1000
characters). A counter must be an implemented action; it executes nothing.

### Reflection choices

| Choice | Offered when | Effect |
|---|---|---|
| `keep_current_activity` | always | nothing |
| `withdraw_current_agreement` | the pawn has a running agreement | stops it (persisted first) |
| `request_rescue_alternative` | running haul, no request yet, a casualty observed | asks the core for a rescue instead |
| `answer_pending_proposal` | no commitment or agreement; up to 8 own pending offers | accept, refuse, defer or counter |
| `request_fresh_offer` | a deferred offer and nothing pending or running | invites one fresh offer |
| `revise_private_outlook` | own evidence, received messages or an existing outlook | replaces the outlook ([SOCIAL](SOCIAL.md#private-outlook)) |

In the schema, agreement IDs are constants, proposal and target IDs are enums, outlook
citations are enums of eligible sources, and `expectedRevision` is fixed. The canonical
coordinator kinds are `continue`, `withdraw`, `request_rescue`, `proposal`,
`request_reoffer` and `revise_outlook`. Prose is never parsed: a choice whose
explanation says otherwise is still the choice.

### Speech and core answers

Encounter turns: `say {text ≤240}` or `stay_silent`. Answers to the core: the same,
plus `eat {thing, text}` when eating options are offered. Core choices are in
[CORE](CORE.md#what-the-core-may-do).

## Isolation

Each Claude call is a fresh CLI process:

- flags: `--safe-mode`, `--tools ''`, `--disallowedTools mcp__*`, `--strict-mcp-config`
  with an empty MCP config, `--setting-sources ''`, `--disable-slash-commands`,
  `--no-session-persistence`, `--permission-mode dontAsk`, `--effort low`, thinking
  off, `--max-turns 2`, `--max-budget-usd 0.10`, fixed model and a replacement system
  prompt;
- a new temporary working directory and only `PATH`, `HOME` and `LANG` in the
  environment, plus `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`; the native login must report a first-party Max subscription;
- a start-up preflight that fails closed unless the only advertised tool is the
  `StructuredOutput` return format and there are no MCP servers, plugins, skills or
  slash commands; any other tool use or hook event aborts the call;
- limits: prompt ≤24,000 bytes, output ≤256 KiB, 90 s per process, cancellation kills
  the process group (SIGKILL after 1 s); one pending call per backend;
- the result must be a success, from the expected model only, with at most 2 turns.

**Core formatting recovery.** A core-planner result may report `num_turns: 3` only when the stream
proves one narrow pattern: two identified assistant messages, a first StructuredOutput
call rejected for a schema mismatch, a second valid call, and a final result.
This recognizes provider result-counter semantics, not a third assistant message;
pawn answers to core questions retain the ordinary guard. Messages
may span several stream events, but identities must be complete and consistent, no
message may reopen, and anything else (a third message, malformed blocks, unmatched
tool results, events after the result) rejects the answer. `--max-turns` stays 2.

**Luna** runs through the native Codex app-server with a pinned per-process provider
(ChatGPT endpoint, zero retries), a local catalog copy with tools and multi-agent
disabled, and a mock preflight that rejects any advertised tool before each real call.
The ongoing backend uses an ephemeral thread, replacement instructions, no dynamic
tools, a fresh empty working directory, and only PATH/HOME/LANG. The existing native
ChatGPT login must be present; no API/model fallback is allowed. Server tool requests
and executable items fail closed. The schema uses the existing Codex dialect conversion (singleton enums, tagged
`anyOf`, runtime duplicate-citation rejection). The final JSON is parsed and contextually validated,
then the coordinator rechecks current game state before dispatch. No game handle is
passed to the app-server.

`run-codex-decision.py` bounds the authored request to 64 KB (prompt 24 KB), RPC output
to 1 MiB and each inference to 60 seconds. The outer process budget is 110 seconds,
including isolation/authentication. Cancellation terminates the entire helper process
group, forcibly after 2.5 seconds. Selected final output and token usage are retained;
reasoning and account identifiers are not. Frozen historical offline suites are unchanged.

**Jev** runs through a Gateway-side protected transport: an injected opaque credential,
a fixed OpenRouter destination, no redirects, a bounded response size, and errors
without raw transport details. The lab host never receives the credential. Each call
asks one `reflect` question, and the serialized perspective is at most 16,000 bytes.

**Failures carry their cause.** A failed request records one content-free cause
(`context-too-large`, `request-too-large`, `cancelled`, `invalid-output`, `backend`,
`deadline`) in the backend's `failures`, the host receipt's `laneFailures` and the
decision-result wire message. This includes failures before any model call. Reflection
perspectives that exceed the 24,000-byte prompt limit are trimmed oldest-first (older
retained experiences, then memories, then messages) and marked `trimmed` in the view.
The limit itself is never raised. The ongoing runner counts failures per lane (core,
decision, core-answer, reflection); a success in one lane never resets another lane's
stop streak. Native/idle/busy/cooldown results do not reset it either; only an actual
successful inference in that lane does. Reflection schemas are built from the final
trimmed perspective, so omitted evidence cannot remain an advertised citation.

**Gate C fix verification (2026-09-24):** coordinator lifecycle, concurrent stale
publication and failure-guard regressions are mock-tested (388 tests pass). All six
retained oversized reflection inputs were replayed offline: final prompts are
23,829–23,934 bytes, with schemas matching the trimmed evidence. No model calls,
staging deployment or new gameplay were used; live/UI verification remains pending.

## Ledgers

Finite Claude trials have policies in `src/decision-trials.ts`; Jev uses its own
configured allowance. Both use separate SQLite ledgers (`TrialBudget`):

- each Claude attempt reserves USD 0.10 API-equivalent; each Jev attempt reserves
  USD 0.002 against its paid API allowance before the call. Jev reservations are
  conservative local accounting, not a provider-enforced maximum charge; verify
  pricing before a paid run;
- failed, invalid and cancelled attempts keep their reservation; reported usage is
  settled even for invalid output;
- a ledger is bound to one policy and never rolls back with a game save; unused
  allowance stays unused, and no cap is raised mid-trial.

Ongoing Luna uses a separate `luna-ongoing-v1` SQLite ledger, never a historical
allowance database. It records each attempt before spawning, and settles success,
failure or cancellation exactly once. There is **no turn ceiling**. An unfinished
attempt blocks further calls after a crash; three consecutive failed/cancelled attempts
also require diagnosis. Save restores cannot rewind this ledger. Native usage is
recorded as tokens, not invented dollar charges. Escalation to Terra/Sol is not yet
implemented and never happens silently.

## Diagnostics

Claude failures keep bounded, text-free diagnostics so they can be understood without storing
model output: the result type and subtype, API error status and allow-listed codes
(unknown values become `other`), turns, cost, which models reported usage, whether
structured output was present, up to 16 validation issues with truncated paths, and
per-message stream counts (capped). Each attempt also records the authored request
size in UTF-8 bytes (instructions, perspective and contracts, schema), not tokens.
