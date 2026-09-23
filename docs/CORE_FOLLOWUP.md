# One in-game core follow-up

Fresh `core-followup-v1` trial after PR43's corrected-contract check. This is not
an extra run appended to the earlier three-run campfire experiment.

## Frozen protocol

- One live run: at most four core and five pawn attempts, zero Jev, no rerolls.
- Native Claude Max, unchanged tool-free adapter/model; separate immutable
  core/pawn ledgers reserve 0.40/0.50 USD API-equivalent, not cash billing.
- Two minutes of native activity; deliberately pause for each inference (45s
  decision limit), 15-minute game-runner wall deadline plus bounded cleanup.
- Same corrected campfire-v2 fixture: original skills/traits; Food .40/.65/.55,
  Rest .90; no ready meals/stove, 225 raw berries with native health60.
  Native self-care stays enabled; ordinary work priorities remain disabled.
- Original open coordination brief, unchanged opportunity menu and optional
  questions. Do not force an opening question, a particular recipient, refusal,
  construction or cooking. If the core proposes work first, record that branch.
- An answered question is a meaningful event eligible to wake the core after
  its cooldown. Requests/replies alone never create a job. Work requires fresh
  pawn consent and execution-time native checks. Wait is legitimate.
- Unused call slots stay unused. Preserve every invalid answer, timeout,
  refusal, silence, interrupted job and native outcome; no repair-and-rerun.
- At window end, retire outstanding offers, stop owned work, save/restore paired
  state and then verify full cold restart with zero extra calls. Partial projects
  and failed outcomes remain evidence, not completed work.

## Verification and interpretation

Run the separately labelled scripted rehearsal first (15s native): ask Alvin,
receive an authored preference to eat, then wait. This verifies the communication,
reply-triggered follow-up and persistence plumbing; it is not character behavior.
Fresh independent Codex review and applicable tests precede live inference.
Both native modes must hold the coordinator lock for their lifetime; direct
entry and an already-held lock must fail before game transport.

Capture initial, midpoint and final player views. These are documented artifacts,
not another blind reader study; the human already knows the protocol. Inspect
native receipts separately from prose. An accepted question is not proof of
useful planning; a valid work proposal is not completed construction or cooking.
Report whether the core actually saw and responded to a voluntary reply.

The game's changing state may consume an ingredient source or remove a grounded
option. Keep those facts rather than requiring a campfire storyline. This paused
trial does not add continuous-inference evidence.

## Launch

After fresh finite operator authorization, prepare private absolute-path host
configuration as for the prior campfire runner. Deploy the compiled build and
`run-core-followup-lab.sh`, retain the existing v2 fixture metadata, then run:

```
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted --cold
```

The live run uses its own fresh output/ledger configuration, omits `--scripted`,
and uses the same `--cold` configuration after a full stop/start. Never reuse or
reset historical allowances. Rehearsal and live run have separate run IDs,
receipts and checkpoints. Stop staging at handoff.

## Recorded result

The one live trial used **four core attempts and three pawn replies**. It is a
mixed result (`inferencePassed=false`), not an all-green planning run:

1. Core asked Alvin about food. His delivered reply requested help. His claim
   “I've been focused on building” is unsupported by supplied history; his
   current job was wandering. A construction skill/option is not work history.
2. That reply triggered the next core turn, which asked Beatrice about food and
   help. She volunteered that she could try cooking and suggested checking
   stockpiles. This was speech, not cooking consent.
3. Her reply triggered another core attempt. It returned an ask-Pedro choice
   with a null topic link, but the provider reported **three internal turns**
   against the adapter's two-turn bound. Parsing rejected it before delivery.
   No guard was weakened; the CLI turn-count discrepancy remains unexplained.
4. A later change in Pedro's shared Food band admitted the fourth turn—not an
   immediate replay of the failed attempt. Its question reached Pedro. He
   replied that he could haul if needed. No work agreement resulted.

**Zero work offers, jobs, campfires or meals.** All87 native samples were
unpaused outside deliberate inference pauses; native observation lasted120528ms.
No Ingest job was sampled; sampling is not a complete eating-event history.
The fourth turn exhausted the core allowance; two pawn slots stayed unused.
API-equivalent reported usage: core0.2581194 + pawns0.067866 USD, not cash billing.

Paired and full cold restore passed, preserving the failed attempt and consumed
allowances without extra calls. Final scripted rehearsal and paired/cold checks
also passed: authored ask, preference reply, then wait. All294 Node checks and
independent full/focused review passed. Review caught shared artifact filenames
and an omitted launcher in the deployment digest; both are fixed. A launcher-only
mutation changes the digest. All219 historical database-related files are
unchanged. Staging is stopped.

[Full retained outputs, failure metadata and public records](evidence/core-followup.json).
No new blind-reader study was performed. The existing panel still does not
explain why coordination stopped at a failure or exhausted allowance.

## What this does and does not establish

A voluntary reply now reaches the core's next in-game decision, and all three
pawns spoke. This is not evidence of a productive plan, independent personalities
or live construction/cooking. The core attributed Alvin's building claim as
speech; it did not create a completed-work record from it.

The available menu listed campfire build/wood-haul options but no cooking option.
Inspection confirms a concrete information gap: native production supplies are
collected for executable work options, so food ingredients are not separately
exposed before a usable campfire exists. Missing food options are not evidence
that food is absent. This gap does not prove why the model chose only questions.

Next: inspect the provider turn-count discrepancy without weakening validation,
and add genuinely grounded food observations/prerequisite information separate
from immediately available jobs. No such fix or additional trial is included here.
