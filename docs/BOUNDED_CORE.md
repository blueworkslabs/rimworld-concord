# Bounded linked core v1

The first actual planner uses the existing isolated native Claude backend. It is opt-in, not an unattended colony service. Scripted planning remains the mechanical regression baseline.

## Knowledge and authority

The core receives a deliberate operator briefing, crew IDs/names, its own addressed question/reply, proposal replies, communicated alternative requests, receipt-based agreement progress, and fresh bounded local hauling/rescue opportunities. The existing observation API supplies these physical options to the core; it is not a global map scan. Pawn-private conversations are **not** automatically shared just because an observer can see them in the crew log. Private needs, memories and outlooks are excluded. A pawn may voluntarily describe them in speech; that remains testimony.

One turn can propose one listed opportunity, adopt one counter as a new offer, ask one pawn one optional question, or wait. Only the addressed pawn can accept/refuse/counter. Neither speech nor topics authorize a job. Refused/withdrawn work is not offered again by this planner. Execution and late application still use the existing physical, reservation, timeline and consent checks. Active-work replacement is not newly implemented by this slice; alternative requests can be seen but not every request can be fulfilled.

Up to eight sourced topics retain the planner's interpretation as open/blocked/deferred. Linked agreement outcomes are derived from receipts, not model-written completion claims. A source reference does not prove the prose true. The first prototype caps persisted planner turns at sixteen and questions at one; this is deliberately not a long-running general planner. New unanswered turns on restart are retired without retry. Topics, questions and results follow paired checkpoints; discarded-future answers cannot apply.

No cooking, construction, work-priority changes, ship systems or arbitrary tools are added. Unsupported goals should be acknowledged as blocked, not fabricated as accomplished. The core's short reason is deliberate public commentary, not private reasoning.

## Frozen first experiment

- Four planner attempts (`core-planner-v1`) and at most five combined pawn answers/decisions (`core-pawns-v1`), each with its own durable ledger.
- Native Max subscription route, no API billing switch; accounting ceilings are API-equivalent reservations of 0.40 and 0.50 USD, not billed subscription charges. Zero Jev calls.
- Four planning boundaries, explicitly paused inference, then thirty seconds of native activity each. No claim of continuous-core timing from this experiment.
- One question maximum; voluntary reply or silence. Every offered job gets a separate pawn decision. A counter waits for a later planner turn; it is not adopted by the runner.
- All three existing fixture pawns are eligible, unlike the previous deliberate-bystander test. The fixture has existing meals and ordinary work priorities disabled. It is not an unrestricted colony.
- Per-call timeout, fifteen-minute runner ceiling, host deadline admission, exclusive staging lock, no rerolls. Failures keep their attempt reservation and partial evidence. Cold restore never calls a model.
- Scripted rehearsal: question, grounded proposal, smaller counter, fresh acceptance, later wait/review. Live choices are unconstrained by that script.

Use `scripts/run-core-game.mjs` with an operator-private configuration matching the existing integration runner (`sshTarget`, absolute `labRoot`, `remoteRepo`, `ledger`, `scratchRoot`, `receipt`). It suffixes the ledger with `.core` and `.pawns`. `--scripted` uses no provider; `--cold` verifies the same saved run without inference. The remote `scripts/run-core-lab.sh` owns the lab lock throughout.

Success means truthful, coherent follow-through that respects autonomy, not more chatter, mandatory acceptance, or a required quantity of hauling. Formal validation alone cannot establish grounded prose, useful planning, or character consistency.
