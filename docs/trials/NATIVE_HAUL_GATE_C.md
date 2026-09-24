# Gate C verdict: native-intent haul spike — 2026-09-24

Written by Fable (direction and architecture for this phase) after the recording-only
read and Astra's findings in [NATIVE_HAUL_LIVE](NATIVE_HAUL_LIVE.md). The cold read
was posted before the findings and is unchanged; this record adds Part D and the verdict.

## Part D: read versus findings

- **Right:** the sequence, 75/75 as Pedro 40 and Beatrice 35, Pedro helping unasked,
  his offer arriving late, six repetitive core turns, the later status questions arriving
  after their recipients had eaten, the 75-to-120 counter with no record, templated voices.
- **Could not know (artifact):** Pedro answered *accept*; it was correctly rejected
  (`Intent already closed: met`) and then mislabelled *withdrawn*. Both on-screen
  contradictions were true at snapshot time and stale by publication. Beatrice's eating
  topic closed at t22166. Alvin and Pedro ate 18 berries each natively. The split of the
  last 45 wood is unrecorded even in the receipts.
- **Missed (presentation and my choice of view):** the Core topics tab, where the
  model's drifting completion timestamps would have shown.
- **On me:** "reads like a sanction" undersold the withdrawn line. The core was fed
  `agreed: 1, unfulfilled: 1` for an offer nobody accepted; that is a projection defect.

## Verdict

**The spike wins on the game side. Migrate.**

The native-haul game-mechanics measures observed in this run passed: zero consent violations, zero
credit beyond the quota, exact totals from receipts, two simultaneous reservation
holders, a helper who appeared because the map made helping sensible, paired and
new-process cold coordinator restore intact (the game process stayed up). No stale
job execution or capability override; the late acceptance was rejected because the
intent was already complete. Meal resumption is proven in the matched scripted case (three
ticks) and was not reachable live because the work finished first.

**It does not win on the crew side, and was not designed to.** No plan formed between
pawns, nobody refused, all three answer in one voice template, and the core narrated
"nothing to propose" six times because the frozen intent-only setup gave it nothing
else. Those are the next scene's questions.

## Blocking the next live run (not the migration work)

1. **Late acceptance bookkeeping.** An accept on a closed intent is "answered yes after
   completion; no agreement started". It is never projected as agreed or unfulfilled and
   never labelled withdrawn.
2. **Observation age and event time.** Every fact in the core's view carries its
   snapshot tick; narration older than the newest receipt is flagged before publication;
   completion times come from receipts, never from the current tick.
3. **Failure visibility.** Six reflection prompts exceeded the 24,000-byte limit before
   any model call, sixteen attention events were evicted, and the stop guard never fired
   because core successes reset it. Failures record their cause, are counted per lane,
   and the reflection perspective is trimmed rather than the limit raised.

## Decisions closed

These are direction decisions, not claims that the current spike already implements
silent wait or the migration's legibility changes. The documented failures and the full
[technical findings](NATIVE_HAUL_LIVE.md#technical-findings--released-after-the-recording-only-read)
remain part of the verdict; game-mechanics success is not a clean cognitive-run claim.

- **Attribution-only is the default for tagged work.** Refusal, defer and withdrawal
  bind; helpers are credited as helpers. The exclusive variant remains scripted-only.
- **The wait action is silent.** A core turn with nothing new produces a "waiting on…"
  status line, never a crew-log entry.
- **Legibility that ships with the hauling migration**, not as later polish: the offer
  says what is offered; helpers are labelled "helping, not asked"; retirement writes one
  record ("agreement complete; further hauling is ordinary work") and post-retirement
  placements are counted; the stockpile is findable on the map; a tick-to-clock bridge.

## Still open

- Strict versus growing hold (with the hauling migration), see
  [NATIVE_INTENTS](../NATIVE_INTENTS.md#open-decisions).
- Character voice, refusals and pawn-to-pawn plans: next scene, not this spike.
- The medical alert cause and the post-retirement wood split: unrecorded, not claimed.

## Order of work

1. Un-draft and merge #68 and #69 as spike evidence with the findings.
2. Fix the three blocking items above.
3. Hauling migration through the same three gates (internals, design freeze, verdict).
4. Construction and cooking through blueprints and bills, so the next scene has a
   second thing to do.
