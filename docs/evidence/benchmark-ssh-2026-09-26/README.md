# SSH benchmark lifecycle and first controller pair — 2026-09-26

**No scored comparison.** The actual SSH scripted pair passed; the first real-controller
rehearsal pair failed authentication in both arms before any game-tool call. Original
attempts, recordings and controller logs are retained. [Machine-readable summary](summary.json).

## Reviewed transport

PR #97 is stacked on #96. Independent review covered the transport corrections through
`e9d877e`: cleanup executes on the host owning the arm process; disconnect kills in-flight
arm descendants; cancellation during preflight cannot subsequently spawn a controller;
the game starts its timer before authorizing host spawn; invalid lock checks fail closed.
Display settings are explicit and one lab lock covers both arms. No credentials were
copied and no alternate billing route was configured.

A local-recorder proof passed for Codex **0.153.4**, requested **gpt-6-astra / medium**.
Both real-arm preflights also passed over actual SSH: matching context and only the arm
interfaces differing. **These checks establish tool/context configuration, not authenticated
provider access.** The earlier expectation that this launch environment had native login
was incorrect.

## Recorded scripted pair

Runtime `e9d877e`, harness then UI, real SSH rather than a shim, zero model controller.

- **Harness:** fixed-script campfire and three-iteration bill completed. Checker observed
  a new campfire, three-count bill, same bill at zero and native meal delta three.
  13 inputs (including 3 controls), 10 observations, no tool errors or unresolved calls.
  Recording **28.867 seconds**, including lifecycle padding.
- **UI:** screenshot, selection and pause/speed lifecycle passed; **T1 was not attempted**.
  5 inputs (including 4 controls), 5 observations, no tool errors or unresolved calls.
  Recording **10.600 seconds**.

Both stand-ins exited normally. Their zero token totals are authored stand-in metadata,
not measured model usage. Do not compare scripted elapsed times with a model-driven arm.

## First real-controller rehearsal pair

One attempt per arm, harness then UI; fresh **gpt-6-astra / medium**, identical frozen T1
save/task, **1,200-second limit per arm**, no changes between arms. The machine field
`rehearsal: false` means the real Codex process was used, not the scripted replacement;
the explicit `real-controller-rehearsal-pair-1` label makes this an **unscored rehearsal**.

Both exact-SSH preflights passed. Both controller processes then exited **1** after
unauthenticated provider requests returned **401 / missing authentication**. There were
**zero game-tool calls, zero answers and no usage records**. Game tick stayed at **2**.
The harness and UI recordings are **18.467** and **17.667 seconds**. They are retained
infrastructure failures, not task-performance observations. No successful model inference
is evidenced; billed USD and tokens remain **unknown**, not zero. Built-in transport
reconnects belong to each retained attempt; no new pair or arm reroll was launched.

The runner's generic `controller-exit` outcome and null cleanup failure do not mean a
successful controller turn: exit status 1 and retained `turn.failed` events establish failure.
The empty tool log's zero error count counts tool errors only, not provider errors.

## Readiness correction and handoff

A non-inference `codex login status` in the launch environment returned **Not logged in**.
Post-run revision `5aebad5` adds a native ChatGPT-login readiness check before game access
for real local and cross-host launches, refusing logged-out and API-key modes without
printing credential-bearing status. This is necessary readiness, not proof that a subsequent
provider request will succeed. Preparation/proof and authored rehearsals remain model-free.
The new gate was tested offline; it was **not** deployed to rerun this pair.
[Official authentication documentation](https://developers.openai.com/codex/auth/) distinguishes
native subscription login from API billing and local credential-store configuration.

Next: establish the intended host-owned native login for the exact controller launch
environment, then rerun its matching isolation proof and plan a separately labelled pair.
Do not copy credentials, silently use an API key, or call the failed pair a benchmark result.
The placement-query follow-up stays separate; the earlier 53 rejected probes were
**post-task zone checks**, not campfire placement.

## Verification and preservation

**487 tests pass.** The prior full suite retained one unrelated cancellation-test failure
before an unchanged passing retry; the final suite after login-gate correction passed.
The original PR CI shell test assumed Node lived in `/usr/bin`; its PATH now includes the
installed Node binary directory. Tests do not establish live authenticated model access.

All four recording copies match the runner's SHA-256 values. All six registered arm
processes (including both preflights) were verified gone. Game and display stopped;
previous mod restored; **440 original saves unchanged, no new saves**. Private saves,
full model/controller logs, host configuration and raw review reports remain outside Git.
#89 remains held. No harness advantage is claimed.
