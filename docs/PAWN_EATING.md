# One pawn-owned portion

## Contract

A pawn answering a core question may now choose `eat` with one supplied food-stack
ID and a short addressed message. `say` and `stay_silent` remain non-executable.
The core cannot propose eating, select a portion for a pawn, or turn a promise
into a job. This first entry point is **question answering only**; autonomous
reflection and eating during an existing agreement are not added.

Options are a bounded local, line-of-sight shortlist, not an omniscient pantry.
The first supported foods are berries and simple meals. Native code computes a
portion from current nutrition wanted, capped at 25 units and available stock.
The choice authorizes **up to that portion**, not another stack or another meal.
The coordinator checks the option both before and after inference. It rejects
invented IDs, increased portions, changed maps, and existing commitments or
pending work offers. The actor comes from the addressed pawn, never model output.

Native execution repeats availability, diet, forbidden, ingestibility, visibility,
reachability and reservation checks. It bypasses only the *autonomous selection*
minimum food-preference threshold; it does not change the diet or native hunger
thresholds. A pawn can deliberately select raw berries before urgent hunger.
No drug, corpse, dispenser, harvest, or arbitrary food-selection API is added.
Native self-care remains available outside these actions.

## Execution and evidence

The coordinator persists a separate self-care record and commitment before
sending the exact native job. Lost replies reconcile the same action ID; they do
not invent a new action or re-ask the pawn. Native ingestion performs pickup,
chewing, nutrition and mood effects, without collecting extra food stacks.

At the native ingestion step, a receipt records the actual reduction in the
chosen carried portion and the pawn's nutrition-consumed record. A job ending,
a vanished stack, or the pawn saying it ate is not sufficient completion evidence.
Native job changes, lost availability, a 1,800-tick deadline, or pawn-bound
withdrawal interrupt the action. There is no automatic retry. Withdrawal does
not undo consumption that already completed.

The crew log separates the choice, started receipt and confirmed consumed count.
The core sees a minimal self-care outcome projection, not exact private need
meters or private notes. Terminal outcomes can wake it under the existing finite
scheduler; they do not automatically resolve a work-linked topic.

Checkpoints retain the existing quiescent rule: reconcile or stop active actions
before saving a paired checkpoint. Rewind restores both game and character state;
late answers from an abandoned timeline cannot start eating.

## Verification

The matched native checks start Alvin at 20% Food, with the same 225 berries
available. Each case has twenty seconds of ordinary gameplay:

- Speech only: no action receipt, no berries consumed; Food fell to 18.4%.
- Explicit eating: a 16-berry portion was consumed by `Concord_Eat`; Food reached
  about 97.8%, and the completed receipt recorded 16 consumed units.
- Explicit eating followed by pawn-bound withdrawal while paused: interrupted,
  zero consumed, all 225 berries remained, Food fell to 18.4%.
- Shared operator trial cleanup: the same zero-consumption interruption, explicitly
  labelled as operator shutdown rather than a voluntary withdrawal.

Duplicate dispatch did not start another action; mismatched IDs and old epochs
were rejected. Paired rewind and restore preserved each branch. These are
**scripted choices in the actual game**, not a live model choosing self-care.
Simple meals share the implemented path but the native consumption test uses
berries; no live campfire-to-meal planning result is implied.

All four final-build cases passed paired and full cold restore. 324 Node and eleven
Python checks pass; independent Codex review covered the final behavior, including
relay, resolved-counter and shared-cleanup fixes. All 228 historical database-related
files are unchanged. [Retained evidence](evidence/pawn-eating.json) includes the
earlier scripted rehearsals as well as the final four cases.

The locked operator runner is `scripts/run-pawn-eating-lab.sh game UUID`, followed
by `cold UUID` after full restart. `RIMWORLD_LAB_ROOT` must identify the private
lab. It creates fresh receipts and a disposable matched-hungry fixture; previous
saves, trials and allowances remain unchanged.
