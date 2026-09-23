# Toward a legible, playable crew

Planning checkpoint: 2026-09-22, following the pawn-requested rescue milestone.
The cognitive link should produce deliberate environmental and social behavior,
not merely explanations over unchanged native routines. Viewers should be able
to follow a consequential choice without reading operator debug output.

## First slice: communication and progress

Implement a read-only in-game Concord crew log, with explicitly addressed
messages separated from recorded work outcomes. Proposal reasons, explicit pawn
decision replies and rescue requests are already deliberate communications in
the protocol. Background reflection, private memories, traits, worries and
withdrawal reasoning must not be republished as dialogue. Model statements are
claims, not authoritative descriptions of the world or access to inner thought.

Show agreement progress derived from action receipts: completed, active,
unconfirmed, unsuccessful and not started. Stopped work is not completed work.
Supply the bound pawn with the same explicit progress distinctions about its
own agreement during deliberation, including replacement negotiations.
The observer log is not automatically shared knowledge for every pawn/core.
The display has no commands, chat input or model access.

## Subsequent milestones, not implemented by this slice

1. A longer mixed-work three-pawn playtest with a scripted core, finite limits,
   and evaluation of useful work, stalled conversations, continuity and whether
   viewers can explain consequential choices from the in-game presentation.
2. Durable character development: a small, revisable account of values, current
   worries and interpersonal stances, grounded in native identity and experience.
   Exact schema and update rules remain open; avoid static personality caricatures.
3. Selective consequential social exchange. Preserve native chatter as texture;
   promote selected conversations/disagreements into bounded communication with
   persistent consequences. Pawn-to-pawn proposals must retain recipient consent.
4. A bounded live strategic core selecting grounded opportunities and responding
   to requests without an override. Ordering with social work remains a planning
   choice, not a commitment to build everything together.

## Future human contact

- Strategic suggestions addressed to the AI core: input to consider, not orders.
- Personal correspondence with individual pawns: attributed information, not
  automatic truth or global crew knowledge.
- Near-real-time conversations while a pawn uses a communications station:
  situated encounters that can end or be interrupted; asynchronous delivery when
  unavailable. Human presence should not make every pawn permanently on call.

These are recorded future directions, not installed chat capabilities or an
expanded inference allowance. Identity, delivery rules and in-world availability
need a separate design before implementation. Private thought, deliberate speech
and verified outcome remain distinct throughout. No requirement for scripted
refusal or manufactured drama: assess meaningful choices, not desired obedience.


## Cross-model contract checks

After the basic character loop is working, evaluate cheaper/lower-capability
models against the same fixed pawn-owned snapshots and contextual choice schema.
The user suggested Luna through native Codex. Current official documentation and
the installed catalog list `gpt-5.6-luna` (not `gpt-6-luna`). Do not silently
substitute a different model or billing route. First establish a tool-free,
bounded native subscription route; an offline contract probe is not a live
pawn-backend integration or evidence of character quality.

Measure schema adherence, invented identifiers, citation ownership, preservation
of no-change/refusal options, latency and usage separately from gameplay results.
Use fixed cases and finite attempts; preserve failures and do not tune or reroll
until a preferred action appears. Keep runtime validation and consent independent
of model capability. More compliant JSON alone does not prove better judgment.

Model reference: https://learn.chatgpt.com/docs/models

First offline Luna check completed on 2026-09-22: five fixed synthetic cases
passed contextual schema/runtime validation, but one permitted refusal gave a
need-state explanation contradicted by nearly full Food/Rest levels. No game
choices were executed. [Evidence and limits](MODEL_CONTRACT_PROBE.md) separate
contract compliance from grounding. The next interface check should spell out
need scale/direction and test high, low and unknown values without requiring a
preferred choice; it is not yet a model ranking or a cheaper live backend.

## Current priority after the outside review (2026-09-22)

Keep the core scripted while we establish grounded pawn behavior; a live core is
less urgent and remains a later milestone. Prioritize self-describing state and
choice effects over an ever-growing system prompt, then broaden beyond the
steel/rescue situation. A small repeated snapshot bank now covers need contrasts,
social strain and limited supplies as well as recovery. These offline situations
are not new native gameplay features. See the [current roadmap](ROADMAP.md) and
[semantic interface/evaluation contract](MODEL_PERSPECTIVE.md). Maintenance should
support this work: preserve old evidence, centralize trial policies, keep future
plans separate from historical checkpoints, and avoid an unrelated mass refactor.

## Foundation before presentation polish (2026-09-22)

The current transaction-like log is adequate instrumentation for this early
phase. A first human screenshot read recovered the proposal, acceptance and
recorded rescue; trip-versus-agreement labeling was discussed, not prioritized
for a redesign. This is limited feedback, not general usability validation.
Defer cosmetic label work and narrative presentation until the functional
foundation is stronger. Later, make the four protagonists' story engaging through
personality, charm and humor in deliberate speech and readable presentation,
without inventing outcomes, publishing private thoughts or forcing drama. The
ledger supplies an evidence trail; it is not the intended final storytelling
experience.

## Integration checkpoint decision (2026-09-23)

After Fable’s complete-panel read and diagnostic comparison, the user approved
a bounded live-core milestone. This supersedes the earlier core-later ordering.
Keep scripted behavior as a regression baseline. The next target is grounded
follow-through, not more chatter, omniscient planning or forced cooperation.
No new physical capability follows merely from replacing the script with a model.
