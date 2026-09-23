# Evaluation

How we test, what counts as evidence, and how trials are run. Results live in the
[trial ledger](trials/README.md).

## Kinds of evidence

Every claim is labelled by the strongest evidence behind it, and never promoted:

| Label | Means |
|---|---|
| implemented | code exists and unit tests pass |
| mock-tested | exercised with fake backends or transports |
| scripted-tested | exercised in the real game with scripted decisions, no models |
| offline model check | real model calls on frozen snapshots; nothing executed in a game |
| live-verified | real model calls in the real game, within one bounded trial |
| planned | not built |

A mock never supports a live, gameplay or UI claim. One run doesn't show generality,
an authored fixture is not a personality, and a single timing is not a benchmark.

## Rules for every trial

**Before any call**

- Freeze the protocol: fixture, question, call allowance, time limits and assessment.
  Offline suites are versioned and must match their canonical export exactly; a
  corrected bank gets a new version, and old runners only accept their own.
- For game trials: relevant automated checks → mod compilation when native code
  changed → a scripted, zero-inference rehearsal → at most then the live run.
  Offline-only probes need their own contract/runner checks, not a game launch.
- Each live trial gets its own ledger and allowance ([MODELS](MODELS.md#ledgers)).

**During and after**

- **No rerolls.** Failed, invalid and cancelled attempts keep their reservation and
  their record. A continuation may only use the remaining calls on the same state and
  ledger. Unused allowance stays unused.
- **Keep every failure,** including setup and fixture failures, labelled as what they
  are. Later fixes never rewrite earlier results.
- **Receipts decide.** Outcomes come from game receipts; a model's claim is recorded
  but not believed.
- **Persistence**: game-state milestones verify paired checkpoint restore and full cold
  restart with zero extra model calls. Offline-only work tests its own persistence
  where relevant and must not claim native restore verification. Earlier trial databases must stay byte-identical
  (checked by hash).
- **Review**: an independent read-only Codex review of the final behavioural commit;
  material findings are fixed and re-reviewed. Review reports stay private.
- **Privacy**: privacy boundaries are proven by fault injection (an injected private
  field must make the check fail). Saves, databases, raw reviews and raw
  diagnostics stay out of Git; evidence JSON is sanitized. Selected inspected
  player screenshots may be published as diary/site assets; diagnostic captures
  stay private.
- **Say what isn't claimed.** Every result lists its limits.

## Offline checks

Fixed snapshot suites run the same perspectives through Claude and Luna a fixed number
of times, with no game and no rerolls. They measure schema validity, invented IDs,
citation ownership, whether refusal and no-change options survive, latency and usage,
separately from gameplay. Suites live in `trials/` and `trials/fixtures/`;
`scripts/run-codex-contract.py` runs Luna.

Two scorers help read explanations. Neither ever vetoes a valid choice, and zero flags
is not a truth score:

- **`need-numbers-and-certainty-v1`** (`trials/grounding-score.ts`): checks numeric need
  claims against the perspective (within 0.5 percentage points: match, mismatch,
  unknown reference, unscorable context) and lists certainty phrases ("no risk",
  "will collapse") as review candidates, never as invented facts.
- **`typed-claims-v1`** (`trials/claims.ts`, prototype): scores explicit
  `fact`/`forecast`/`preference` claims with field assertions against the same
  projection the model saw. Verdicts are counted separately: `supported`,
  `contradicted`, `unknown_reference`, `source_missing`, `irrelevant_source`,
  `unscorable`, `forecast_unverified`, `preference_sourced`, `preference_new`.
  Qualitative bands are a scorer convention (low < 0.35 ≤ moderate < 0.7 ≤ high), not
  game semantics. It checks the assertion, not whether the assertion matches the
  prose. No production response carries claims yet.

## Legibility

Two early reads (one model reading an exported log, one reader working from
screenshots) found real gaps but did not scale: screenshot packs can't carry a
ten-minute scene. Future legibility checks need a recording of the scene (watched by
a person, or summarized by a video-capable model) and a protocol decided in advance.
The [first recording review](evidence/video-feedback-pilot.json) recovered the main
sequence but invented dialogue and misread ticks/quotes. Receipt checking helped but
also introduced an unsupported explanation. General legibility is not claimed.

## Running trials

All real-game runs go through launchers that hold the exclusive lab lock for their
whole lifetime; most entry points refuse to run outside their launcher. Android
emulation and RimWorld never run at the same time on the shared host.

- **Scripted game checks**: `RIMWORLD_LAB_ROOT=/abs/lab bash scripts/run-<name>-lab.sh
  game [<run-uuid>]`, then after a full stop/start `... cold` (the pawn-eating,
  food-observation and native-food launchers require a run UUID). Examples:
  `run-crew-log-lab.sh`, `run-pawn-eating-lab.sh`, and `run-rescue-lab.sh`, which
  also has `interruptions`, `native-log` and `outlook` modes.
- **Live split-host trials**: `node scripts/run-<name>.mjs <private config>` on the
  inference host, which reaches the lab over SSH and runs the matching
  `run-<name>-lab.sh` there. `--scripted` rehearses without models; `--cold` verifies
  the saved result after a restart with zero calls. The private config names the SSH
  target, lab root, remote checkout, ledger and scratch paths; it is never committed.
- **Fixtures** are created by `scripts/*-fixture.py` through the lab harness.
- **Operator diagnostics** such as `lab.py command food-diagnostics` read native state
  for the operator only; they never feed a model.

A finished run writes a receipt under `.runtime/`; the sanitized version goes to
`docs/evidence/` and a row in the [trial ledger](trials/README.md).

## Recorded-session review protocol

Use the retained uncut MP4, identified by hash. Freeze the model, prompt and questions
before inference. A **video-only pass** receives no receipts or expected events; it
reports timestamped observations, sources (map, speech or outcome record), uncertainty
and concrete readability problems. A second **receipt check** receives the unchanged
first answer and sanitized public evidence. It must distinguish facts missing from
the video from facts it failed to notice. The second pass is not an independent judge.
An author checks both accounts; neither output can change game state or override receipts.

`scripts/review-video.mjs <private-config.json> <new-private-attempt-directory>` is an
offline probe, run only through the protected gateway. The config supplies `model`,
`phase` (`video-only` or `receipt-check`), `prompt`, `videoPath` and `videoSha256`.
The initial model is pinned to `google/gemini-3.8-flash`; changing it is a new protocol.
The request carries native `video_url` base64 input, not a screenshot pack. Upstream
default video processing is used; no specific sampling rate is claimed. Provider
fallbacks and automatic retries are disabled. The deadline is 180 seconds, output
limit 6,000 tokens, input clip limit 10 MB and response-body limit 256 KiB.

Credentials remain behind protected gateway egress. The probe refuses proxy exclusions
and conflicting lowercase HTTPS-proxy settings, never follows redirects, and retains
only selected response fields—not headers, hidden reasoning or raw transport errors.
Attempt directories are exclusive. An unresolved `reserved` receipt after interruption
or a persistence failure means a request **may have happened**; inspect before further
work. This is a supervised calibration tool, not unattended scheduling or a replacement
for the character ledgers. Inspect model text before publication.

Run `node --test scripts/review-video.test.mjs` for the transport and retention checks.
Model summaries help navigate footage; human feedback remains optional timestamped
observations, not a compulsory retelling. A scripted clip tests presentation and the
review method, not live agency or whether the game is engaging.
