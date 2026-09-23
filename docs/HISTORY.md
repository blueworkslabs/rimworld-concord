# History

The project's first three days, 21–23 September 2026, one milestone per line. Each
line says what became true and the caveat that mattered. Details and evidence for
every trial are in the [trial ledger](trials/README.md); the
[dev diary](https://rimworld-concord.pages.dev/log/) tells the same story for players.

## 1. Foundation (21 Sep)

- **Foundation** — coordinator, SQLite, file bridge and one real action: a refusal
  creates no job, an accepted move moves Alvin, replays are idempotent, paired and cold
  restore work. Decisions scripted.
- **#1 Pawn awareness** — native self facts, per-pawn event routing, the thinking badge.
- **#3, #4** — dev diary site and the [founding baseline](PROJECT_BASELINE.md).
- **#5 Attention pump** — native events → scripted appraisal and reflection → a real
  move, with cold restore. Scripted backends only.

## 2. First contact with live models (21 Sep)

- **#6 Jev appraisal** — two live scores on captured events, both kept native
  behaviour. Integration, not judgment.
- **#7 First live Claude decision** — Alvin accepted a move and it completed. The live
  reflection was interrupted by a chitchat memory, and restore wasn't checked: a mixed
  result, kept as such.
- **#8 Thought reliability** — chitchat queues instead of interrupting; game-owned
  pause claims; live reflections completed in paused and continuous play.
- **#9 Three-pawn negotiation** — Beatrice countered and freshly accepted the revision;
  Pedro refused twice. Preferences were authored for the test.
- **#10** — failed actions become durable receipts; independent Codex review becomes
  mandatory.

## 3. Grounded physical work (21–22 Sep)

- **#11 Grounded movement** — pawns see up to 12 real nearby cells.
- **#12 Hauling** — multi-trip standing agreements. In the first live phase all three
  pawns countered; the follow-up delivered 20 steel and one trip failed on a reserved
  cell.
- **#13 Supply-aware planning** — holds stop two pawns being offered the same stack.
- **#14 First live useful work** — 6 trips, 60 steel, 5 minutes of continuous play.
  The attention budget ran out early.
- **#15 Rescue** — carry one downed colonist into one exact medical bed. Scripted only.

## 4. Changing one's mind (22 Sep)

- **#16 Reconsideration** — live: Alvin saw Beatrice downed and withdrew from his haul.
  The follow-up rescue thought was cancelled by a deep talk; no rescue happened.
- **#17** — deep talks queue too; rescue offers are only invalidated by real
  contradictions. Live: the chosen option contradicted the pawn's own prose (kept).
- **#18** — reflection choices state their effects; live choice, reason and effect
  agreed.
- **#19 Rescue requests** — a hauling pawn can ask for a rescue without dropping its
  work. Live: 20 steel, then the rescue. The pawn wrongly said its haul was
  "wrapped up".

## 5. Making it readable (22 Sep)

- **#20 Crew log** — the in-game tab with receipt-based progress.
- **#21 Observer trial** — 80 steel, no rescue: the scripted core declined, and
  Beatrice's native recovery never showed in the log.
- **#22, #23, #24** — requests outlive finished work (live: 30 steel, then a rescue);
  observed recovery appears in the log; reflection pacing spreads thought across the
  whole window.

## 6. Character and cheaper models (22 Sep)

- **#25 Private outlook** — up to four evidence-linked notes. The first live attempt
  invented an agreement ID and was rejected.
- **#26** — schemas list only currently valid choices; live, an outlook formed and was
  reused after restore.
- **#27 First Luna check** — 5 of 5 valid, but one refusal cited severe hunger at Food
  0.9.
- **#28** — needs describe their own scale; a repeated offline bank for Claude and
  Luna.
- **#29** — a second scenario (needs versus optional work): 40 wood, then native
  eating.
- **#30, #31** — matched outlooks change answers offline; a narrow grounding checker
  and a typed-claims scorer prototype, both explicitly partial.

## 7. Speech between pawns (22–23 Sep)

- **#32 Encounters** — addressed opener and reply between nearby pawns; a third pawn
  doesn't hear it.
- **#33** — offline speech-interpretation checks ("consent is mine to give").
- **#34–#37 Retained speech** — messages can be cited in outlooks. A live contrast was
  first lost to a parsing failure (#35), then succeeded with names attached (#36), then
  with an indirect remark instead of a request (#37). One pair each.
- **#38 Integration checkpoint** — everything together, 40 wood, read by Fable from
  screenshots. The final report exceeded the transport cap and was recovered. The team
  approved a live core.

## 8. A live core (23 Sep)

- **#39 First live core** — it asked why a haul stopped and offered the rest to
  Beatrice: 60 wood. One grounding slip ("same wood source").
- **#40, #41** — the core wakes on public events and stays quiet otherwise; "not now";
  topics close only on receipts; one fresh-offer invitation.
- **#42 Campfire and cooking** — both work in scripted game tests. In three live runs,
  **23 of 24 core outputs were rejected** by an interface mismatch; no work began.
- **#43, #44** — the corrected contract passed offline; a live follow-up got replies
  but no work, and one answer was rejected for using three turns.
- **#46** — project site and architecture deep dive.

## 9. Provider reliability and food (23 Sep)

- **#45, #47** — local food sightings reach the core; a live follow-through hit two
  provider errors and a rejected answer.
- **#48–#51** — the three-turn failures were diagnosed as self-repaired formatting;
  a narrow, identity-checked recovery rule was added and passed a clean live run (6
  core turns, 3 replies). Still no work, and nobody ate.
- **#52** — why: native RimWorld skips raw berries until a pawn is urgently hungry.

## 10. Choosing to eat (23 Sep)

- **#53** — a typed, pawn-owned `eat` choice; saying "I'll eat" does nothing.
- **#54 First live chosen eating** — Alvin ate 12 berries; the core waited for the
  receipt.
- **#55, #56** — item units, core-only replies and receipt-linked closure; live, Alvin
  and Pedro ate and the core closed their six topics. No work or cooking followed.

Test suite growth along the way: 33 checks at the foundation, 145 at #20, 263 at #39,
331 Node + 11 Python at #56.


## 11. Making room to watch (23 Sep)

- **#57, #58** — documentation consolidated against source; next phase agreed:
  observer video, Luna-first integration and sustained operation, with offline Jev
  exploration. Plans, not shipped live adapters.
- **#59 Observer recording pilot** — compact sidebar, expandable journal, non-pausing
  held feed, and a silent scripted capture. Native consumption and refusal remain
  distinct from model behavior; human and automated video feedback still follow.

- **#60 Video feedback calibration** — Gemini read the main scripted eating/refusal sequence,
  but invented a line and misquoted text. Receipt checking helped, not an independent
  truth test. Two paid responses, no gameplay; initial TLS failure retained.

- **#61 Native Luna ongoing integration** — no lifetime turn ceiling in the new event-driven
  mode; legacy trials unchanged. The first game attempt failed provider schema checks.
  After the existing Codex dialect was wired in, Luna ran core/answer/reflection turns
  while native play continued. Beatrice ate 9 berries with receipt-backed closures;
  Alvin's two choices encountered changed availability. One core turn cancelled at the
  fixed observation deadline. No work/cooking; no automatic escalation. Failures and
  misleading planner explanations remain in [the evidence](evidence/luna-ongoing-integration.json).
