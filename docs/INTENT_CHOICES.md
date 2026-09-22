# Explicit executable reflection choices

The previous live follow-up returned `continue` while its explanation promised
withdrawal and rescue. That result remains unchanged. This increment reduces
ambiguity at the model boundary; it does not claim to solve semantic consistency.

## Effect first, explanation second

Claude reflections now select one explicitly named provider choice:

- `keep_current_activity`: leave the current agreement/native behavior unchanged.
  No withdrawal, fresh acceptance or replacement job is authorized.
- `withdraw_current_agreement`: end the exact `agreementId` supplied in this
  pawn's running intention. This does not authorize rescue or other replacement work.
- `answer_pending_proposal`: accept, refuse or counter one supplied pending offer
  when the pawn has no active agreement/commitment. A counter creates no job.

The prompt supplies eligible choices with deterministic effect descriptions.
The output schema describes the same effects and asks for an explanation of the
selected choice, not a separate plan. The adapter validates agreement/proposal
scope and maps the choice to the existing canonical reflection protocol.
The coordinator rechecks the captured agreement before applying withdrawal;
ordinary acceptance still needs current ownership and native dispatch checks.

No additional judge model, prose keyword parser or automatic correction call is
introduced. Contradictory prose cannot grant action authority. We deliberately
retain a test in which a `keep_current_activity` explanation promises rescue:
it remains continuation, not an inferred withdrawal. Clearer names and instructions
can reduce confusion but cannot prove arbitrary free text matches its choice.

## Evidence, compatibility and limits

Private receipts retain the structurally valid provider choice, including a
choice rejected for scope, alongside canonical returned responses. Rejected
calls retain their accounting. Receipt updates share the serialized inference
lane, and game application remains distinct from provider completion.
Historical canonical reflections and saves require no migration. New Claude
reflection output uses the explicit provider vocabulary; other backend interfaces
remain unchanged. No native mod changes or additional character tools are needed.

The follow-up reuses the authored [reconsideration scenario](RECONSIDERATION.md),
with a distinct `intent-v1` policy, ledger and runtime prefix. Invoke the existing
locked runner using `run-reconsider-game.mjs /private/config.json --intent`;
`--scripted` exercises the same choice validator/translation without inference,
and `--cold` verifies this run after restarting the game. `--intent` and
`--relevance` cannot be combined. Existing historical policies remain separate.

Fixed ceiling: six Claude attempts, four Jev appraisals, at most two minutes of
continuous observation with the existing settled-branch early stop after fifteen
seconds. One discovery-triggered reflection; initial consent is paused. No
personality overrides, repeated choices or rescue requirement. The run can choose
continuation, withdrawal, refusal or counters; a changed outcome alone would not
prove that the new labels caused better reasoning. We compare provider choice,
explanation, canonical response and actual work, and preserve disagreements.
