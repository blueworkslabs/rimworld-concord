# Live check of self-care follow-up closure

## Frozen protocol

One `closure-followup-v1` trial on PR55's clarified units, reply destination and
receipt-linked self-care closure. Prior results and allowances remain unchanged.

- Six core attempts and six pawn attempts maximum; fresh immutable ledgers reserve
  0.60 USD API-equivalent each on the native Max route. Zero Jev, no operator
  rerolls, unused attempts remain unused.
- Two minutes of native activity with explicit inference pauses; 45-second
  per-decision limit and 15-minute runner deadline plus bounded cleanup.
- Same campfire-v2 fixture/open brief as PR54: starting Food .40/.65/.55, Rest .90,
  225 raw berries, no ready meals, unchanged personalities/skills, native self-care
  enabled and ordinary work priorities disabled.
- No live question, recipient, eating choice, work proposal or closure prescribed.
  Speech, silence, eating, work and waiting remain valid outcomes.
- Scripted rehearsal uses the same relay: typed eating, real consumption, then
  receipt-sourced topic resolution. Broad brief must stay open. Thirty seconds of
  native activity, zero inference; paired and cold restore before live.
- Live results distinguish inference validity, physical outcomes, quantity/unit
  grounding, actual message recipients, eligible versus applied topic closure,
  and persistence. A correct result in one authored situation is not reliability.
- End with owned-action cleanup, paired/full restart without calls, then stop staging.

Use the existing locked `scripts/run-core-followup.mjs` launcher and separate
private scripted/live configurations with `policy: "closure-followup-v1"`.

```
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted
# Full restart, then:
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted --cold
# Separate fresh live configuration: omit --scripted; then cold-check it.
```

After this run, pause implementation for the user's requested team recap and
planning. Do not automatically open another trial or capability milestone.

## Retained live result

All **six core attempts and two pawn replies** passed; zero failures, formatter
recoveries, Jev calls or operator rerolls. Four unused pawn slots stayed unused.
Alvin selected a supplied eating option and consumed **12 berries**. Pedro later
selected the same stack and consumed **10 berries**. Both are native receipts for
pawn-owned choices, not speech interpreted as commands. Beatrice received no
question in this bounded run; that is not a refusal.

The core first waited while each action had consumed zero. After each completed
receipt, it resolved that pawn's question, reply and receipt topics: **six topics,
two eating actions**, not six jobs. All six applied closures survived restore.
The broad `brief` topic stayed open. No work proposal, campfire or cooking followed.
Raw food was an explicitly legitimate alternative, not a failed required recipe.

The exact window was 120,945 ms of native activity with inference paused. The
six-turn allowance ended at tick 2693; later native observation did not authorize
more calls. Its final needs summary is timestamped, not a claim about the end of
the whole observation window or indefinite food security.

### Grounding and routing limits

- Some explanations correctly say “12 berries” or `food-items`, but repeated topic
  summaries say “12 of 12 portions” and “10 of 10 portions.” These were individual
  food items in one portion per action, not twelve or ten portions. Clearer fields
  did not eliminate prose errors.
- Early summaries say pawns “report” need bands, although the source was shared-link
  telemetry; “no campfire present” also drops the local-sighting qualification.
  Later wording explicitly attributes telemetry. All original wording is retained.
- Both replies went to Core; neither addressed a different pawn in prose. This is
  not a fresh adversarial test of naming-versus-routing or evidence of forwarding.
- One authored, paused-inference run demonstrates receipt-backed follow-up; it
  does not establish general planning, a full cooking chain or long-term character.

## Verification and publication

331 Node and eleven Python checks pass. Independent final-behavior Codex review
completed with substantive source inspection and actual denied-write evidence;
no actionable findings. Review details remain private. Scripted rehearsal consumed
12 berries, closed its receipt topic while leaving the brief open, and passed
paired/full restart with zero model calls. Live paired/full restart also passed,
including self-care records, applied core state and unchanged consumed allowances.
All 230 historical database-related files are unchanged; staging is stopped.

[Complete retained evidence](evidence/closure-followthrough.json) includes the
model outputs, supplied situations, native samples, receipts and applied topics.
No separate diary entry for this focused follow-up. Earlier trials remain intact.
The next step is the requested team recap and planning discussion, not an automatic
new model allowance or implementation milestone.
