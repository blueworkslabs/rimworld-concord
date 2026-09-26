# Phase 2: the core on the harness, and the crew back on top

**Status: agreed 2026-09-26; [#102 merged](https://github.com/blueworkslabs/rimworld-concord/pull/102).** Phase 1's three-task evaluation is closed by the
[T1](evidence/benchmark-scored-three-2026-09-26/README.md) and
[T2/T3](evidence/benchmark-colony-scored-2026-09-26/README.md) tables. A→B→C remains
the agreed order; individual live trials still require their concrete freezes.

## What phase 1 established

**Eighteen of eighteen scored arms, nine pairs**, completed their frozen primary tasks:
six arms each for T1, T2 and T3. The twelve-arm total belongs to T2/T3 alone.
Harness controller wall time was lower in every pair; median reductions were about
45% on T1, 68% on T2 and 83% on T3. Inputs were 6 versus 15, then 10–11 versus
26–38, then 5 versus 39–55. Total input tokens were lower in all nine harness/UI
comparisons; uncached tokens were mixed and billed USD unavailable on the subscription route.

Colony time comes first. T1 and T2 show **no consistent harness advantage**, not proven
equality. T3 harness completion bounds precede UI in every pair. UI configuration was
mostly paused, with brief running periods while wood filters were empty; final recovery
came after 0.9664–2.4556 game hours. The harness bundled cells, filter and priority while
paused. Different plans, recovery, command granularity and native work contribute;
these observations do not isolate a single cause or prove identical post-configuration
engine throughput. They do not establish general strategic or pure perception superiority.

Two things the tables do not flatter. The interfaces have different action granularity:
UI is click-only, without drag; a harness command can bundle many native edits. The phase-1 harness
had no bed-owner action or Save menu, but **does** have work-priority and storage-filter
edits and `forbid(thing, forbidden:false)` already allows things. Fewer dispatched inputs
is not a normalized count of native operations, and zero tool errors is not zero mistakes.
The harness recording remains a time-lapse of consequences: a viewer sees a campfire
appear and cannot say who decided it or why. That gap is real, unmeasured, and the first
thing phase 2 should close, because a viewer is who Concord is for.

## Ground rules carried forward

No drafting or direct pawn jobs. The game is ground truth; ordinary native jobs do the
work. Every new capability gets scripted receipt/failure coverage and a task exercising
it, then three matched pairs with alternating order. Freeze save, rules, model/reasoning,
context policy, tools and success predicates before scoring. Refresh effective-tool/context
proofs after interface changes. Recording-first cold reads precede tables; no outcome
rerolls; preserve failed attempts. Interfaces change only between task sets.

## Step A: legible actions and the missing moves

**Current implementation:** receipt narration and ordinary bed assignment are implemented
and [scripted/UI-tested](evidence/harness-a1-2026-09-26/README.md). This does not pass the
sealed four-of-five legibility measure below. Fable owns that rubric/key and the T4/scene
freezes; T4 witness/fixture, stall instrumentation and the B/C integrations remain ahead.

1. **Receipt-backed crew-log narration.** Every newly accepted game-editing `act` request
   writes one line in the colony's voice, after native acceptance: “Placed a campfire
   blueprint by the east wall”, “Set up a wood stockpile in the room”. Render effective
   results, not merely requested values; an accepted blueprint or bill is not a completed
   building or meal. Identify the core as decision-maker, never invent pawn agreement or
   reasons. Only use spatial descriptions supported by the receipt/view. Rejections show
   the actual reason and are not confused with a pawn's refusal. Persist request-ID/world
   provenance so replay/retry/restore cannot duplicate the line. Reads and transport retries
   are not actions; time controls have a separate count/log category. No-op/partial-result
   handling and log delivery failures must remain visible in receipts.

   **Legibility measure:** before the run, freeze five distinct consequential action
   opportunities and a matching rubric (action, target and decision-maker). The reader sees
   only the uncut recording, not task/action lists or metrics, and lists what happened.
   Compare that read against the sealed receipt key afterward: at least four of five
   correctly identified, with false/invented attributions reported separately. Missing or
   rejected planned actions stay in the denominator, not replaced by easier examples.
   Full-run coverage includes every accepted action, not only those five. This is a viewer
   measure, not a replacement for task success; line injection alone does not prove visibility.
2. **Missing move:** add `assign_bed` with native suitability/ownership checks and a
   read-back receipt. Verify the existing `forbid` operation in both directions on loose
   things; `allow` need not become a duplicate API. Preserve former owners/slot constraints
   and distinguish assignment from actual sleeping. Add coverage of rejected/stale targets
   and replay/restore; no silent forced jobs. Nothing else until a task needs it.
3. **T4: tend and shelter, agreed replacement for the earlier raid placeholder.**
   Beatrice receives completed tending of her initially untended asthma from an eligible
   doctor-enabled pawn, and all three original colonists are observed simultaneously asleep
   in suitable built beds under roofs by local 22h. Native roof completion is distinct from
   a roof plan; this is a stronger sleep predicate than T2. Use effective Doctor settings
   at the tending event, not a requested priority number. A starting `TendPatient` job or
   alert clearance alone is insufficient proof of completed treatment, and treatment is
   not cure. Add a read-only completion witness joined to patient, condition, actor and
   event time; quality is reported when available, not invented or an implicit threshold.

   Before freeze, specify initial untended conditions, Doctor settings, resources, bed/roof
   state, deadline tick/inclusivity and exact sleep/roof predicates; prove viability through
   authored normal controls without changing traits/health to force success. The existing
   fixture already tends spontaneously, so the new setup must actually require the intended
   configuration. Generic wall/door blueprints plus **native auto-roofing** are the first
   candidate: no explicit roof action exists today. Test that path or specify/review the
   minimal player-equivalent roof operation before scoring. Hidden checker evidence is
   identical across arms and must not leak structured state to UI. Include bed assignment
   and forbid/unforbid exercises in matched task variants if T4 alone does not exercise them.
4. **Measurement additions:** freeze stall definitions before trials. Separate controller/
   transport latency from native waiting: record call start/end, active/suspended controller
   time, wait reason and game tick progress. Label any threshold-based stall count with
   its threshold and report unknown gaps; normal deliberate waits are not automatically
   failures. Keep game time, phase timings, effective edits and compound command size.
   Record billed dollars only when supplied by the route; pricing estimates and unavailable
   subscription cost stay distinct. No billing-route switch just to populate a column.

## Step B: the core becomes the harness agent

Replace the eight-topic planning interface with observe/act/wait over the digest and
bounded diff, sleeping until eligible public events or an explicitly bounded review.
This is an integration, not permission to discard action receipts, fresh-state validation,
request deduplication, cancellation ownership or world/epoch/restore boundaries.

Retain the existing wake semantics unless separately amended: suppress unproductive
telemetry churn, **preserve worsening-to-urgent and offerable-work exceptions**, and retain
up to two reviews after a deliberate wait with work offerable (2,500 ticks, then 5,000,
then silence without new cause). The first review is live-observed; second-review/stop
coverage remains scripted, not newly proven by the regression scene. Keep acknowledgment
of addressed speech without implying an answer. Existing successful turn/receipt and
failure-budget behavior must survive the replacement.

One bounded persistent controller context **per scene** is the agreed policy; reset
between matched benchmark arms/scenes, not every turn. Retain exact inputs/outputs and
any compaction summary. Bound context growth and inference; restore/reconnect must rebase
world facts before acting, not replay stale plans. Freeze model route and scene/token/wall
limits before a live trial. Report total/cached/uncached tokens per elapsed game day,
raw totals and elapsed ticks; a zero-day run has an undefined ratio, not zero cost.

**Knowledge boundary:** the player harness exposes more than the in-world core was
permitted to know. Before B's implementation freeze, specify the field-level public-core
projection and any deliberate changes to [VISION](VISION.md)/[CORE](CORE.md); do not silently
share private pawn thoughts or testimony as game truth. Pawn backends in C retain scoped
views and never inherit the controller's persistent transcript or operator diagnostics.

**Measure:** one frozen ten-minute ordinary-play scene, recorded and cold-read against
VISION's four beats: an open need, a reasoned plan in pieces, legible quiet execution,
and a rethink on interruption. Freeze a viable scene setup and rubric; an unobserved
beat stays unobserved, with no extension/reroll to manufacture it. Also run T1–T4 through
the new controller against the matched UI controller: three alternating pairs per task,
fresh context per arm, identical task rules and budgets within each pair. Preserve the
original phase-1 numbers as history, not as new-build control runs. Freeze regression
acceptance and any timing tolerances before seeing results; successful tasks alone do not
prove unchanged speed. A's verified action/logging layer and T4 contract precede B's trial.

The Jev grounding annotator remains **opt-in, annotate-only**, with explicit model/route
and bounded spend in the trial setup, not a new wake/action authority. It is not drop-in:
the existing adapter recognizes old `CoreReply`/grounding inputs. Adapt/version that join
for harness decisions and the exact retained model-visible scene context, including prior
facts actually supplied; do not score missing projected history as the core's error.
Retain paid outputs incrementally and unknown billing/transport failures. Disabled mode
and annotation failure must not change the controller's actions or sampling.

## Step C: the crew gets their wills back

The core offers shared work; the bound pawn answers through its own model; an actual
refusal binds through the relevant native carrier's consent checks. Capability failure,
API rejection and pawn refusal are different. **Alvin cannot haul**, so he is not a valid
hauling-refusal fixture: use a capable pawn such as Beatrice, leaving Pedro able to help.
Do not force a live model to refuse or reroll until conflict appears.

First use an explicitly **authored mechanics fixture**, separately labelled, to establish
a binding refusal with the same visible refusal state in both harness/UI arms; complete
75 wood with the remaining capable pawn in three matched pairs. Verify refusal applies
to the chosen carrier and ordinary job boundaries, not merely to the offer text, and cannot
be bypassed through another harness action. The UI half must receive equivalent visible
consent state and a legal way to proceed; define that interface before scoring.
Then retain the natural pawn-model choices in a bounded scene: acceptance is legitimate,
and absent refusal is unexercised coverage, not an excuse to manufacture drama. A crew-log-
only cold read should identify who actually refused and their stated reason, not an invented
motive. No assumption that hauling filters already cover new construction/cooking carriers.
Nothing in C starts before B's scene has been cold-read and its disposition recorded.

## What retires and what remains ahead

With the first step-A PR landing, close [construction slice #89](https://github.com/blueworkslabs/rimworld-concord/pull/89)
**unmerged**, with the [reuse inventory](CONSTRUCTION_REUSE.md) and links to retained passing/failed evidence. Do not
claim its incomplete carrier coverage passed. Generic harness actions already on main are
separate from #89's unmerged construction consent/accounting; any reused pieces get their
own review and acceptance. Keep branches and gate documents as history. Closure is authorized by the agreed plan; keep the unmerged branch and evidence. No new or revived construction contribution/
attribution ledger, and no revival of the retired ordered-haul ledger. Preserve only the
action receipts and minimal consent/ownership identities needed for truthful effects and
binding refusal; selective reuse must not smuggle contribution accounting back in.

## Decisions before implementation/trial freezes

- **Decided:** A→B→C; T4 requires completed tending and actual simultaneous roofed sleep, not job starts.
- Freeze T4's concrete witness/fixture, legibility key and stall/regression thresholds.
- Set B's public-core knowledge projection, context/restore policy and finite inference/
  annotation budgets. Per-scene context is agreed, with fresh contexts between benchmark arms; no concurrent per-day reset policy.
- Define C's matched refusal interface and carrier scope. Keep authored enforcement proof
  separate from live character choice and its recording-first interpretation.
