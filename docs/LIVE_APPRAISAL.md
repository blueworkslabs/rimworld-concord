# Bounded live appraisal lab

The operator runner connects the existing attention consumer to Jev's System One
API. It is **not** a production daemon or a live deliberative agent. Jev scores
whether a pawn's own event batch warrants reflection. Scores below `0.5` retain
native behavior; scores at or above it invoke a **scripted** continuation. The
threshold is not calibrated. This acceptance runner creates no proposals or jobs.

## Split-host operation

The disposable game and `LabBridge` run on the lab host. An operator process on
the protected Gateway host launches the runner through SSH and exchanges bounded
JSON lines over stdin/stdout. Only pawn views, cancellation IDs, scores and test
receipts cross that channel. The SSH child receives only `PATH`, `HOME` and `LANG`
from its parent environment; model credentials and proxy settings are not forwarded.

The Gateway-side `protectedJevTransport` requires an injected opaque credential,
proxy and CA environment, and a Node version supporting `NODE_USE_ENV_PROXY`
(verified on Node 22.23.2). Its destination is fixed to OpenRouter System One,
redirects are refused, response size is bounded and errors omit raw transport
details. There is no plaintext fallback. OpenClaw's protected store entry must be
bound to `openrouter.ai`, and its egress proxy must already be enabled. The runner
does not configure or restart the Gateway.

## Run explicitly

Build with `npm test` and deploy matching `dist/` to the lab host. Start the game
with the [lab tools](../scripts/lab/README.md). Prepare a private operator JSON
file outside Git, containing only configuration paths, not credential values:

```json
{
  "sshTarget": "lab-user@lab-host",
  "labRoot": "/absolute/isolated-lab",
  "remoteRepo": "/absolute/concord",
  "ledger": "/absolute/private/trial-budget.sqlite",
  "receipt": "/absolute/private/jev-game-result.json"
}
```

Revalidate provider pricing before paid runs. In Gateway-host protected exec:

```sh
node scripts/run-jev-game.mjs /absolute/private/operator-config.json
```

The driver opens the **existing** non-rewindable trial ledger. Default limits are
three attempts and USD `0.02` total reserved, with USD `0.002` permanently reserved
per attempt, even after failure. A provider receipt above a reservation locks
subsequent calls. This is conservative accounting, not a provider-enforced maximum
charge. The two-appraisal game run refuses to start if fewer than two calls remain.
Never replace the ledger to retry or expand the allowance. The initial synthetic
call plus this run use all three attempts. No automatic model retries occur.

The remote runner holds the exclusive coordinator lock, loads `lab-initial`,
waits for natural events and permits two appraisal requests with one pending at a
time. Game observation continues during network waits. It verifies actual routing,
native tick progress, no dispatched Concord jobs and paired save restoration.
Model unavailability or interrupted requests fail the acceptance check and leave
native behavior as the fallback. Inputs from this SSH peer are trusted lab data,
not an interface for untrusted remote clients.

After stopping and restarting the game, use a different receipt path and run:

```sh
node scripts/run-jev-game.mjs /absolute/private/operator-config.json --cold
```

Cold mode makes **no model calls**. It restores the prior paired checkpoint into a
new game/coordinator process and compares character state. The host ledger is never
part of the game save. Stop/save the lab at handoff, including after failure.

## What this establishes

Passing evidence establishes the provider connection, integration with captured
game events, native ticking during appraisal, bounded accounting and saved-state
continuity. It does **not** establish appraisal quality, stable latency, an optimal
reflection threshold, LLM negotiation, autonomous planning or unattended operation.
An appraisal score is not a probability that the decision is correct.
