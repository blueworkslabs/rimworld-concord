# A campfire and a meal — bounded milestone

## Design

A shared need may become a proposal, separately accepted construction, separately
accepted cooking, and a visible result. No speaker, refusal, interruption or
successful fire is required in a live run. Raw berries may be eaten without
cooking. Silence and an unfinished plan are retained outcomes. Pedro has the same
available decision routes as Alvin and Beatrice; existing skills and traits are
not changed to manufacture disagreement.

The disposable fixture has no ready meals or stove, existing wood and three raw
berry stacks. Food starts at 0.40 / 0.65 / 0.55 for Alvin / Beatrice / Pedro;
Rest is 0.90. These are authored conditions, not natural character development.
Ordinary work priorities remain disabled; native self-care continues. The core
may ask each pawn one optional question (three total), never repeated pressure.

## Capabilities

- **Build:** one nearby legal campfire site and one observed stack providing its
  20 wood. Fresh acceptance creates the blueprint. Native carrying and frame
  construction follow; native skill gain and construction failure remain.
  Unfinished blueprint/frame stays forbidden to ordinary work scanners, including
  after withdrawal. Materials and partial work are not silently refunded or
  completed. Resume/deconstruction is outside this first capability.
- **Cook:** one existing usable campfire and exact observed raw-food stack.
  Native simple-meal recipe, up to three meals, at most 7,200 ticks total.
  Each meal is one scoped native bill/job, restricted to the accepting pawn;
  ordinary work scanning cannot start that bill. No opportunistic ingredients,
  alternate station or extra batch. Product receipt is not an eating receipt.
- Both stop for withdrawal, failed native work, low needs, unavailability or
  deadline. No automatic retry. Planning holds cover shared supplies/sites;
  native reservations and checks remain authoritative at execution.
- Paired checkpoints remain quiescent: after construction, between meals or after
  withdrawal. This milestone does not add mid-job paired checkpoint support.

## Shared status and presentation

Food/Rest only, source `shared-link-telemetry`, observed tick and freshness.
Bands: urgent below 0.20, low below 0.50, otherwise satisfied; unavailable or
invalid values unknown. Older than 120 ticks or wrong timeline is unknown.
No exact meters, mood, private memories, interpretations or diagnosis go through
this link. Pawn peers, core and crew board receive the same projection.
Band changes can wake the bounded core; timestamp refreshes cannot. Bands never
reopen a deferral or authorize work. The board shows actual outstanding replies
and work, not a fabricated next plot beat.

## Verification and live protocol

Scripted positive mechanics use a separately labelled copy with all three Food
meters at 0.90, reducing self-care competition during exact resource checks.
The corrected v2 fixture gives inserted berries their native 60 hit points; v1
omitted health and is retained as invalid evidence. Earlier disappearing berries
were not established to be self-care. Cooking must consume ten berries per meal,
verified independently from product counts.
The live fixture retains the hunger values above. Native ingredient conflicts
remain recorded negative cases, not rerolled live results.

First verify scripted refusal/counter/fresh acceptance, native resource use and
product creation, withdrawal, independent consent for cooking, paired restore
between meals, and cold restore. Then independent review of the final behavior.

After those gates, three predeclared live runs from the same fixture, in order:
1. Pause-at-decision, ten minutes of native observation.
2. Pause-at-decision, ten minutes of native observation.
3. Continuous, ten minutes including inference latency.

Each has a separate immutable allowance: **eight core attempts, twelve pawn
attempts, zero Jev calls**, and a 25-minute wall-clock ceiling. No retries or
rerolls; unused allowance stays unused. The scheduler uses a 60-tick cooldown
and a 36,000-tick window. Record all failures and unfinished outcomes. Different
modes are not a controlled causal comparison; three runs cannot establish a
branch distribution or general reliability.

Capture player-facing artifacts before the explanatory diary. Offer the human
an unannotated log for a short retelling; keep diagnostics separate until after
that read. Measure whether the situation is understandable, not whether it
matches a ten-minute scripted beat sheet.

## Verified mechanics

[Scripted evidence](evidence/campfire-scripted.json): 289 Node and ten Python
checks, compilation against the installed game assemblies, final independent
review, native execution and cold restore passed. One campfire used twenty wood;
two separately consented meals used twenty berries. A smaller counter required
fresh acceptance. Refusal created no job; withdrawal left unfinished work
incomplete and removed the scoped cooking bill. Save/restore between meals and
full restart preserved the verified outcomes.

An early custom cooking driver produced a meal without consuming ingredients:
native placement tracking is keyed to specific job definitions. The corrected
driver records placement, rejects missing ingredients before finishing, and
confirms both consumption and product creation. The incorrect early result is
not counted as successful cooking.

The frozen live protocol is a separate behavioral experiment. Its outcomes and
explanatory diary are withheld until the preselected player-artifact read.
Scripted success alone does not establish model planning or character quality.
