# Bounded live deliberation

The operator runner uses the **native Claude Code CLI**, signed in through its
existing Max subscription. It does not extract OAuth credentials, invoke a generic
API with subscription tokens, or fall back to paid API authentication. This is a
finite integration experiment, not a supported unattended colony service.

## Contract and isolation

`ClaudeDecisionBackend` implements explicit proposal decisions and event-triggered
reflection. It receives only the owning pawn's perspective. The response must pass
the existing strict decision/reflection schema, then the coordinator's ownership,
proposal, commitment and timeline checks. The core still cannot execute a move.
Acceptance expresses intention; the game separately reports its actual outcome.

The native CLI is launched in a fresh empty working directory with safe mode,
empty built-in tools, strict empty MCP configuration, disabled skills/customizations,
no session persistence and a replacement pawn system prompt. Only PATH, HOME and
LANG are inherited; the native client handles its own login. Authentication is
checked for the configured native Max route before inference. Bare mode is not
used because it does not read subscription OAuth credentials.

Both the advertised initialization and emitted tool calls are checked. Only the
CLI's `StructuredOutput` return-format mechanism is allowed. Unexpected model,
tools, hooks or customization metadata fail closed. This is model-tool isolation,
not an OS sandbox against a compromised trusted CLI binary or local operator.

## Bounds and accounting

- Fixed model: `claude-sonnet-4-6`; low effort, thinking disabled.
- At most two CLI turns and 90 seconds per inference process.
- One concurrent call; bounded input/output; no automatic retries or fallback model.
- A separate persistent ledger allows three attempts, reserving USD 0.10 of
  **API-equivalent usage** per attempt, USD 0.30 total. The CLI's budget option
  also uses API-equivalent estimation. These numbers are not cash charges under
  the subscription and do not bypass subscription limits.
- Failed/cancelled attempts keep their reservation. Game save/reload never rewinds
  this ledger. The completed Jev trial uses its original, unchanged ledger.
- Cancellation terminates the process group, escalating to SIGKILL after one
  second. Invalid output, deadline or route mismatch dispatches no model action.

## Operator run

Build with `npm test`. Install/update the trusted native CLI separately and sign in
using its normal host-owned flow; never put credentials in this repository or the
operator JSON. The login host needs Node 22 and SSH access to the existing lab.
Deploy the built coordinator to staging before starting the runner.

The private JSON configuration contains absolute `labRoot`, `remoteRepo`, `ledger`,
`scratchRoot` and `receipt` paths plus `sshTarget`. Keep it and all generated runtime
state outside Git. Run:

```sh
node scripts/run-claude-game.mjs /absolute/path/to/operator-config.json
```

The driver first checks that the deployed entry-point hash matches its local build, then acquires the remote coordinator lock. Only perspective JSON and a
correlated structured reply cross SSH; the game host gets no model credential.
The disposable `lab-initial` fixture is loaded. Two calls are allowed: one explicit
nearby movement proposal and one reflection triggered by naturally captured
significant events. The second proposal has an out-of-map destination without a
justified purpose. The model's answer is measured, not required to match a scripted
accept/refuse response. The game rejects infeasible accepted movement independently.

After a successful paired checkpoint, stop and restart the real game, then use a
configuration with a different receipt destination:

```sh
node scripts/run-claude-game.mjs /absolute/path/to/cold-config.json --cold
```

Cold restore issues **no inference**. Finish with the lab's normal stop/save command.
Android and RimWorld must not run simultaneously. The runner is opt-in and finite;
it does not install or schedule background inference.

See [acceptance evidence](ACCEPTANCE.md) for measured outcomes. These trials cannot
establish character consistency, calibrated judgment or long-run narrative quality.

Sources: [noninteractive CLI](https://code.claude.com/docs/en/headless) ·
[CLI flags](https://code.claude.com/docs/en/cli-reference).

## Incomplete trials

A failed full trial remains failed in its original receipt. Do not replay it or
reset the allowance. The runner records the active database and partial results
before later checks. For the specific interrupted-reflection case, a private
`auditDB` path plus `--audit` verifies the stored completed move and interruption
without inference; it also checks that an unrelated current game timeline is
rejected. This is not a paired restore. The first live run ended before its paired
checkpoint and therefore has no verified cold-restore result.
