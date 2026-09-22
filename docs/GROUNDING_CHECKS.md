# Narrow grounding diagnostics and matched outlooks

The offline `concord-outlook-check-v1` bank contains six fixed snapshots, each
repeated twice. Full, low and unknown needs come from the corrected v2 fixtures.
Three additional snapshots hold the pawn (Ari), world, Food 0.4 / Rest 0.9, exact
wood offer and prior experience constant. Only the private outlook differs:
empty, cooperation-oriented, or protective of time for personal needs. All have
revision 1 and the same evidence/available-choice schema. There is no casualty.

The prior experience is authored: the core once offered work while Ari felt
hungry; Ari declined and the offer closed. Both outlooks are interpretations of
that same experience. They are not learned character histories or native traits.
The rubric is retained with the fixture but never sent in the prompt. Each case
runs in a fresh context. Model order is fixed; two repetitions do not rank models
or measure a reliable effect size. An unchanged action alone does not establish
that the outlook was unused. Compare reason and scope as well, without requiring
any desired choice.

## Mechanical scorer boundaries

`trials/grounding-score.ts` is versioned `need-numbers-and-certainty-v1`. It is
post-hoc, offline and has no route to a coordinator. It compares explicit numeric
Food/Rest/Mood fill expressions against named fields from the supplied semantic
perspective. It reports numeric match, numeric mismatch, unknown reference or
unscorable context; a half-percentage-point tolerance permits rounded readings.
Only its narrow grammar is covered. Known quotes/conditional/history markers are
excluded conservatively. It does not extract all claims or prove full prose
entailment. Numeric correspondence is not an overall groundedness verdict.

Certainty phrases such as “no risk,” “guaranteed” and “will collapse” are separate
review candidates, never automatically counted as invented facts. Obvious
negated guarantees are excluded. More subtle negation, quotes, motives, metaphors,
qualitative need descriptions and outcomes still require manual review. Reports
must retain that uncovered prose explicitly; zero flags is not a perfect score.
No weighted overall truth score or automatic rejection of pawn choices is added.

Source IDs identify reference fields for the numeric check. They are NOT new
model-authored citations. Adding `groundedOn` to the gameplay interface is deferred:
an existing citation proves that a source exists, not that it supports the claim.
A future citation experiment needs typed claim support checks and honest coverage
measurement; it must not grant action authority or force private notes into speech.

This local design is consistent with the distinction between simple string checks
and more capable graders in [official OpenAI documentation](https://developers.openai.com/api/docs/guides/graders).
It uses no hosted grader API or model judge.

## Accounting and finite execution

The native Claude adapter now records per-attempt authored request bytes:
system instructions + serialized perspective/contracts + output schema. Luna
records those plus its explicit fixed developer instruction. These are UTF-8 bytes,
not token counts, cost, hidden client framing or equivalent provider tokenization.
Schemas differ in provider dialect. No inference content, choice semantics or
native limits change merely to collect these sizes.

The fresh `outlook-check-v1` policy permits twelve native Claude attempts, reserving
at most 1.20 API-equivalent USD; native Luna has twelve single-turn cases, one each,
with transport retries disabled. Each case has a sixty-second deadline. No Jev,
API billing fallback, game action or scenario reroll. All responses/errors are
retained. Runners verify the entire canonical bank before inference and persist
attempts before starting them; started output directories cannot be replayed.
Tool-free native Codex mock preflight is mandatory. Old case banks/ledgers remain
unchanged. The core is still scripted; staging stays stopped for this evaluation.
