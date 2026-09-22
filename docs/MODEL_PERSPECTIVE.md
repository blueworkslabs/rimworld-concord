# Self-describing pawn perspectives

The native protocol and saved facts remain unchanged. One pure model-facing
projection is shared by Claude deliberation, Jev appraisal and the offline Codex
case exporter. It derives no facts from outside the supplied pawn-owned view.

## Meaning beside the data

Native need facts use `CurLevelPercentage`: 0 empty, 1 full. Model input groups
these into named meters, with `fractionFilled`, `percentFilled` and
explicit direction text. Food 0.9 means well fed, not 90% hungry; Rest 0.9 means
well rested, not 90% tired. Mood is a mood meter, not a diagnosis or proof of a
mental break. Other native needs retain their names and normalized fill.

Food, Rest and Mood each explicitly report missing values as `known:false` and
null fill, never zero. Nonfinite/out-of-range or duplicate readings also become
unknown with a reason. Other native facts and the owner's memories/outlook stay
in their original scope. This display transformation mutates neither the input
nor the game state. It grants no new observation or action authority.

The short shared system prompt describes identity, evidence boundaries and
response discipline. Applicable action meanings accompany supplied proposals,
options and choices, rather than every pawn receiving every hauling/rescue rule.
Consent, counters, replacement cancellation and actual completion remain distinct.
Outlook replacement/citation rules are attached to the optional private-update
choice. Native/runtime validators remain authoritative after the answer arrives.

## Broader fixed bank

`trials/perspective-cases.ts` defines six authored snapshots, repeated twice in a
fixed order: full needs, low needs, unknown needs, observed insult/low mood,
limited supplies, and observed recovery. Each model gets the same perspective,
choice effects and system instructions; provider-specific schema dialects and
native runtime overhead differ. No scoring rubric is sent to the model.

Twelve attempts per model maximum, one per listed case/repetition, 60 seconds
per case; no repair/reroll. Claude uses its native Max adapter and a new immutable
`perspective-v1` ledger (12 attempts, $1.20 API-equivalent reservation, not cash
billing). Luna uses the tool-free native subscription probe from
[the earlier contract check](MODEL_CONTRACT_PROBE.md), with a separate fixed suite
identity. No API billing fallback, Jev calls, game actions or staging launch.

Prepare the bank/catalog with `scripts/prepare-perspective-cases.mjs` after a
build. Run only under a fresh finite operator allowance:

```sh
node dist/trials/run-perspective-claude.js PRIVATE/cases.json PRIVATE/claude --live
python3 -B scripts/run-codex-contract.py PRIVATE/cases.json PRIVATE/catalog.json PRIVATE/luna --live
```

Both runners refuse an existing started marker, preserve spent attempts and stop
on transport/adapter failure. Outputs and manual adjudication are private until
sanitized for publication. Assess schema/runtime validity, IDs/citations, prose
versus choice, unsupported factual claims and latency separately. Refusal, no
change and optional outlook revisions are not failures by themselves. Two runs
per case are a smoke test, not enough to rank models or estimate reliability.

This is breadth in offline perspectives, not three new playable scenarios. A
second native scenario and consequential social exchange remain future work;
keeping the core scripted is an explicit development choice.
