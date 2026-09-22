# Bounded mixed-work observer trial

Fixed policy: one five-minute continuous observation window after initial paused
negotiation; at most 12 Claude attempts, six event-driven reflections and 12 Jev
appraisals. Provider ledgers are new and non-rewindable (Claude Max: $1.20
API-equivalent reservation ceiling, not cash; Jev: $0.024 reservation ceiling).
No rerolls, unused allowance stays unused, and full cold restore uses no inference.
The attention pump has separate 100-native / 12-model claim limits, one pending
attention task, 1,200-tick cooldown. Reaching a cap does not silently replenish it.

## Authored setup and scripted core

Three existing colonists: two independent three-trip steel lanes and one
anesthetized colonist, initially outside the first worker's local view. Native
work priorities are disabled to prevent unrelated hauling/rescue; ordinary
needs, idle behavior and social activity remain native. No personality or
relationship overrides. This is not a naturally developing colony benchmark.

The core offers each worker up to three ten-unit trips, accepts at most one exact
same-kind counter revision with fresh consent, and answers deliberately addressed
rescue requests with a currently grounded alternative or decline. A request does
not stop current work. Stale offers and refusals are retained without retries.
At two minutes the core may make one later hauling round, only for pawns whose
prior agreements completed and whose history has no refusal or unresolved offer.
No rescue is forced, and withdrawal alone does not cause an unsolicited rescue
proposal in this trial. There is no live strategic core.

## Observation and interpretation

Keep the Concord panel open while the colony runs. Record public log/progress
frames every 15 seconds and screenshots near five seconds and mid-window. Retain
quiet stretches through the five-minute boundary even if early work finishes.
After the boundary, cancel/drain inference, stop outstanding work as an explicitly
operator-owned cleanup, pause, save and check paired/full restart. Record the
cleanup separately from pawn choices. Provider responses survive stale rejection.

Report delivered work, refused/failed/cancelled decisions, pending requests,
attention/call limits, paused/thinking samples and what the public log permits
an observer to reconstruct. Private diagnostics may validate records but are not
part of that observer account. Analyst inspection is not a blinded human usability
study, and no character consistency or causal improvement is inferred from one run.
A 45-second scripted rehearsal uses a 20-second later round and no paid inference.

## Operator entry points

`node scripts/run-observer-game.mjs /absolute/private-config.json --scripted`
rehearses through the existing host decision/appraisal lanes. Omit `--scripted`
only for the explicitly authorized single live run; add `--cold` to verify its
saved result without inference. Host configuration and ledgers stay private.
`RIMWORLD_LAB_ROOT=/absolute/lab bash scripts/run-observer-lab.sh fixture` creates
a disposable scenario. All fixture/game/cold entry points hold the staging lock
for their full lifetime and reject direct execution before touching transport.
