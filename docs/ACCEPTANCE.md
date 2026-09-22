# Foundation acceptance — 2026-09-21

## Environment and scope

Real RimWorld 1.6.4871 with Biotech and Odyssey on the existing shared Linux staging VM, Intel-accelerated virtual graphics, isolated lab profile. Three-pawn 150×150 fixture. All decisions below are scripted; no live model or paid inference was invoked.

The game bridge compiles against the installed game's actual assemblies using Mono. TypeScript coordinator runs on Node 22.23.2 with SQLite.

## Results

- 33 local automated checks pass, including the 21 foundation/awareness checks and 12 attention-consumer checks described below.
- Real game: refusal produces no job; a forged core actor is rejected by the game bridge.
- Real game: accepted Goto job moves Alvin (`Thing_Human405`) from (82,80) to (90,80), with `completed` receipt and observed destination.
- Identical action replay does not grow the execution ledger; changed payload with the same ID is rejected.
- Native ticks advance during a 4.5-second delayed decision, while `activity()` reports deliberating. The blue ellipsis badge above Beatrice was visually verified in a real-game screenshot.
- A timed-out backend leaves its proposal pending, without imposing a new pawn job.
- An out-of-map destination yields `failed` and releases the commitment.
- Paired checkpoint restore removes future memories/proposals, cancels in-flight decisions, rejects old epochs and leaves the game paused.
- Fresh game/coordinator process restore is checked separately for pawn identities, character memories, a fresh epoch and paused state.

Raw compact receipts are under [evidence](evidence/). Local generated SQLite databases, paired game saves and the screenshot remain private runtime artifacts, outside Git. The original lab baseline's approximately 60 TPS measurement is not a new performance benchmark for a full agent colony.

## Boundaries

Native interruption and lost-response behavior are covered with controlled coordinator tests; no combat, injury or network fault was deliberately induced in the real-game trial. Core authority is enforced by the model-facing handles and trusted dispatch; this is not protection against arbitrary hostile code running as the lab OS user. The bridge actor field is supplied by the trusted coordinator, never by model output.

No live inference was used in the original foundation real-game acceptance runs. No whole-map perception filter, narrative quality, gravship travel, structure planning, full colony economy or OpenClaw plugin is claimed. The Jev adapter uses mocked responses in tests; a separate protected synthetic call later verified live transport and response parsing, not judgment quality. The later bounded live-game trial is described below. Checkpoints are quiescent only. A supported production daemon/installer, unattended quotas, long-run retention and upgrade migrations remain future work.

## Public baseline configuration check

The real-game and cold-restore receipts were regenerated after replacing deployment-specific paths and host checks with explicit environment/profile configuration. Both C# mods were rebuilt against the owned local game assemblies. No live inference or private account configuration is included.

## Pawn-awareness increment

- Native self facts populate the perspective; selected native job changes are captured and routed into the owning pawn's experiences.
- Per-pawn privacy, deduplication, ring-gap reporting, saved cursor rollback and stale appraisal rejection have automated coverage.
- Thinking badges have bounded lifetimes, identity/epoch-scoped cleanup and continue-live simulation; the real-game screenshot was visually inspected.
- Real-game paired restore and a full process restart preserve the new character experience records as well as existing memories.
- Jev question/response validation and the independent conservative trial ledger have mocked tests for invalid answers, cancellation, uncertain charges, reopen and pricing overrun. One protected synthetic live call is recorded in [evidence/jev-live.json](evidence/jev-live.json); subsequent real-game appraisal evidence is described below.
- Native memory acquisition, health changes and badge expiry after a process crash are implemented but not deliberately induced in this real-game trial. See [awareness limits](AWARENESS.md).

## Bounded attention consumer

- Twelve additional automated cases cover coalescing, routine/model separation,
  significant-event bypass, cooldowns, per-pawn proposal scope, response validation,
  cancellation on newer significant events, fresh-state revalidation, uncooperative
  backend timeout/stop, shared decision slots, crash-boundary claim recovery,
  checkpoint rollback, limited concurrent/total turns and reported attention gaps.
- Final real-game [attention trial](evidence/attention-loop.json) captured native
  food/job events. Five bounded scheduling turns included three scripted appraisals
  and three scripted reflections. A pawn's event-triggered acceptance completed a
  real native Goto; another pawn's refusal produced no job.
- Operator samples recorded 253 advancing simulation ticks during active thoughts.
  This is evidence of continued simulation, not a new TPS/latency benchmark.
- Reopening the coordinator preserved consumption receipts without replay. Paired
  restore rolled back subsequent memories and retained saved attention/reflections.
- A [cold attention restore](evidence/attention-cold.json) passed after restarting
  the actual game and coordinator. The original game-loop and cold-restore suites
  also passed again after sharing decision dispatch with the attention path.
- No model judgment quality, induced injury/urgent-interruption scenario, or long
  autonomous run is claimed. Significant-event supersession is covered by controlled
  automated tests; final real-game evidence exercises food/job events. All game-side
  inference in these trials was scripted. No mod assembly changes were required.
- The lab and display were stopped cleanly after verification. Those original trials used scripted backends;
  subsequent live-appraisal evidence is described below.


## Bounded live Jev appraisal

- [Synthetic receipt](evidence/jev-live.json): one protected call verified provider access.
- [Real-game receipt](evidence/jev-game.json): the same adapter then appraised two
  naturally captured event batches from one pawn. Food scored 0.23 and mood 0.21;
  both selected native continuation at the existing 0.5 threshold. The two calls
  took 704ms and 362ms; these are individual measurements, not latency guarantees.
- The colony advanced 37 sampled ticks during actual pending appraisal. The runner
  created no proposals and dispatched no Concord jobs. Four other reflections
  bypassed appraisal and used scripted continuation. **No live deliberative model.**
- Relay checks cover correlation, malformed scores, late replies, cancellation,
  disconnect, concurrency and remote-error filtering. 36 automated checks pass.
- Paid-call accounting remains outside game saves: three total attempts, USD 0.006
  conservatively reserved, USD 0.000133266 reported, with the three-call cap reached.
  No retries, cap increases or new ledger were used.
- [Cold restart](evidence/jev-game-cold.json) preserves the appraised character state
  in a new game/coordinator process. The external ledger is unchanged and no model
  call occurs during restore. The lab is stopped cleanly after verification.
- This proves integration, not judgment quality, action choice or unattended operation.
  See the [operator guide](LIVE_APPRAISAL.md).

## First native-client live deliberation — mixed result

- [Synthetic decision](evidence/claude-live.json) verified native Claude Code Max
  access, schema validation and tool isolation in 3133ms.
- [Real-game trial](evidence/claude-game.json): `claude-sonnet-4-6` accepted Alvin's
  nearby waypoint request in 3448ms. The actual movement completed at (90,80),
  separately recorded by the game rather than inferred from his answer.
- The next naturally triggered reflection was interrupted by a newer Chitchat
  memory (tick 729, after the attempt began at tick 506). No response was applied,
  no second action was dispatched, and the infeasible second proposal stayed pending.
  The full two-call acceptance suite therefore **did not pass**. Continued ticking
  is evidenced by the native event sequence, not a retained sampled TPS measurement.
- [No-inference audit](evidence/claude-game-audit.json) reopens the original SQLite
  evidence and confirms the completed action, interrupted attention, pending proposal
  and newer eligible experience. The game had been reset during a recovery attempt
  against an older deployed runner; the coordinator rejected the mismatched epoch.
  The operator driver now checks its deployed entry-point hash before touching the
  game. **Paired/cold restore of this live trial was not completed.** Prior scripted
  restore evidence does not fill that gap.
- 44 automated checks cover the existing mechanics plus native-client route/tool
  checks, strict output, cancellation of a SIGTERM-resistant subprocess, relay
  correlation, decimal reservation rounding and rejection of stale deployed runners.
- Three subscription attempts are reserved permanently (USD 0.30 API-equivalent).
  The two successful completions reported USD 0.021867 API-equivalent estimated
  usage, not cash charges. Cancelled-call usage is unknown; its full reservation
  remains. No extra calls, retries, new allowance or Jev ledger changes followed.
- The routing limitation is concrete: every new memory is currently significant,
  so repeated mundane conversation can starve reflection. Urgent supersession must
  remain, but ordinary conversation needs a better policy before a longer trial.
- This proves one bounded live proposal decision and real action, plus live
  cancellation—not completed live event-driven reflection, character quality or
  unattended operation. See the [operator guide](LIVE_DELIBERATION.md).


## Thought reliability: completed paused and continuous trials

These follow-up results do not rewrite the earlier mixed-result trial.

- [Game-owned pause checks](evidence/decision-pause.json) passed with actual owned
  overlapping claims, stable ticks, wrong-owner release rejection, manual-speed
  pause preservation (set through lab controls), wall-clock orphan expiry and
  old-epoch rejection after load. The pause notice was visually inspected. This
  test uses scripted claims, not two live model thoughts.
- [Paused live trial](evidence/reliability-paused.json): Alvin accepted the nearby
  move in 3253ms and completed it. A naturally acquired event later triggered a
  4179ms live reflection refusing the unsupported waypoint. Across 33 samples with
  game pause claims active, tick delta was zero. Paired restore preserved decisions,
  outcomes and reflection. [Full cold restore](evidence/reliability-paused-cold.json)
  then passed with one saved reflection, three character records and no stale pause.
- [Continuous live trial](evidence/reliability-continuous.json): explicit acceptance
  took 3622ms and the move completed; a 6183ms event-triggered reflection refused the
  unsupported waypoint. The runner sampled 617 advancing ticks during active
  deliberation slots and zero decision pause claims. Paired restore and a separate
  [cold restore](evidence/reliability-continuous-cold.json) passed. Checkpoint/save
  operations intentionally pause; “continuous” refers to inference, not checkpointing.
- The two modes ran fresh copies of the same fixture and proposal pattern, but
  native events and views differed. This is an integration comparison, not a
  controlled judgment-quality experiment or a general performance benchmark.
- Stage checkpoints are persisted immediately after explicit decisions and after
  completed reflection. Compiled-module hashes are compared before a runner can
  touch the game. Earlier evidence remains intact; no historical failed receipt was
  changed to a passing result.
- 51 automated checks pass, covering background-memory queue/coalescing/cooldown,
  urgent priority, legacy records, explicit-decision invalidation, overlapping pause
  claims, timeout/error cleanup, rejected pause acquisition and fixed ledger policy.
  The mod was rebuilt against the privately owned installed game assemblies.
- All four new Claude subscription attempts succeeded: USD 0.40 API-equivalent
  reserved, USD 0.06234 estimated usage reported (not cash charges). Restore used
  no inference. Prior Claude and Jev ledger hashes were unchanged. The new allowance
  is exhausted, and game/display services were stopped cleanly.
- Still not proved: general contextual significance, combat-time live judgment,
  three simultaneous live characters, counterproposal negotiation, long-run pacing,
  calibrated model judgment or narrative/personality consistency. The Chitchat
  exception is a narrow policy fix, not a complete attention model.


## Three-pawn negotiation — 2026-09-21

- [Live receipt](evidence/negotiation-live.json): six sequential paused native-Claude decisions, with real self-facts and **operator-authored test preferences**, not emergent personalities. First requested walk was 12 tiles; follow-ups adopted counters or requested a one-tile-from-origin check. The core was scripted.
- Alvin accepted twice: the first target was rejected by the game as unavailable/unsafe; the second move completed. The initial runner stopped on an overly strict completion assertion after one call. Its failed receipt was retained, and an explicit continuation used only the remaining five calls on the same state/ledger. No replay or reroll.
- Beatrice countered with `(75,79)` instead of the distant target; the core offered that exact alternative back. She freshly accepted and the native job completed. Pedro refused twice and received no Concord job.
- Six of six decisions respected the predeclared authored-distance/routine rubric. This does not test natural personality emergence, narrative quality, live strategic core reasoning or sustained/concurrent live operation.
- Paired save/reload and [full cold game/coordinator restart](evidence/negotiation-cold.json) preserved all three characters, six decisions, one revised thread and all action outcomes. Cold restore made zero inference calls; discarded futures remain rejected.
- [Separate no-inference real-game regression](evidence/negotiation-immediate-outcome.json): an immediately failed dispatch is remembered exactly once by its owner, not other pawns. The correction was applied after the live decisions; their original prompts/evidence were not rewritten.
- 58 automated checks pass, including three concurrent isolated scripted views, fresh consent/refusal of revisions, round/idempotency limits, private inbox/history, attention-driven revised decisions, restored lineage, partial-run continuation guards and immediate failure memory. No C# changes in this increment.
- Six-call allowance exhausted: USD 0.60 API-equivalent reserved, USD 0.087609 estimated subscription usage; not cash charges. All three earlier trial ledger hashes remained identical. No Jev calls. Staging stopped cleanly.
- See [contract, fixture and runner](NEGOTIATION.md). Remaining gap highlighted by the failed move: models need grounded available-action information, not just coordinates and authoritative rejection after acceptance.


## Correctness regressions — 2026-09-21

- [Verification receipt](evidence/correctness-regressions.json): 64 automated checks pass; mod compiled against the installed game assemblies. No new live inference.
- Unavailable actors receive durable failed action receipts; replay preserves the same receipt and payload collisions remain rejected. The core cannot execute a pawn job. Coordinator regression coverage checks released commitments, owner-only failure memory and continued reconciliation for another pawn.
- Reported usage is accounted independently of answer validity, including malformed answers, CLI error results and unsuccessful exits. Settlement and the overrun lock share one atomic SQLite statement. A child-process exit at the statement boundary preserves the lock; historical partial-overrun rows also fail closed. Scratch ledgers only, with existing trial policies unchanged.
- Reopening the same coordinator while a decision is running is explicitly rejected rather than falsely recording an interruption while allowing the thought to finish. This guards an API misuse pattern, not a newly observed ordinary gameplay failure.
- Scripted real-game refusal, accepted movement, idempotency, simulation-during-thought, timeout and paired restore passed. Full cold restart preserved character state and the unavailable-actor receipt; replay after restore remained idempotent. The unavailable-actor game check uses an operator-synthetic core ID, not a natural pawn-disappearance event.
- Independent Codex review covered implementation commit `c1abe46389d7c46889a7aa18b38a132aa825201c` and found no actionable defects. Raw review reports remain private; subsequent publication metadata contains no further behavioral changes.

## Grounded nearby movement — 2026-09-21

- 67 automated checks pass; native mod compiled against the installed game assemblies.
- [Scripted real-game trial](evidence/movement-game.json): three pawns each returned 12 local options. Queries caused no jobs. An observed counter/revision required fresh consent and completed native movement; another pawn refused a reachable offer without a job. Duplicate action identity and stale-epoch rejection remained enforced.
- The first attempt caught Unity omitting a nested list in serialization. Explicit per-element serialization fixed the output; the rerun above passed. This was a serialization failure, not a failed model decision.
- An operator-modified copy of a disposable save drafted one pawn. It exposed an empty unavailable list and rejected its previously offered coordinate using current native actor checks. The original paired save was untouched and restored afterward. This is a synthetic unavailability fixture, not observed combat behavior.
- Paired restore and [full cold restart](evidence/movement-cold.json) preserved characters, proposals and outcomes, with fresh epoch/tick-stamped options after load. A short polling sample advanced 297 ticks over 5444 ms; this is not a sustained performance benchmark.
- No new live pawn inference, no changes to exhausted trial ledgers; game/display services stopped. Kimi's diary drafting is separate editorial inference.
- [Contract and limits](MOVEMENT.md): at most 12 destinations within Manhattan radius 3, with fog/line-of-sight and native reachability checks. Not exhaustive choices, full perception, reservations or a guarantee of safe arrival. Physical options are deliberately shared with the core without private character state.

## Bounded hauling and standing consent (2026-09-21)

The scripted native fixture relocates existing steel, adds steel-only stockpiles
and disables autonomous work priorities. Actual job-specific drops delivered ten
units to the exact accepted cell; duplicate requests did not create another trip.
Withdrawal between trips prevented further work; active withdrawal interrupted
only the owned job; refusal created no job. Native expiry stopped a trip without
coordinator polling. A cancellation tombstone prevented a delayed dispatch.
A full cold restore between trips preserved the original consent and completed
the remaining two trips without inference. Active-job checkpoints are still not
supported. See [hauling contract](HAULING.md) and the sanitized evidence.

The initial live observation used three autonomous Claude replies, each countering
a two-trip offer with one trip because the observed shortlist only described one.
These were retained, not rerolled. Three Jev appraisals (0.30, 0.30, 0.35) selected
native continuation. The three-minute observation advanced 10,790 ticks and paired
restore passed. This phase produced no haul jobs: a counter is not an acceptance.
The optional exact-counter follow-up uses only the remaining three attempts from
the same six-call ledger; its outcome is reported separately.

All three exact-counter replies were accepted with fresh live consent. Alvin and
Beatrice each delivered ten steel. Pedro's dispatch failed the native availability
check; his proposed cell was the same cell already reserved by Alvin. The failed
trip stopped rather than retrying. Another thirty seconds advanced 1,833 ticks;
paired restore retained the full exchange and mixed outcomes. Multi-trip execution
was established by the scripted test, not by these one-trip live acceptances.

The combined trial used all six Claude attempts, reporting $0.1245645 in native
Max API-equivalent usage estimates (not cash charges). Three of the six permitted
Jev calls were used, reporting $0.000192192. Historical ledgers were not changed.
Routine appraisals did not escalate to live reflection; live mid-job withdrawal
and naturally developed character consistency are not established by this trial.

A subsequent full game/coordinator restart preserved all six live decisions, both
completed deliveries and the rejected trip, with unchanged usage ledgers and no
new inference. The raw review remains private. Review-driven corrections include
serialized provider cleanup after cancellation and actor lookup across loaded
maps when reconciling or cancelling a haul. The real-game fixture is single-map;
this does not claim a multi-map playtest.

## Supply-aware hauling coordination — 2026-09-22

- 84 automated checks pass. New cases cover serialized conflicting offers,
  quantity/capacity and observation freshness, hold release, pending-offer
  withdrawal and late answers, uncertain cancellation, map identity, owner-only
  views and checkpoint/reopen continuity. An injected other-pawn private field
  caused the privacy regression to fail; restoring the implementation passed.
- The mod compiles against the owned installed game assemblies. In the
  [scripted three-pawn game trial](evidence/haul-planning-scripted.json), the core
  offered three distinct steel stacks and storage cells without creating jobs.
  All three accepted first trips delivered exactly ten units. Refusal and
  pending-offer withdrawal released holds without native action. Native dispatch
  rejected a deliberately mismatched map ID.
- Paired restore preserved accepted holds between trips. A full game/coordinator
  [cold restart](evidence/haul-planning-cold.json) retained those agreements and
  completed the remaining six trips without inference: nine scripted trips total.
- [Existing hauling regressions](evidence/haul-planning-regressions.json) still
  pass: exact delivery, request replay, withdrawal during/between trips, refusal,
  expiry without coordinator polling and cancellation-before-dispatch.
- Independent read-only Codex review completed on behavioral commit
  `0ad88c7dfdd5864a6b6be134086196e40c2328f8`, with no actionable findings.
  Later evidence/editorial-only changes do not alter behavior. Raw reports stay
  private. Review did not independently run the game; native receipts above are
  the author's verification.
- All choices in this increment are scripted, with operator-authored stockpiles,
  relocated supplies and disabled native work priorities. No new live pawn
  inference or budget changes. No improved model judgment, general coordination,
  map-switch playthrough or active-job checkpoint support is claimed. Planning
  holds are advisory, conservative and limited to this coordinator; native
  workers can still invalidate an offer. Both lab services are stopped.

## Supply-informed live useful-work trial — 2026-09-22

The fixed [trial policy](WORK_TRIAL.md) retained a scripted core and native pawn
self-perspectives, without authored personality preferences. The fixture uses
explicitly relocated supplies, authored stockpiles and disabled native work
priorities. This is not an ordinary managed colony or a controlled A/B test.

- All three initial live offers were accepted: two ten-unit steel trips each.
  The [native receipts](evidence/work-live.json) record six completed trips and
  sixty units delivered, with no failed job and no model call per trip.
- Five-minute continuous observation: 301,084ms including shutdown boundary work,
  17,966 advancing ticks, 460 samples, no paused samples. Eleven samples observed
  pending thoughts; 345 ticks advanced between consecutive thinking samples.
- Beatrice and Pedro each completed a later event-driven reflection, continuing
  native behavior. These occurred **after** work, not while reconsidering an
  active agreement. Five Jev scores (0.20, 0.20, 0.24, 0.21, 0.20) selected native
  continuation; no appraisal-triggered escalation is established.
- The bounded attention pump reached its **48-turn cap** (46 native results,
  two continued reflections). This is not unrestricted cognition throughout the
  observation window. Routine batches count toward this trial cap.
- At the later scripted offer round, no pawn had an observed two-trip option;
  no new offers or guessed destinations were issued. The specific cause was not
  diagnosed; this does not establish absence of supply or work elsewhere.
- Five Claude Max attempts used $0.50 reserved / $0.0818019 reported API-equivalent
  usage, not cash charges. Five Jev appraisals used $0.010 reserved / $0.000430836
  reported API charges. Limits were twelve each; unused allowances remain unused.
  No rerolls, historical ledger changes or additional inference during restore.
- Paired restore and [full game/coordinator cold restore](evidence/work-live-cold.json)
  exactly preserve character records, decisions, outcomes and reflections under
  a fresh epoch. Host inference drain confirmed; final work cleanup has no
  outstanding work or errors. Both shared lab services stopped.
- 94 automated tests pass. The [zero-inference rehearsal](evidence/work-scripted.json)
  completed twelve trips across two offer rounds. Initial rehearsal had only two
  eligible pawns; it was preserved and a fresh disposable fixture generated and
  preflighted before any live inference. Runner review uncovered and fixed
  no-retry, inference cancellation/drain, exceptional cleanup and action-scope
  issues; focused independent Codex review of final behavioral commit
  `bfc6b3db06fca5d6b4963a95cea166ab4333e41d` completed with no remaining actionable
  findings. Raw reviews and partial-run diagnostics remain private.

This establishes live bounded multi-trip execution, not why the choices differ
from the prior trial's counters. No naturally developed personality, sustained
strategic planning, difficult value conflict, active-job checkpoint or live
withdrawal during work is claimed. The native mod is unchanged from PR #13.
# Bounded rescue — 2026-09-22

Scripted, zero-pawn-inference checks against the installed RimWorld 1.6 game:

- A disposable save copy supplied an anesthetized colonist, two medical sleeping
  spots and disabled native work priorities. Native observations confirmed the
  patient was downed and both exact bed choices were usable.
- Queries and competing pending offers produced no native jobs. Refusal also
  produced no job. A counter selected the alternate observed bed; its revised
  offer required fresh scripted acceptance.
- The accepted rescue carried the casualty into the exact agreed bed. The native
  receipt recorded one delivery, independently corroborated by the patient's
  current bed. Duplicate action replay and subsequent intention polling created
  no second rescue.
- A separate run observed actual carrying before voluntary withdrawal. The
  casualty returned to the world at the carrier's position, not a substitute bed.
  The recorded outcome was interrupted; no retry followed.
- Native dispatch rejected a wrong map, wrong bed identity, wrong bed coordinates
  and a non-downed patient. Native expiry stopped an accepted rescue without
  coordinator polling. A rescue cancellation tombstone rejected delayed dispatch.
- Paired restore and a full game/coordinator cold restart preserved the character
  records, proposal, completed outcome and patient in the exact bed. No new
  decision or repeated rescue occurred.
- The 102 automated checks passed. A deliberately injected private option field
  made the rescue projection test fail; the unmodified implementation passed.
  The locked launcher also rejected fixture/game/cold runs while another process
  held staging; bare entry points rejected invocation before transport. Native mod
  compilation used the owned installed assemblies. Existing real-game
  hauling delivery, duplicate, refusal, withdrawal, expiry and tombstone checks
  also passed with this build.

Fixture failures were retained: omitted anesthesia duration initially produced a
standing patient, and adjacent beds made carrying too brief for the interruption
test to observe. The corrected fixture used a duration and farther observed bed
sites. These were setup failures, not rescue-delivery or withdrawal successes.

This is scripted mechanical evidence, not live rescue judgment, a naturally
occurring emergency, treatment, combat safety or long-term character behavior.
No historical live-trial allowance was reopened. Active-job checkpointing remains
unsupported. See [rescue contract](RESCUE.md).

## Local casualty discovery and commitment reconsideration (2026-09-22)

- `npm test`: **111/111**. Split native/model attention bounds include fresh-state
  escalation protection and exhaustion in either direction; six-attempt ledger
  survives reopen. New staging entry points reject missing locks/direct misuse.
  Relay tests retain a returned answer even when the game declines application,
  and accept a 100 KB final report without enlarging inference-request limits.
- Native mod compiled against the installed game. Scripted discovery occurred
  during a running haul: withdrawal interrupted it, a fresh rescue agreement
  delivered the patient to the exact bed. The alternative continuation branch
  completed three trips/thirty steel without a rescue offer. Paired restore and
  cold restart of the still-downed-patient branch preserved one sighting, not a
  repeated trigger. [Scripted evidence](evidence/reconsider-scripted.json).
- **Live, one actor:** Alvin accepted up to three ten-unit trips. Locally seeing
  downed Beatrice started reflection during his native hauling job. His first
  trip completed while he thought; his answer withdrew the remaining agreement.
  The remaining two trips never started. Ten steel delivered, not thirty.
- The scripted core offered a separate rescue only after withdrawal settled.
  A new native **DeepTalk** memory interrupted that decision before a valid
  answer returned. The unanswered offer was retired, no rescue job was created,
  and the patient remained on the ground. No reroll or unused-allowance extension.
- Three Claude subscription attempts (two returned responses, one cancelled),
  zero Jev calls. The casualty took the direct deliberation route. Observation
  ended at the prescribed settled-branch condition after about sixteen seconds,
  not two full minutes; zero paused samples during that window. Attention used
  one model and one native claim, not the 96-turn native ceiling.

The result demonstrates **a live decision changing unfinished work**, not a live
completed rescue, medical judgment, relationship causation or developed
personality. The patient was anesthetized in an authored geometric fixture;
there was no newly occurring injury. No personality/relationship overrides.
Queued attention was enabled at discovery, not unrestricted general scheduling.
The existing non-Chitchat memory interruption rule remains a concrete follow-up:
DeepTalk must not automatically be assumed to invalidate an unrelated rescue
question. See [fixed policy](RECONSIDERATION.md).

Live paired and **full cold restore passed**, with no additional inference. Both
preserved the delivered haul, stopped remaining agreement, retired unanswered
rescue offer and patient still on the ground. One same-subject sighting survived;
host draining and game cleanup reported no outstanding work. Fifteen historical
trial database hashes stayed unchanged. [Live receipt](evidence/reconsider-live.json).
Private independent Codex review covered behavior through
`13ee494cf2e27e5dda17f9b7cacdcb9cf7ed2894`; confirmed evidence-retention issues were
fixed and the focused final review found no actionable defects. Subsequent
changes only publish factual evidence and reviewed diary prose.

## Interruption relevance and contradictory live intent (2026-09-22)

- **119/119 automated checks**, compiled against the installed game. Deferred
  DeepTalk remains queued after explicit decisions and reflections, including
  legacy stored interrupt flags. Unfamiliar significant memories still supersede.
- Pending rescue decisions invalidate on rescuer unavailability, proposal withdrawal,
  map change or fresh locally observed patient/bed contradictions. Missing or stale
  local facts alone do not invalidate. Reflection acceptance validates before
  marking completion; durable acceptance survives dispatch-reply loss.
- Native authored short anesthesia expired while a scripted rescue answer was
  pending. The actual observed patient recovery cancelled it, and a late accept
  dispatched no job. Paired and full cold restore passed.
- The first delayed rehearsal exposed an overstrict guard: shortlist disappearance
  cancelled a pending rescue. This retained result prompted the positive-evidence
  correction before live inference. Final delayed scripted rehearsal (5-second
  reflection, 8-second rescue answer) delivered ten steel, withdrew remaining
  hauling and rescued Beatrice into the exact bed. Paired/cold restore passed.
  No social event occurred during thought in that rehearsal.
  [Scripted evidence](evidence/interruption-scripted.json).

**Single live follow-up, fresh interruption-v1 allowance:** Alvin accepted three
hauling trips and locally noticed Beatrice at tick 48. Reflection viewed him still
hauling at tick 61. It returned structured `continue`, but its reason said it would
withdraw and rescue her. The coordinator did not convert prose into authority:
all three hauls completed, thirty steel delivered, and no rescue was offered.
The patient remained downed on the ground. This is a preserved **prose/action
mismatch**, not proof of a deliberate preference for hauling.

Two Claude attempts returned valid structured responses; no cancellations, Jev
calls or rerolls. Observation ended at the settled-branch condition after
15.991 seconds/924 ticks, with zero paused samples, one model attention claim
and five native claims. No relevant social event occurred during deliberation:
DeepTalk deferral is mock-tested, not live-event demonstrated here. The authored
anesthesia/supply/bed fixture and scripted core establish neither personality
nor medical judgment. [Live evidence](evidence/interruption-live.json).

Paired and full cold restore preserved completed hauling, the contradictory
reflection and one casualty sighting, with no additional inference. Cleanup found
no outstanding work; 24 historical database files stayed byte-identical. Fresh
limits remained six Claude attempts/four Jev appraisals, unused allowances unused.
Independent Codex review found premature reflection bookkeeping, fixed before
live execution. The final focused review of behavior through
`0b202c21a23bb1a52af6a95b6954d60a123940c5` found no further concrete defects.
Subsequent changes publish evidence and fact-checked diary prose only.

## Explicit reflection choice effects (2026-09-22)

- **125/125 automated checks.** Claude's provider schema names keep-current-activity,
  withdraw-current-agreement and answer-pending-proposal. Eligible options describe
  their effects; withdrawal names the supplied running agreement. Invalid scope
  is rejected without retry, with the structurally valid provider choice retained.
  The coordinator rechecks the captured agreement before withdrawal. Canonical
  saved reflections remain unchanged. Contradictory prose still grants no authority.
- Both native scripted branches used the new choice validator/translation.
  Withdrawal stopped after one completed haul/ten steel; fresh consent then
  delivered Beatrice to the agreed bed. Continuation completed three hauls/thirty
  steel without a rescue offer. Both paired restores passed, and the continuation
  branch also passed full cold restore without inference. No mod changes.
- A real native **DeepTalk** arrived during the scripted rescue decision, was
  recorded as deferred, and did not cancel the answer. Its sequence was 10 while
  the actor's final attention cursor was 7: it remained queued. This extends the
  previous mock deferral evidence to a native event with scripted deliberation,
  not live social judgment. [Scripted evidence](evidence/intent-scripted.json).

The single live follow-up accepted three hauling trips. A local sighting at tick
50 prompted reflection while hauling; the view was captured at tick 61. The
provider chose `keep_current_activity`, translated to canonical `continue`, and
said it would continue hauling unless a rescue proposal arrived. All three trips
completed: thirty steel, no rescue offer or rescue, patient still down on the
ground. Choice, explanation and effect agree in this observation. This is not a
controlled comparison or proof of generally improved reasoning. No reroll.

Two Claude attempts, no Jev calls. The settled branch ended after 16.052 seconds
and 923 ticks, with zero paused samples, one model attention claim and five native
claims. No social event arrived during live thought. Historical 26 database files
were unchanged; unused allowance remained unused. [Live evidence](evidence/intent-live.json).

The result identifies a planning limit: the pawn waits for an alternative, but
this scripted core offers rescue only after withdrawal. A pawn-originated request
for an alternative while keeping its current agreement is not implemented yet.
This is not evidence of a preference against rescue or a developed personality.
Independent Codex review of final behavior at
`15835b1b3a1d1e4beb848e3174799f24c8f6cd9c` completed with no actionable findings.
Later changes publish factual evidence and reviewed diary prose only.

Live paired and full cold restore preserved the agreed continuation, all three
hauling outcomes and one casualty sighting, with no further inference. Host
draining and cleanup reported no outstanding work.

## Pawn-originated rescue alternatives (2026-09-22)

- **139/139 automated checks.** Requesting while hauling grants no action consent
  and does not stop work. Scope, duplicate requests, privacy projection, refusal,
  counters, fresh consent, uncertain cancellation, timeout, late receipts, native
  final-trip completion and reopen behavior are covered. No mod changes.
- Native scripted acceptance completed one haul/ten steel, interrupted the next
  trip and delivered the casualty to the exact bed. Refusal kept the agreement
  and completed all three hauls/thirty steel. Both final-build paired restores
  passed; an earlier successful handover also passed cold restore.
- The initial delayed rehearsal is retained: the request preserved hauling, but
  the old agreement finished before the core reply. Stale replacement was rejected
  and the runner reported a later-round failure. No inference was used.
  [Scripted evidence](evidence/alternative-scripted.json).

Live, Alvin accepted three ten-unit hauling trips, locally noticed Beatrice,
requested a rescue alternative while keeping his agreement, then accepted the
scripted core's concrete replacement. Two trips completed: **twenty steel**. The
third never started. Beatrice reached the exact agreed medical sleeping spot;
this proves rescue placement, not treatment. The acceptance explanation called
the haul “wrapped up” despite one agreed trip remaining. That inaccurate progress
statement is preserved, not interpreted as full agreement completion.

Three Claude attempts, zero Jev calls, no rerolls; unused allowance stays unused.
Continuous observation ended after 18.437 seconds / 1069 ticks with no paused
samples; initial negotiation was paused. One model and two native attention
claims. Paired and full cold restore preserved request, consent, both hauling
outcomes and completed rescue, with no additional inference. Cleanup found no
outstanding work. All 28 historical database files remained unchanged.
[Live evidence](evidence/alternative-live.json).

Independent Codex review found two handover defects, both fixed and reproduced
in regression tests. Focused review of final behavior
`f51de052ab771b177550af5669987c6d48514f65` found no further defects. Later changes
publish factual evidence and reviewed diary prose only. This single authored
scenario does not establish general reasoning reliability or developed personality.
