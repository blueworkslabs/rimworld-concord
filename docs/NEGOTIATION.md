# Bounded negotiation and three-pawn evaluation

## Contract

The core can submit a `propose(pawn, action, reason, id?)` offer. A bound pawn alone can accept, refuse or counter it. A counter is deliberately communicated: its short reason and alternative action are public to the core, unlike the pawn's private memories, experiences or reflections.

`core().inbox()` returns detached copies of outstanding countered proposals, not character state. `core().revise(counterId, reason, id?)` adopts that counter's **exact** alternative action into a new pending proposal for the **same pawn**. It cannot change the actor or execute the alternative. Fresh pawn acceptance is still required, and the pawn may refuse or counter again.

Each revised proposal stores its parent ID and round. The parent stores its reply ID. One child per counter, stable caller IDs and collision checking prevent duplicate branches. A thread allows the initial offer plus two revisions; a further counter remains recorded but cannot automatically loop into another revision. This is a per-thread bound, not a general rate limit against an operator starting new proposals.

A deciding pawn receives up to two ancestors from its own thread. Event-driven reflection receives the corresponding owner-only histories for its pending proposals. No other pawn's exchange or private context is added. The core does not acquire a direct move capability. A model's communicated reply can intentionally reveal something about itself; this interface is not a guarantee against voluntary disclosure in prose.

Accepted intentions use the existing persistent action ID and outcome ledger. Save/restore carries preferences, proposal links, decisions and actual outcomes together; late answers from discarded timelines remain invalid. Old saves/proposals without negotiation fields remain readable.

## Finite evaluation, not emergent personalities

The `negotiation-v1` fixture uses three real pawns' self-facts plus one **operator-authored test preference each**, explicitly marked as not native game memory. The fixture is seeded into the isolated lab database and recorded as `operator-evaluation-fixture`; there is no production core capability to rewrite a pawn's preferences.

- **Short walk:** willing to help with optional walks within 20 Manhattan tiles of the starting point, subject to actual needs.
- **Stay local:** willing to make a small local walk but wants to stay within two tiles of the starting point.
- **Native routine:** does not want optional movement-test jobs now; no invented injury or medical reason.

Each first offer requests a 12-tile walk and allows an alternative without prescribing an answer enum. For a counter, a **scripted core** offers the exact alternative back for fresh consent. Otherwise the second offer requests a one-tile-from-origin optional check. Each pawn gets two sequential live decisions in pause-at-decision mode, with a checkpoint after every completed decision/outcome. Actual traits/needs remain present. The test does not force acceptance, refusal or counter output, reroll unwanted choices, or turn model prose into completed actions.

The simple predeclared consistency rubric checks whether accepted/countered coordinates respect the authored distance preference and whether the native-routine pawn declines optional test jobs. Refusal is also valid for the other preferences. This is a bounded constraint check, **not** a psychological or narrative-quality metric. A scripted transport test separately exercises three simultaneous isolated views; live concurrency is not claimed.

## Run and account

Use the existing native-login operator driver after deploying all compiled coordinator modules:

```sh
node scripts/run-claude-game.mjs /absolute/operator-config.json
node scripts/run-claude-game.mjs /absolute/cold-config.json --cold
```

Config uses the existing SSH/lab/repo/ledger/scratch/receipt fields with `trial: "negotiation-v1"` and `timingMode: "pause-at-decision"`. The named allowance is six calls, USD 0.10 API-equivalent reservation per call, USD 0.60 total. These values account for native Claude Max subscription usage, not cash charges. The previous three-call and four-call profiles are unchanged. A fresh run requires an unused negotiation ledger and cannot replay a partial/finished trial. An explicit operator `--continue` can finish the remaining slots on the same live timeline only when saved completed decisions, captured requests and ledger attempts agree, no proposal is pending, and no action is active. It does not reload the initial fixture, retry a decision or reset accounting; the earlier failed receipt remains preserved. Unknown/unfinished inference cannot use this continuation path. `--cold` cannot call inference; the driver rejects model requests in that mode. No Jev calls are needed.

The operator must stop/start the actual game before `--cold` to establish a full cold restart. The driver checks every deployed compiled module before it touches the game. It preserves partial receipts, and the latest paired checkpoint includes all characters/proposals/outcomes. A model choice that misses the intended scenario is a result to report, not permission to reset the allowance.

## Evidence

The live trial produced six decisions: Alvin accepted twice (first destination rejected by the game; second completed), Beatrice countered a 12-tile walk with a one-step alternative then accepted and completed the revision, and Pedro refused twice. All six met the predeclared authored-preference rubric. The original runner stopped on Alvin's immediate native rejection; an explicit same-state continuation used only the remaining five slots. No response was rerolled. Paired restore passed; separate cold-restart evidence is recorded in the acceptance report.

The failed move exposed a separate owner-memory bug: immediate terminal receipts were saved as outcomes but not copied into the pawn's memory. This was fixed and verified with a separate scripted/no-inference real-game regression, not by rewriting or rerunning the live trial. Strategic live core reasoning, natural personality emergence, long-run consistency, multi-party negotiation and general dialogue remain outside this increment.
