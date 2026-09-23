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

Results pending.
