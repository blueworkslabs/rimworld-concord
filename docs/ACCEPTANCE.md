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
