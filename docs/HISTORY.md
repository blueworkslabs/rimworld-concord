# Historical implementation checkpoints

Archived from ROADMAP.md on 2026-09-22. These are time-specific reports, including superseded next-step plans—not the current roadmap. See [current direction](ROADMAP.md), [acceptance evidence](ACCEPTANCE.md) and the [development diary](https://rimworld-concord.pages.dev/).


## Implemented foundation

- Standalone public repository and reusable lab tooling.
- Typed proposals and pawn decisions, SQLite state/audits, narrow perspective projection.
- Real movement action, persistent deduplication ledger and native outcome tracking.
- Timeline invalidation, bounded asynchronous scripted decisions, deliberation activity API.
- Quiescent paired checkpoints and restore.

## Pawn-awareness increment

- Native self facts: traits, skills, needs, surviving memories and direct relations.
- Bounded native event archive, per-pawn experience projection, gap reporting and saved cursors.
- Native/appraisal/deliberation attention routing, with significant-event bypass.
- Visible expiring deliberation badge; no automatic pause.
- Jev System One request/response adapter and conservative persistent trial ledger; mocked validation, one protected synthetic live call and two real-game live appraisals.

## Bounded attention increment

- Opt-in finite attention pump: coalescing, cooldown, significant-event bypass and limited concurrency.
- Pawn-owned reflection can continue native work or accept/refuse/counter one visible pending proposal.
- Durable at-most-once attempt receipts, interruption on new significant events, cancellation and paired restoration.
- Scripted backends only; no live judgment quality or unattended operation claim.

## First live deliberation increment

- Native Claude Code Max route, fixed model, no action-capable tools or customization, strict structured responses.
- Persistent separate three-attempt usage ledger, bounded subprocess lifetime and process-group cancellation.
- Synthetic decision and real-game explicit acceptance with completed native movement.
- Event-triggered live reflection was interrupted by newer conversation memory; no response applied.
- This is a mixed result, not proof of completed live reflection or narrative quality.

## Thought reliability increment

- Known mundane Chitchat queues/coalesces without cancelling current thought; health and unfamiliar memories remain conservative interrupts.
- Explicit continuous/default and pause-at-decision/testing modes with independent game-owned wall-clock pause claims.
- Overlap, manual pause preservation, orphan expiry and reload verified in the real game.
- Incremental paired checkpoints and full compiled-coordinator deployment hash preflight.
- Completed live acceptance/movement and event-triggered refusal in both timing modes; paired and full game/coordinator cold restore verified separately.
- Separate four-attempt subscription ledger exhausted, with historical trial ledgers unchanged. No long-run quality claim.

## Three-pawn negotiation increment

- Communicated counter inbox, exact-alternative revised offers, fresh pawn consent and two-revision thread bound.
- Owner-only ancestor history in explicit and event-driven views; saved lineage and idempotent replies.
- Three sequential live pawns, two decisions each, real self-facts plus explicitly authored test preferences.
- Beatrice countered, accepted the revision and completed movement; Pedro refused twice; Alvin accepted twice, with one rejected destination and one completed move.
- All six met the limited authored-preference rubric; paired/cold restore passed. Not emergent personality, live core strategy or concurrent live-agent evidence.
- Immediate terminal action failures reach owner memory, verified separately with scripted real-game regression.

## Grounded movement increment

- Bounded, epoch-stamped nearby visible/reachable options from the native game.
- Owner-only pawn views and core physical-only query; consent and dispatch checks unchanged.
- Scripted grounding and persistence checks; no new live inference or long-run reliability claim.

## Bounded hauling increment

- Local item/storage options and native exact-quantity hauling, with current-state revalidation.
- Fixed-source/fixed-cell standing consent for at most three trips; needs, expiry, failure and withdrawal stop work.
- Independent native stop guards, scoped cancellation and cancellation-before-dispatch tombstones.
- Quiescent between-trip paired/cold restore; active-job checkpoints remain deferred.
- See [contract and trial scope](HAULING.md). Finite live results are recorded in the acceptance evidence, not inferred from implementation.

## Supply-aware coordination increment

- Separate observed source quantities/storage capacity from per-trip consent limits.
- Conservative, durable planning holds prevent competing offers inside one coordinator.
- Pending-offer withdrawal cannot cancel pawn-owned accepted work.
- Bounded local alternatives and map-bound native dispatch; execution still revalidates.
- Scripted coordination and restore checks; live-model improvement remains unmeasured.

## Live useful-work observation

- Three live two-trip agreements completed six native hauls without per-trip inference.
- Two post-work reflections completed during continuous play; five Jev appraisals stayed native.
- Five-minute observation and cold restore verified; 48-turn attention cap reached, later local options absent.
- Scripted core/authored fixture: no sustained planning or long-run personality claim. See [trial policy](WORK_TRIAL.md) and [evidence](ACCEPTANCE.md).

## Bounded rescue increment

- Local, map-bound downed-colonist and single-medical-bed opportunities.
- Fresh pawn consent; patient/bed planning holds, native carry and exact-bed outcome.
- One attempt with withdrawal, needs/expiry stops and quiescent persistence.
- Scripted verification only; no live rescue judgment or treatment claim. See [contract](RESCUE.md).

## Next bounded increment

- Evaluate Jev on recorded self-perspectives and compare outcomes against scripted/rules baselines.
- Evaluate end-to-end scheduling and sustained character consistency beyond the finite integration trials.
- Extend social-event capture and perceived knowledge; add operator inspection UI.
- Expand relevance-aware interruption beyond the narrow Chitchat/DeepTalk exceptions; retain urgent supersession.
- Tune optional consequential-decision pauses from playtests; avoid global stop-start behavior.
- Extend beyond authored-preference checks toward sustained character behavior and multi-party negotiation.

## Later

- Compare rules+LLM against rules+Jev+LLM; OpenClaw tool plugin.
- Pawn-originated goals and richer actions: construction, conversation, broader rescue/treatment.
- Core strategic planning, building/defense proposals, explicit planning pauses.
- Broader standing intentions, active-job checkpoints, retention and portable installation.
- Gravship scenario, binding mechanics, progression quests and evidence-backed chronicler.

Do not describe placeholder interfaces or design documents as live integrations. Smooth continuous gameplay remains the goal; deterministic-ish paused testing is a development mode.

## Commitment reconsideration evidence

- Local casualty discovery can prompt pawn-owned reconsideration during hauling;
  notices survive save/reload without repeated alerts for the same downed subject.
- Native and model-dependent attention claims can use separate bounds.
- Live: one pawn withdrew unfinished hauling after noticing a casualty; a fresh
  rescue deliberation was cancelled by DeepTalk. No live rescue completed.
- Next evidence-led priority: contextual interruption handling for social memories
  beyond Chitchat, without weakening genuine invalidation or rerolling this trial.

## Relevance-aware interruption follow-up

- Chitchat/DeepTalk wait behind thought without losing their experiences; legacy
  stored flags use current scheduling. Other significant memories remain conservative.
- Pending rescue questions use fresh locally observed patient/bed contradictions,
  availability and proposal validity. Bounded shortlist absence is unknown.
- Native scripted recovery cancels late rescue consent; delayed scripted rescue
  completes exact-bed delivery. Both cold restores pass.
- Live follow-up: structured `continue` contradicted prose promising withdrawal.
  Three hauls/thirty steel completed; no rescue was offered. Two attempts, no retries.
- No social event arrived during thought in this live run: deferral's live-event
  demonstration remains open. Next priority is executable intent/reason consistency,
  without parsing prose into unconsented actions. See [evidence](ACCEPTANCE.md).

## Explicit intent-choice follow-up

- Provider reflection choices now spell out their effects and bind withdrawal
  to the pawn's exact agreement; original choices and canonical responses are
  both retained. No prose parsing or semantic-consistency guarantee.
- Native scripted continuation/withdrawal branches pass; actual DeepTalk queued
  during scripted rescue thought without cancellation.
- One live reflection's choice/reason/effect agreed: continue hauling pending a
  rescue offer. Thirty steel delivered, no rescue. This is a single observation.
- Next: bounded pawn-originated requests for alternatives while retaining current
  work, so discussing rescue need not require abandoning an agreement first.
  Preserve fresh consent and separate discussion, agreement and execution.

## Request before replacement

- Pawns can request one locally observed rescue alternative while retaining a
  running hauling agreement. The core can decline or offer a concrete replacement;
  fresh acceptance authorizes a confirmed old-job stop before rescue dispatch.
- Native scripted acceptance and refusal passed. One live request and fresh
  acceptance completed exact-bed rescue after two hauls/twenty steel; the third
  haul never started. Request and outcomes survived paired/cold restore.
- The live explanation overstated completion (“haul wrapped up” with one trip
  remaining). Next opportunity: make agreement progress explicit during replacement
  negotiations. Do not infer a general reasoning fix from one successful sequence.
- Core remains scripted; broader character consistency and strategic planning
  remain unproved. See [contract](ALTERNATIVE_REQUESTS.md) and [evidence](ACCEPTANCE.md).

## Legible crew planning checkpoint

The next playable direction is recorded in [PLAYABLE_DIRECTION.md](PLAYABLE_DIRECTION.md):
readable communication and receipt-based progress first, then bounded mixed-work
observation, character development, selective social exchange and strategic core
planning. Future core messages, pawn correspondence and comms-station encounters
are recorded options, not part of the current implementation or inference budget.
See [crew log contract](CREW_LOG.md) for the first read-only presentation slice.

The first presentation slice is implemented: read-only crew log, explicit own-agreement progress and bounded saved display cache. Native scripted tests and cold restore passed; no new live inference was used. Next is a bounded mixed-work observer trial, not automatic expansion into human chat or durable-self systems.

## Observer trial findings

A bounded five-minute mixed-work trial delivered eighty steel but no rescue.
The public log makes the request and scripted decline visible; native recovery
of the casualty is absent from that log. Six-reflection allowance ended attention
early. The next planning targets are resolving a still-relevant requested goal
after its replacement context expires (fresh standalone consent, never a stale
answer replay), selected observable native state changes, and reflection pacing.
Do not interpret this as a refusal to rescue or proof of developed personalities.
See [trial contract](OBSERVER_TRIAL.md) and [evidence](evidence/observer-live.json).

The pending-goal reply path is now implemented and verified: an unanswered request
can receive standalone rescue consent after ordinary hauling completion, without
reviving declined requests or reusing stale replacement acceptance. One live
sequence completed thirty steel then rescue, with paired/cold restore. The core
remained scripted and deliberately delayed its reply. Selected native-event
visibility and reflection pacing remain the next bounded follow-ups; broader
character, social and human-contact work stays in the playable-direction plan.

Selected native visibility is implemented: attributed local downed and later
no-longer-downed observations now appear as observer records, not speech or private
thought. No-inference native perception/rewind/cold-restore checks passed. The log
still is not a complete colony history or a medical diagnosis. Reflection pacing
is the next focused follow-up; character/social/human-contact milestones remain
separate. See [native-log verification](NATIVE_LOG_TRIAL.md).

## Pacing checkpoint

Optional trial pacing is now verified: four routine intervals plus two
health/casualty reserve slots spread six live reflections to approximately
226 seconds of a five-minute window. Provider ceilings stayed fixed; this run
used nine Claude attempts and no Jev calls. Work/log/pacing evidence survived
paired and cold restore. The remaining window was not unrestricted deliberation.
See [pacing contract](REFLECTION_PACING.md).

The mixed-work, pending-goal, native-visibility and pacing follow-ups provide a
checkpoint before more scheduler expansion. Next planning focus: a bounded
durable-character continuity slice and one consequential social exchange from
[the playable direction](PLAYABLE_DIRECTION.md), judged by observable choices
and continuity rather than additional reflection volume. The live core and human
contact remain separate future milestones, not enabled by this change.

## Private outlook checkpoint

A bounded private outlook is implemented: up to four evidence-linked values,
concerns or stances, revised only by the owning pawn's reflection. Native trait
and relationship values stay unchanged. Scripted native formation, owner-only
later perspectives, rewind and cold restore passed. The live trial formed no
outlook: it attempted an unavailable rescue request with an invented agreement,
which validation rejected. A separate preplanned rescue offer later succeeded.

Before extending social behavior, align provider output schemas with current
allowed choices/identifiers and then test live outlook formation under a fresh
bound. Do not count unrelated rescue success as character continuity. General
personality development and social/human-contact milestones remain open.
See [private outlook contract](PRIVATE_OUTLOOK.md).


## Contextual choices checkpoint

Reflection schemas now match available choices/IDs and owned outlook evidence.
The fresh live follow-up formed one concern and one stance and preserved them
into a later decision after restore. Rescue completed with separate fresh consent,
not authority from private reflection. Formation and reuse are now demonstrated
once; causal influence and sustained character quality remain open.

Before widening character/social behavior, prepare a small fixed-snapshot model
contract evaluation, beginning with the user-suggested Luna through native Codex
(`gpt-5.6-luna` in the current catalog). Verify tool isolation first; keep schema
adherence, judgment, latency and game outcomes separate. No Luna call or alternate
pawn backend is included in this slice. See [cross-model plan](PLAYABLE_DIRECTION.md).
