# A bounded addressed encounter

The operator/scripted core selects two locally visible pawns. It does not choose
what they say. One optional opener and one optional reply are each at most 240
characters. Either pawn may stay silent. No third turn, automatic conversation
pump, forced disagreement, or automatic retry is available.

The native bridge's existing reciprocal local sightings must support contact
both before inference and before delivery: current epoch/tick, same map, standing
and outside a bed, within the existing unfogged line-of-sight shortlist. Missing
visibility is unavailable contact, not proof the other pawn died or moved. This
is a coordinator-mediated encounter, **not a native social job or hearing model**.
Native chatter remains unchanged. Paused trials are not continuous-chat evidence.

Each encounter has an idempotent operator ID, expires after 3600 game ticks and
reserves its participants while a turn runs. An attempt is persisted before the
backend is called. Silence, malformed output, timeout, interruption and lost
contact terminate the encounter without delivering an answer or retrying it.
Restart/checkpoint closes unfinished attempts; paired rewind discards later
speech. A timeline admits at most 32 encounters; each pawn retains its latest 16
sent/received messages. There is no automatic eviction/reopening of encounter IDs.

Only the two participants receive delivered text, with speaker, recipient, tick
and message ID. Their subsequent decision/reflection/appraisal perspectives see
that correspondence. This is attributed speech, not a native fact, citation of
verified truth, automatic belief update, or new native relationship score. This
slice does not add message citations to the private-outlook update schema.
The observer crew log can show delivered speech, but is not shared crew knowledge.
Private contexts, silence and diagnostic errors are not published as dialogue.
An explicitly chosen utterance can disclose what its speaker chooses to say; the
system never copies the rest of their private perspective to the recipient.

A work request in speech creates no job or proposal. The scripted core's later
optional offers are preplanned, not extracted from messages; every offer still
needs the owner's independent acceptance. A changed later choice is not proof of
persuasion without a controlled comparison. We measure delivered messages,
later availability, selected choices and native outcomes separately.

## Trial

Build with `npm test`. Use `scripts/run-social-lab.sh fixture` on the exclusively
locked isolated lab to create the existing disposable wood/needs fixture. The
`game` and `cold` modes launch `trials/social-game.ts`; direct invocation fails
before game access. The host relay is `scripts/run-social-game.mjs CONFIG` with
`--scripted` for rehearsals and `--cold` for zero-inference restore verification.
Use a new receipt path and ledger for each newly authorized trial. Started
markers and the persistent `social-v1` allowance forbid replay/rerolls.

One run: at most four native Claude Max attempts (0.40 API-equivalent reservation,
not cash API billing), zero Jev calls. One optional opener/reply, then at most one
one-trip wood offer per participant, with no counter adoption. A missing current
wood opportunity skips that offer. Speech and decisions are paused; the game then
runs for two minutes (30 seconds for scripted rehearsal). Both silence and
refusal are valid. Total runner deadline six minutes; per-choice limit 45 seconds.
No live result is implied by the implementation or mocked tests.

## Recorded evidence, 2026-09-22

The final scripted rehearsal delivered a request and reply, then separately
refused Alvin's offer and accepted Beatrice's. One native trip delivered ten
wood. Rewind removed later speech; paired and full cold restore preserved the
retained exchange, decisions and outcomes.

In the single live run, Alvin mentioned hunger and Beatrice replied, "Morning.
Go find something to eat then." Both subsequently accepted independent,
preplanned one-trip wood offers. Two native trips delivered twenty wood. Both
later decision perspectives contained the two delivered messages; Pedro's
perspective contained none. No outlook was created. Four Claude Sonnet 4.6
attempts, zero Jev calls, no rerolls; all 94 samples during the two-minute native
window were unpaused. Speech and offer decisions themselves were paused.
Paired/cold restore passed without inference, including delivered text and the
observer log. This verifies delivery and continuity, not persuasion, an eating
plan, sustained conversation or a native relationship change.

All 220 automated checks passed. Independent Codex review caught three lifecycle
and cleanup issues; each received a fix and regression coverage, followed by clean
focused reviews. An intentionally injected contact-field leak failed the privacy
test. Historical databases stayed unchanged. Full perspectives and raw diagnostics
remain private; [sanitized evidence](evidence/social-exchange.json) records the
delivered speech, separate decisions, native outcomes and limitations.
