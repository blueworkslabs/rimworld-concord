# Continuous-play diagnosis and escalation calibration

## Frozen offline protocol (2026-09-24)

Source: the unchanged [PR61 evidence](evidence/luna-ongoing-integration.json).
Select public core input indices **1, 3 and 5**, before any new inference:

- **Eligible recipients**, tick 1184: Beatrice and Pedro can receive a question.
  Waiting is legal; saying that no question is available contradicts this snapshot.
- **Newer testimony**, tick 2797: Pedro's current Food band is low, his question is
  answered, and his reply is addressed to the core. Earlier topic prose is not
  current telemetry. Local berry sightings from other pawns do not establish Pedro's
  current access, and his reported fungus is testimony, not a consumption receipt.
- **Completed self-care**, tick 5750: Beatrice consumed nine food items, permitting
  three linked closures but not the broad brief. Alvin and Pedro remain low; Beatrice
  is an eligible question recipient. Choosing not to question her is legitimate.

These are deliberately selected development cases from one trajectory, **not a
held-out benchmark**. The completion case is a positive control for receipt-backed
closure, not a claim that its entire historical explanation was correct. Each model
gets one fresh, ephemeral call per case: `gpt-5.6-luna` then `gpt-5.6-terra`, both at
low effort and default service tier through native Codex subscription authentication.
Prompts, schemas and instructions are identical within each pair, generated from the
unchanged public view with the current production request builder. Neither model
sees the other's answer, expected labels or private pawn/operator state. Old planner
topics inside the saved input remain unchanged, including their inaccuracies.

Six calls is the size of this comparison, **not a restored gameplay turn cap**.
No replacement answers, game launch, action application, Jev or Sol calls. A failed
transport, isolation check, invalid answer, operator stop or 110-second helper
deadline stops the suite. The helper also bounds its inference turn to 60 seconds.
Every slot is recorded before launch; directories are exclusive, and an interrupted
reservation remains uncertain rather than replayable. Original PR61 failures stay
unchanged. The native zero-tool request preflight runs separately before each call.

## Assessment decided before inference

Keep schema/context validation, factual explanation, decision preference and timing
separate. Inspect all topic text, action text and reasons manually against the exact
input; report quotations and source field paths for material contradictions. Track:
recipient eligibility; fresh Food bands; answered versus unanswered questions;
testimony versus observation; consumption count/unit; supported topic closure; and
local versus map-wide knowledge. Other prose must be inspected too; ambiguous or
unverified interpretations are labelled, not forced into pass/fail. This is author
adjudication, not an automatic prose truth detector or blind quality study.

Any supplied legal action—including waiting or optional raw food—is valid. Choosing
to ask more questions or construct a campfire is not automatically better. Record
latency and reported subscription tokens, not invented cash cost. A more expensive
model's agreement, confidence or fluent prose is not ground truth. One answer per
case cannot estimate reliability or calibrate numerical routing thresholds.

## Availability diagnosis boundary

Alvin's first historical answer selected a genuinely supplied 12-item berry option.
The coordinator later rejected it with `Eating option changed or pawn committed`.
That branch combines missing current option, increased suggested portion and map
change; option filtering also covers commitment and availability. The exact fresh
revalidation view is not retained, so this record cannot identify which predicate
failed. A new mock regression demonstrates that an otherwise identical option whose
suggested portion grows from 12 to 13 is rejected. **It does not prove that happened
in the historical run.** No runtime rule is changed here.

Alvin's second answer selected a supplied 16-item option and passed coordinator
validation. The native receipt reports zero consumption and a combined failure for
food, portion, diet, availability, map or reservation. The request shows the stack
twelve cells away along one axis, at the local radius boundary. Motion out of range
is plausible, but the exact native validation state is not retained: neither motion
nor any other individual cause is established. The stack was not necessarily gone.

These are state-validation failures, not evidence for stronger-model escalation.
Record reason-specific validation diagnostics before attributing causes. Keep them
operator-side unless the knowledge contract explicitly permits public disclosure.
Do not weaken consent, reserve food while a pawn is merely thinking, or pause the
game just to make a model answer succeed.

## Running the offline comparison

Build with `npm run build`, then export with
`node scripts/export-ongoing-grounding.mjs > /private/bank.json`.
Supply a private JSON object mapping the two pinned model names to absolute isolated
catalog paths. Each catalog contains only that exact installed model, with direct
tool mode, multi-agent disabled and search disabled; these are metadata, not secrets.
Run `node scripts/run-ongoing-grounding.mjs /private/bank.json /private/catalogs.json
/private/new-run-directory`. The last argument must not exist. Native login is owned
by Codex; no token extraction, API fallback or billing change is supported.

Run `node --test scripts/run-ongoing-grounding.test.mjs` and
`python3 scripts/test-codex-decision.py` for retention, isolation and transport checks.
The live TypeScript adapter remains pinned to Luna; the helper's explicit model
option enables this supervised offline comparison, **not automatic live routing**.

## Result: six returned answers, no automatic routing recommendation

[Retained requests, verbatim outputs and field-linked assessment](evidence/ongoing-grounding-comparison.json).
All six answers passed schema and contextual action validation. Every mock preflight
reported zero tools. No failure was rerolled, and nothing was applied to a game.

| Case | Luna | Terra |
|---|---|---|
| Eligible recipients | Wait; did not repeat the old no-eligible-question claim | Wait; also did not deny recipient eligibility; unfinished mixed-language topic clause |
| Newer testimony | Updated Pedro to low; ambiguous “deferred wandering” and unfinished topic | Incorrectly called Pedro satisfied and only Alvin low, despite fresh telemetry; unfinished quotation |
| Completed self-care | Closed all three Beatrice follow-ups; asked about optional construction; incorrectly called Pedro satisfied and unanswered | Closed all three follow-ups; waited; correctly called Pedro low but still incorrectly labelled his question unanswered |

Both kept the broad brief open. Luna's construction question is a legal offline
choice, **not** a work offer, actual consent, gameplay or evidence of superior
planning. Terra's last wait reason says no eligible recipient is food-low, which
matches the snapshot: only satisfied Beatrice is eligible. It must not be scored as
“no recipients exist.” The old Pedro reply is testimony; newer berry sightings can
differ without proving he lied. These distinctions are included in the assessment.

Native turn durations were Luna **9.232 / 9.079 / 16.511 seconds**, Terra
**7.238 / 11.240 / 12.919 seconds**. These exclude mock preflight and are not a speed
benchmark. Reported subscription usage was **16,516** and **16,563** tokens
respectively; no cash price is inferred.

**Keep Luna as default.** This deliberately difficult, small sample does not show
that routing to Terra repairs stale summaries. Both models carried the same obsolete
“no answer” text forward despite an explicit answered question and delivered reply.
The source-ordering problem is more concrete than a model ranking: clearly separate
current typed facts from dated planner interpretations, and evaluate that change on
separate retained cases before adding automatic routing. Presentation defects also
remain: JSON validity does not ensure complete, readable sentences.

For availability, improve reason-specific diagnostics first. The next recorded
scene should not silently relax the eating checks or reserve a stack on a pawn's
behalf while it thinks. Portion growth and range drift deserve explicit tests, but
the two historical failures remain unattributed to any single predicate.

Verification: 349 coordinator tests, six Python transport checks, four offline-runner
checks, and independent read-only review. All 81 older evidence JSON files and 321
private historical database-related files are unchanged. No mod changes, native
trial, new restore claim, automatic routing, Sol/Jev call or separate diary entry.
