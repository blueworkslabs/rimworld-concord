# Typed claims prototype (offline)

`trials/claims.ts`, versioned `typed-claims-v1`. A post-hoc scorer for replies that
carry structured claims beside their prose reason. It has no route to a coordinator,
changes no production response schema, makes no model or game calls, and grants or
blocks nothing. The existing `need-numbers-and-certainty-v1` scorer, bank and
evidence are untouched.

## Why claims rather than citations

A citation proves a source exists. It does not prove the source supports what was
said. A typed claim carries an explicit assertion the scorer can compare against the
same semantic perspective the model received:

```json
{"kind":"fact","text":"Food is at 40%","subject":"Food",
 "source":"pawn.needs.Food.fractionFilled","assertion":{"op":"eq","value":40,"unit":"percent"}}
{"kind":"fact","text":"I am very hungry","subject":"Food",
 "source":"pawn.needs.Food.fractionFilled","assertion":{"op":"band","value":"low"}}
{"kind":"forecast","text":"the job could stall mid-way","basis":["pawn.needs.Food.fractionFilled"]}
{"kind":"preference","text":"I prefer to meet my own needs first","source":"character.outlook.notes[0]"}
```

Three kinds, deliberately separated because they fail differently:

- **fact**: an explicit assertion about a supplied field. Checked mechanically.
- **forecast**: a prediction. Never validated; counted, and its cited basis is
  existence-checked. Beatrice's "no risk of stopping early" and Claude's "I'd
  collapse" both land here rather than being scored as invented facts.
- **preference**: a value or stance. May cite an outlook note or native trait, or
  cite nothing. A new preference is allowed and counted, never an error.

Labels are model claims too. A fact whose text reads like a prediction, or a
forecast whose text reads like a present-tense reading, is flagged `labelSuspect`
without changing its verdict.

## Source catalog

`sourceCatalog(view)` flattens the output of `modelPerspective` into citable ids:
need meters (with `known`), native facts/traits, pawn flags, outlook notes,
experiences by sequence, hauling supplies, offer fields and agreement progress. It
is derived from the projection the model saw, never from game state, so a claim
cannot be "supported" by information the pawn was not shown.

## Verdicts

One per claim, counted separately, never summed into a score:

| verdict | meaning |
|---|---|
| `supported` | fact assertion agrees with the supplied value |
| `contradicted` | fact assertion disagrees with the supplied value |
| `unknown_reference` | field exists but its value is unknown |
| `source_missing` | cited id is not in this perspective |
| `irrelevant_source` | cited id exists but its subject is not the claim's subject |
| `unscorable` | well formed, outside the comparable grammar (trend words, band on non-need, qualitative op on numeric field) |
| `forecast_unverified` | every forecast |
| `preference_sourced` | preference cites an existing outlook note or trait |
| `preference_new` | preference cites nothing |

Assertion grammar: `eq`/`ne` with fraction or percent units and a bounded tolerance,
`lt`/`lte`/`gt`/`gte`, `band` (`low` < 0.35 ≤ `moderate` < 0.7 ≤ `high`, a scorer
convention that is not game semantics, need meters only), `is` for
string/boolean fields, and `unknown`. `band` and `is` accept `negated`.
Claiming a field is unknown is itself checkable in both directions.

## Coverage, honestly

Every report carries `coverage`: claim count, reason length, claim text length,
`unscoredProse: true` always, sources available and sources cited. A reply with
zero claims and zero contradictions has learned nothing about its prose. The
scorer measures only what the model chose to assert; a model that asserts little
is not thereby more grounded. Deciding how much of a reason must be covered by
claims is a policy question for the bank, not something this scorer answers.

## Reviewer-encoded examples

`trials/claims-examples.ts` hand-encodes five retained replies (four from
`docs/evidence/outlook-grounding.json`, one from the Luna contract probe) to show
what the scorer would report had the model emitted claims. These encodings are
authored by a reviewer, are not model output, and prove nothing about either model.
They illustrate three things: qualitative words become checkable where the numeric
regex saw nothing (Luna's "very hungry" scores as a supported band fact), forecasts
are separated from facts (Claude's collapse line is counted, not falsified), and the
scorer checks the assertion rather than whether the assertion captures the prose
(an encoding of "nearby" as `sourceCount > 0` is supported and also wrong).

## Limitations

- Offline only. No production schema change; a live claims field needs its own
  prompt-size accounting, provider schema dialects and a fresh finite allowance.
- The model can omit, mislabel or under-assert. Coverage exposes this; nothing
  penalizes it automatically.
- Band thresholds are a convention. Trend words ("dropping"), motives, others'
  intent and outcomes remain unscorable.
- The two review hypotheses from 2026-09-22 (the empty-outlook split reflecting a
  low-stability baseline; the stop-rule wording prompting "collapse" forecasts)
  are hypotheses. Two repetitions cannot establish either. This scorer would make
  the second testable by counting forecasts per case before and after a wording
  change, under a new bank version and allowance.
- No hosted grader, no model judge, no model ranking.
