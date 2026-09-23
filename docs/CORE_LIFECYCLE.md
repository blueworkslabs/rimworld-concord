# Topic lifecycle and a fresh invitation

Successor to [the event-driven core](CORE_EVENTS.md). This slice changes the
contract, not the historical PR40 result. No new live-model allowance is enabled.

## Topic updates

The provider contract offers `topics` (zero to eight updates), `actionTopicId`
and one action. Each update retains a supplied source identity. New offers link
only to the explicitly selected nonclosed topic; updating another topic in the
same turn does not silently attach that new work to it. Duplicate updates,
unknown sources and exceeding the eight retained-topic bound fail before effects.
The old single-topic shape remains accepted for historical scripted fixtures,
but is not advertised to the model.

`resolved` is offered only when every linked offer's final revision has completed
receipts for all agreed work, without active, unknown or unsuccessful steps.
`declined` is offered only when every final revision was refused. A refusal is
not work completion. Counter and re-invitation lineage lead to the final offer;
old deferral/counter records remain unchanged. Pending, stopped, withdrawn and
unknown work cannot be closed by confident prose. A general strategic goal with
no linked work does not acquire an automatic done state. These labels describe
linked work, not a proof that every assertion in a topic's prose is true.
Validation uses the frozen input and fresh state before applying an answer.

## A pawn can invite one fresh offer

A pawn with no pending offer or commitment can choose `request_fresh_offer` during
an eligible reflection, identifying one supplied, pawn-owned deferred offer.
The typed request and its reason are deliberate communication to the core, not
private reflection or evidence of physical recovery. The trusted pawn-bound
capability also supports this choice in scripted native tests. Foreign, duplicate,
already-requested and nondeferred offers are rejected.

The request permits one fresh offer of the **same exact action and map**, only
while grounded options still contain it. It neither authorizes a job nor globally
restores ordinary offers to that pawn. The invitation is consumed with creation
of the new offer, before any answer. Fresh acceptance, refusal, deferral and
counter remain available. A repeated deferral requires another deliberate request,
not a timer. Time passing, eating, changed need readings, private notes or arbitrary
speech never synthesize that request. Missing work can leave a request pending;
no automatic substitute or retry is invented. Other refusals/withdrawals/stopped
work remain exclusions, not loopholes reopened by a request.

The request wakes the event-driven core once; its own offered mark does not.
Request state, lineage and topic updates follow paired saves and rewinds.
Historical provider ledgers remain unchanged.

## Native verification

`scripts/run-core-lifecycle-lab.sh game` is an operator-only, exclusive-lock-held,
zero-inference scripted acceptance test. It uses a disposable existing wood
fixture. The acceptance case exercises defer → pawn-authored request → fresh
consent → delivery, then a second distinct agreement and batched topic closure.
A separate refusal case proves that requesting an offer is not accepting it.
Both rewind a later request, restore its saved version, and verify paired restore.
`cold` verifies both cases after a full game restart. The runner has a fixed
wall-clock deadline and bounded native waits. Direct invocation and an occupied
staging lock are rejected before game access. These are mechanics checks, not
live evidence that a model will choose to resume or manage topics well.

## Verified result

Final behavior `42af8ebe981506e8984b15b16f48ff6d0a995852`: **281 Node tests and ten Python checks** pass. Independent source review and focused re-review completed; deadline propagation and independent pause/work cleanup were fixed before final native verification.

- Scripted acceptance: six trips delivered sixty wood across two accepted agreements, then one core turn resolved both linked topics.
- Separate scripted refusal: requesting the invitation was followed by refusal, zero jobs and a declined topic.
- Both cases passed request rewind, paired restore and full cold restart on the final build. No live core, pawn or Jev inference was used.
- Native checks invoke the core turns explicitly. Reflection-mediated requests, one-event wake/deduplication, ownership, stale grounding and closure rejection have automated coordinator coverage. This is not evidence of a live model choosing these responses.
- All 164 pre-existing local database-related files matched their original hashes; staging was stopped after capture.

[Sanitized scripted evidence](evidence/core-lifecycle.json) preserves both outcomes. The prior live mismatch remains in its original evidence.
