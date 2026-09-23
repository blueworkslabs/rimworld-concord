# Bounded event-driven core follow-up

This opt-in successor to the four-round core experiment adds a pawn reply `defer`, explicit source identity and attributed-speech labels, and an event-admission gate. It is not an unattended service and adds no cooking or construction capability.

## Not now

`defer` retires the offer as `deferred`. It starts no job, cancels no existing work and promises no later acceptance. The public log preserves the deliberate reply. This bounded planner suppresses further ordinary offers to that pawn for the remainder of its session, including different stacks/destinations. The response is distinct from refusal, but **automatic resumption after eating or a timer is not implemented**. A future resumption protocol must establish a legitimate occasion to ask again and require fresh consent. The operator's existing scripted proposal API remains available for explicitly controlled tests.

## Evidence and identity

Opportunities carry `supply.sourceThingId` next to the material label and retain exact action/destination identity. Two stacks labelled Wood are not the same source. Replies, requests and delivered words are marked attributed speech. The core instruction explicitly requires "Alvin reported hunger" unless a receipt actually establishes causation. This is a prompt/data contract, **not a semantic validator of arbitrary generated prose**. Topic interpretations and linked receipt outcomes remain separate.

## Scheduling

Before any planner turn, an operator may configure immutable `maxAttempts` (1–16), `cooldownTicks` (60–3600) and `windowTicks` (60–36000). `planCoreWhenDue` admits the initial briefing, then completed/stopped agreements, refusal/deferral/counters/withdrawals, communicated requests, incoming messages and finished question attempts. Polling and native tick progress alone do not wake the core. Neither private needs/outlooks nor changing opportunities nor the core's own topic prose is a trigger. Simultaneous causes coalesce into a single turn; changes during cooldown or a running turn remain eligible afterward.

Admission and event consumption are persisted before inference, including failures. Same-event failures are not retried. Concurrent calls cannot admit two turns. A configured scheduler cannot be bypassed through `planCore`. Scheduling state follows paired saves and discarded timelines; a separate host-owned provider ledger is still necessary because game rewind must not refund calls. Recent shared-view limits still apply (24 agreements, one question, sixteen core turns). A caller must reconcile native receipts before admission. This is a bounded prototype, not a durable unbounded event bus.

## Frozen validation protocol

New `core-events-planner-v1` / `core-events-pawns-v1` ledgers permit at most four/five Claude attempts respectively, zero Jev, no rerolls. Historical ledgers and evidence are not reused. The old core-v1 launcher rejects new live runs; scripted/cold operation remains possible.

`scripts/run-core-events-game.mjs` uses the existing private operator-config shape; `scripts/run-core-events-lab.sh` holds the exclusive coordinator lock across loading, decisions, saves and restore. Native activity lasts up to 120 seconds (40 for scripted mechanics), cooldown 60 ticks, horizon 18000 ticks. Inference is explicitly paused. Quiet intervals do not generate fixed-round turns. The scripted baseline prescribes not-now, a smaller counter, fresh acceptance and completion; live choices are unconstrained by those outcomes. A single wait followed by no new events is valid, not failed planning.

Verification must separate automated/mock lifecycle checks, native scripted execution, and any separately recorded live model result. No results are asserted by this protocol itself.

## Recorded result — 2026-09-23

[Sanitized evidence](evidence/core-events.json) records behavior commit
`d706b570961f3f4b4c84acc0e2969e38b7e5ed38`. All 272 Node and ten Python
transport checks passed. Independent full review found missed terminal movement
events; the fix received regression coverage and a clean focused re-review.

The final scripted native rehearsal exercised defer → smaller counter → fresh
acceptance → five wood delivered → completion-triggered wait, with paired and
cold restore. The live run instead used two accepted three-trip hauling offers
to Alvin: six completed trips delivered sixty wood. The initial briefing and
two completion events admitted three core turns; the last chose wait. Passing
time through the rest of the window caused no fourth call. Three core and two
pawn attempts, zero Jev, no rerolls; remaining allowances stayed unused.

All 102 sampled activity states were unpaused across 120.801 seconds of native
activity; inference was deliberately paused. Paired and cold restore preserved
the scheduler and outcomes, with no additional calls. The inspected saved panel
shows two completed agreements and the final wait message. Staging was stopped.

The live core correctly distinguished the source stacks, but chose no deferral
or question. Do not claim a demonstrated reduction in agreeableness or live
verification of hunger-testimony attribution. Its final topic prose calls both
hauls resolved while retained topic statuses remain `open` and `deferred`.
Receipt-based completion remains correct; this bookkeeping mismatch is preserved.
Different timing from the previous experiment prevents a controlled causal
comparison. Explicit topic lifecycle and a legitimate re-invitation after
not-now remain next steps; no extra call was made to tidy this result.
