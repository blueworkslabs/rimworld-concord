# Private, evidence-linked outlook

This is a small durable-character slice, not a complete personality system. Native
traits and relationships remain unchanged. A pawn may hold up to four private
notes classified as a value, concern or interpersonal stance, each up to 240
characters with one to three references to its own captured experiences. No
authored personality override initializes these notes. Older saves have no outlook.

`revise_private_outlook` is an optional, standalone reflection choice. It replaces
the entire notes array at the expected revision. Retain relevant notes, revise
them or remove them; empty notes are allowed. It does not authorize speech,
withdrawal, an agreement, a job, or native relationship/trait changes. It receives
the ordinary reflection allowance and interruption/timeline protections.

The coordinator validates references against the frozen supplied character
perspective and rechecks the current revision before mutation. Evidence comes
from the pawn's retained experiences or previous outlook citations. At most
twelve cited event snapshots remain with the current notes even if the ordinary
64-event experience window evicts their originals. Removed citations do not
create an unlimited evidence archive. A stance must name a subject explicitly
present in its cited experience; inferred identities or unevidenced core-trust
scores are not supported. Citation checks prove provenance, not that an
interpretation follows logically or is true.

Only the owner's future proposal, reflection and appraisal perspectives contain
its outlook. It is private audit/state, excluded from the public crew log and
other pawns' perspectives. A pawn's later deliberate reply can choose what to say;
the system does not automatically broadcast private notes. Pawn outlook is not a
shared crew board or privileged core knowledge. Existing provider context-size
limits still fail closed; this adds no arbitrary tools or actions.

Paired checkpoints restore outlook along with character state; rewind removes
discarded revisions. Current outlook is bounded; the private audit retains
revision records under the existing timeline model. No update from a discarded
timeline or cancelled thought can write into the restored state.

## Bounded verification

Automated tests distinguish privacy, provenance, eviction retention, removal,
revision rejection, explicit later consent and restart/late-answer behavior.
They cannot establish personality quality or a causal improvement in judgment.

The native operator runner uses the existing rescue fixture and the lifetime
locked `scripts/run-rescue-lab.sh outlook|outlook-cold` entry points. Host entry:
`node scripts/run-observer-game.mjs PRIVATE_CONFIG --outlook --scripted`; omit
`--scripted` only for the authorized single live run, add `--cold` for no-inference
restore. Use fresh receipt and ledger paths. Six Claude attempts maximum, no Jev
calls; a two-minute channel deadline. Initial reflection and later offer are
paused tests, not continuous-play timing evidence. The later rescue still needs
fresh acceptance and actual placement evidence. Refusal, counter, failed or
unchanged outlook results are preserved, not retried. The paired restore before
the later offer checks exposure of retained state, not that a note caused the
choice. Native and live results are recorded separately in acceptance evidence.

## Verified result and remaining gap

167 automated checks and independent review passed. The scripted native case
formed a stance, kept it out of public records, restored it into the owner's
later proposal perspective and completed a separately accepted rescue. Paired
rewind and full cold restart passed.

In the single live case, no outlook was formed: the model selected an unavailable
rescue request and invented its agreement ID. Adapter validation rejected it.
The later preplanned rescue offer was separately accepted and delivered; it was
not a reply to an applied request and not evidence of outlook influence. Two
Claude attempts, zero Jev, no retries; paired/cold restore retained that mixed
result. Current output schema exposes the complete reflection vocabulary while
the supplied executable-choice list is narrower. Schema specialization is the
next targeted improvement; runtime validation must remain mandatory.
