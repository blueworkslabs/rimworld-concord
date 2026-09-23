# Bounded integration checkpoint v1

Frozen before inference, 2026-09-23. The correction micro-test is paused in favor
of observing the combined existing loop. No production prompt, response schema,
UI or live strategic core changes are part of this checkpoint.

## Protocol

Reuse the authored three-pawn wood/needs fixture. Two workers have nearby wood,
local storage and accessible meals, with initially different Food levels; the
third remains a native bystander. This does not yet test four protagonists.
Native work priorities are disabled to isolate accepted jobs; native eating,
resting and ordinary social routines remain available.

After allowing up to ten seconds to capture a native nonroutine event for the
initiator (without injecting one), pause for one optional two-turn encounter
between the workers. No authored words are injected in the live encounter. Each
worker gets at most one ordinary attention admission after speech; missing
eligible events can leave it idle. A scripted appraisal admits eligible events
without Jev inference. No reflection is forced to revise a note. Verify that
speech and private reflection create no work and leak no private notes to the
public log or bystander. Verify paired restore before new work offers.

Offer each worker two ten-unit wood trips independently. At most one strictly
smaller same-stack/destination counter can be offered back, requiring fresh
consent. A refusal is terminal, not a reason to ask again. Then run five minutes
of native activity, including quiet time. Once, at the midpoint, offer one new
ten-unit trip only to workers whose earlier accepted work is fully complete.
The same single-counter rule applies. Failed calls retire unanswered offers;
no automatic retry, reroll, new supply placement or manufactured event follows.
Midpoint negotiation happens with the game running and may become stale.

Fresh persistent `integration-v1` ledger: at most twelve Claude native subscription
attempts, each with the existing 0.10 API-equivalent reservation and local 45-second
deadline (1.20 maximum reservation, not a cash bill). Zero Jev calls. All attempts
including failure consume the cap; unused capacity is not filled. Two speech,
at most two reflection, four offers and up to four counter-consent attempts.
Intention advancement accepts an optional operator admission predicate (existing
callers retain their behavior), checked after asynchronous preparation before a
new trip is dispatched. A hard observation deadline closes pending inference; no new inference starts
at/after it. Stop/retire owned work, preserve partial outcomes, paired checkpoint,
then full game restart verification with zero inference. Stop staging afterward.

Scripted rehearsal exercises speech, a private note, refusal, smaller counter,
fresh consent, delivery and restore. It is not model-behavior evidence.
Use the established needs-fixture launcher to prepare the disposable fixture;
`run-integration-lab.sh game|cold` holds the coordinator lock throughout.

## Reader and evidence separation

Fable receives actual, unannotated player-facing screenshots first, including the
panel headers, report tick, event timestamps, agreement board and scroll context.
Keep chronological captures rather than reconstructing a UI from exported rows.
No expected outcome, diary, private outlooks, model request dumps or diagnostics
in the first packet. Supply diagnostics only after Fable posts the initial read.
Fable knows the project: this is an unbriefed artifact read, not a blind human study.
Offscreen or missing facts are unknown, not reader errors. No UI polish in this slice.

Assess what the artifacts make legible: separate speech from consent and observed
outcome; completed/unfinished work, persistence, native needs behavior, character
signals and quiet stretches. A ledger, changed wording or acceptance count alone
is not personality. This single authored sequence is neither a model comparison
nor a causal test of isolated outlook influence. A recommendation about a live
core does not itself authorize one.

## Recorded result and transport repair

The fixed sequence used seven Claude attempts, zero Jev calls and no rerolls.
Four trips delivered forty wood across three agreements; all 229 activity
samples were unpaused. Fable read nine complete player-panel captures before
diagnostics. The read recovered the work sequence but exposed missing follow-up
and visibility of native eating or unavailable work. This is an unbriefed
project-familiar reader account, not a blind usability study.

The original host result failed: the 1,373,560-byte final report exceeded the
1 MiB wire cap. The saved staging report was recovered unchanged and both paired
and full restart verified without new inference. The failure remains preserved.
Receipt transport now permits at most 16 MiB, while inference messages retain
the 32,000-byte limit. Boundary tests and replay of that exact recovered report
passed; no live run was repeated. This repair does not support unbounded reports.

[Sanitized results and reader corrections](evidence/integration-checkpoint.json).
After the reader recommendation, the user approved developing a bounded live
core next. This checkpoint itself still used a scripted core.
