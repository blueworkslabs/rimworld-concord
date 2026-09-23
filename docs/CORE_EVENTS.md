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
