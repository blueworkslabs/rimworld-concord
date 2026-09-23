# Self-care receipts, recipients and topic closure

This is a focused mechanics follow-up to [the first live eating trial](EATING_FOLLOWTHROUGH.md).
That trial remains unchanged: Alvin consumed 12 berries, one summary confused items
with nutrition, and Beatrice's reply named Pedro but was delivered only to Core.

## Contract

- Public self-care records now identify the food stack/label, selected portion,
  consumed count and `consumedUnit: "food-items"`. Count means individual items,
  not nutrition points. The player log likewise says food items.
- A core-question response includes an explicit delivery description: from the
  responding pawn, to Core, with no forwarding. This describes existing routing;
  it is not a new send-message action. Naming another pawn in either `say` or
  `eat` text does not change the recipient or issue movement.
- Self-care receipt IDs can source topics. A receipt and its exact originating
  question/reply are eligible for `resolved` only when every associated self-care
  receipt confirms completed eating with a matching ID, pawn, kind, food stack,
  portion count and positive integral consumption no greater than that portion.
- An existing topic's linked work must also satisfy the existing completion rule.
  Eating cannot hide pending, failed, refused or otherwise unfinished work. A
  self-care-linked topic cannot become `declined` merely because work was refused.
- Missing, started, failed, interrupted or mismatched receipts do not resolve
  self-care. A spoken promise or improving Food band is not a consumption receipt.
- The broad brief, unrelated messages and other pawns' needs are not automatically
  linked. Resolved means this bounded action and its linked work completed, not
  that every goal stated in the topic's prose has been achieved.
- The core still chooses whether to update an eligible topic. There is no automatic
  relabelling of earlier trial results or historical databases.

Links derive from durable self-care/question records; no stored-topic migration,
new consent path, threshold/diet change or new live-trial allowance is introduced.
Older core snapshots without self-care remain readable.

## Verification scope

Automated checks cover units, actual recipient routing, schema/runtime closure
agreement, absent/malformed/interrupted receipts, multiple linked actions,
unfinished work and paired rewind/restore. Existing work-topic closure and consent
regressions remain in the full suite.

The existing exclusive-lock native eating launcher is extended with four scripted
cases at 20% Food: speech only, eating, pawn withdrawal and operator cleanup. It
checks early closure rejection, completed eating versus interruption, refusal to
close the broad brief, message non-forwarding, paired rewind and full restart.
No character-model or Jev calls are part of this change. Scripted success cannot
establish that a model will interpret the clearer fields correctly or close topics.

## Scripted native result

Reviewed behavior `baa3544daa0ff6b8eeee101f20d7ff79e9710498`.
All four real-game cases passed their paired checks:

- Speech only: zero consumption, reply stays addressed to Core even though it
  names Pedro; its topic cannot resolve.
- Explicit eating: 16 berries consumed, Food rose above .8, completed receipt
  identifies berries and food-item units. Its reply-sourced topic resolved.
- Pawn withdrawal and operator cleanup: zero consumption, interrupted receipts,
  closure rejected. These are distinct stop reasons, neither is completed eating.
- Early closure and broad-brief closure were rejected in every applicable case.
  Rewinding removed the later topics/action; restoring recovered their exact state.

The count differs from PR54's 12 berries because this mechanics fixture starts
Alvin at 20% Food rather than the live trial's 40%. It is not a rerun or replacement
of that live result. No character-model, Jev or editorial-model calls were made.

330 Node and eleven Python checks passed. Independent final-behavior source review
found no actionable defect and verified actual read-only enforcement. Its focused
compiled tests/typechecking passed. The reviewer's full build was blocked by writes;
its broader compiled-suite attempt was not green and is not counted as a passed
check. The full author suite is separately recorded as 330/330.

[Sanitized native outcomes and verification](evidence/selfcare-followup.json).
No separate diary entry for this focused follow-up; the prior live diary remains
unaltered. Live interpretation of these clearer fields remains untested.

All four cases also passed full restart, retaining exact core state, self-care and
outcomes. All 230 historical database-related files are unchanged; staging is
stopped. The saved Records panel was inspected and displays food-item units.
