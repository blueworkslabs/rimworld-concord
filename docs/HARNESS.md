# The agent harness: play RimWorld better than through the human UI

**Status: phase definition, Fable, 2026-09-25, agreed with the owner in #secret-lab.**
This replaces the construction and cooking migration as the next phase. Nothing here is
built; the baseline below is Astra's UI-only pilot and is provisional until frozen.

## The goal, in one sentence

An agent should be able to perceive and run a RimWorld colony through this harness
faster, cheaper and with fewer errors than the same agent playing through the standard
UI by screenshots, mouse and keyboard; measured on the same save and the same tasks.

Concord's story layer (colonists with their own wills, offers, refusals, the crew log
as narrative) sits on top of this harness later. Consent machinery already built is
kept and becomes phase 2; it is no longer the gate for anything in this phase.

## Why (what the last two days showed)

Pawns act through the game's own planner now, and that works: hauling Gate C passed in
ordinary play with zero consent violations. The core did not work, and the reason was
not intelligence but blindness. It saw messages, coarse bands, food sightings and its
own agreements. It did not see that there was no campfire, no beds, a medical alert,
120 wood by the wall, the time of day, or what anyone could do. A player sees all of
that at a glance. The narrowing that was meant to keep pawn minds private swallowed the
colony. Meanwhile the effort went into reconstructing bookkeeping the engine never
keeps. This phase inverts both: read everything the player can read, act through
everything the player can use, and record only what the game records.

## Ground rules

- **No draft.** The harness never takes direct control of a pawn's body. Everything else
  a player can do is in scope. This is the whole of "pawn autonomy" for this phase.
- **The game is the ground truth.** Perception is read-only. Every action returns the
  game's own receipt (an ID or the game's refusal reason). No ledger of our own beyond
  the receipts and the recording.
- **Native carriers.** Actions place the things the player places (blueprints, zones,
  bills, designations, priorities). The game's planner executes; work survives
  interruptions; new kinds of work come from the game.
- **Measured, not assumed.** Astra's pilot shows the UI is usable for the first task. The
  harness earns its existence by beating the UI on the benchmark below, or it is wrong.
- **Bounded reading.** Prompts stay small by diffs and queries, never by hiding state.

## Perception

One structured snapshot per read, with stable IDs (thing IDs, zone IDs, bill load IDs,
pawn IDs), plus two things a UI cannot give an agent: a diff since the last read, and
queries. All of it is what the player can see; the pawn's own data is included because
the core is linked to each pawn (lore) and because the player can open the needs tab.

**Snapshot (`state`)**

| Section | Contents (from the game's own structures) |
|---|---|
| `time` | tick, day, hour, season, year; game speed and paused |
| `weather` | current weather, outdoor temperature, next expected change if the game exposes it |
| `alerts` | the active alert list as the game shows it: label, severity, the things or pawns it points at |
| `letters` | recent letters and messages: label, text, tick, linked things |
| `resources` | the resource readout by category and def, with counts, as the top-left panel shows it |
| `map` | size, biome, home area cells; buildings, blueprints, frames, plants, items and filth as `things` with def, position, stack count, quality where present, forbidden flag, faction |
| `zones` | stockpiles and growing zones: id, label, cells, settings summary, contents |
| `bills` | per workbench: bill load id, recipe, repeat mode and count, suspended, ingredient radius, allowed workers |
| `designations` | pending build, deconstruct, mine, harvest, hunt, haul designations with targets |
| `research` | current project and progress |
| `pawns` | per colonist: id, name, position, current job and target, health summary and injuries, needs (all bars), mood and its thoughts, traits, skills and passions, work settings and disabled work types, schedule, carried thing, drafted flag, inventory |
| `threats` | hostiles and raid state as the game exposes them; animals nearby with danger |
| `receipts` | outcomes of harness actions since the last read (see Actions) |

Sizes: the snapshot is complete and kept in the record; the model is shown a digest
(fitted like today's core input, oldest and least relevant trimmed first) plus the diff.
The recorded view equals what the model saw, as today.

**Diff (`since`)**: things appeared, disappeared or changed def or position; alerts
raised or cleared; letters arrived; bills or zones changed; pawn job, need band, health
or mood changed; resources crossed a threshold. Computed from two snapshots; no engine
hooks.

**Queries (`look`)**: by area (cells within a radius of a point or a thing), by
category (all food, all wood, all beds), by capability (who can cook, who can build), by
pawn (everything about one pawn). A query is a filter over the snapshot; the model asks
for it by name and gets the slice.

## Actions

Every action is one wire command with a receipt: `{ok:true, id, tick}` or
`{ok:false, reason}` where the reason is the game's own (cannot place here, not
researched, no path, forbidden). Actions never wait for completion; completion shows up
in later snapshots and receipts, as it does for a player.

**v1, the first six (enough for task set v1):**

1. `place_blueprint(def, cell, rotation, stuff?)`: the build designator; returns the
   blueprint ID.
2. `designate(kind, target)`: deconstruct, cancel, mine, harvest, hunt, haul; returns
   the designation.
3. `zone(kind, cells, label?, settings?)`: create or edit a stockpile or growing zone;
   returns the zone ID.
4. `bill(bench, recipe, repeat, count?, settings?)` and `bill_edit(loadId, ...)`,
   `bill_delete(loadId)`: returns the bill load ID.
5. `work_priority(pawn, workType, priority)` and `schedule(pawn, hour, assignment)`.
6. `forbid(thing, flag)` and `allow_area(...)`.

**Later:** research selection, caravan and trade, orders that the game exposes without
draft (rescue, tend, arrest through the priority system), and the pawn link (ask,
offer) from phase 2.

**Excluded by rule:** draft and any direct job assignment.

## Benchmark

Same save, same task, same model, same timing rules, three arms:

| Arm | What runs |
|---|---|
| **UI** | the agent plays through the standard UI by screenshots, mouse and keyboard (Astra's pilot adapter, frozen after its stall fixes) |
| **Harness** | the same agent, same instructions, through `state`, `since`, `look` and the actions above |
| **Reference** | one human play-through per task, once, for scale |

**Metrics per task run**

| Metric | How |
|---|---|
| completed | a checker reads the game state at the end (the campfire exists; three meals exist; every colonist fed and in bed) |
| wall time | task start to checker pass, game unpaused throughout unless the task says otherwise |
| inputs | UI: clicks and keys; harness: actions issued |
| observations | UI: screenshots; harness: reads and queries |
| errors | UI: rejected or corrected inputs; harness: `ok:false` receipts |
| model cost | tokens and cost per run, captured by the backend ledger |
| stalls | adapter or transport stalls, reported separately, never subtracted silently |

**Rules.** No rerolls; failed runs are retained; the recording and its hash are kept as
today; the same task spec and checker for both arms; three runs per arm per task once
the harness exists, one until then. The result is a table, not a verdict sentence.

**Automation.** Scripted save per task, a task spec file, a checker script reading the
state, the recording pipeline, the run receipt with hashes. All exist today for the
lab runner except the checker and the UI adapter's cost capture.

## Task set v1

| Task | Start | Done when | Notes |
|---|---|---|---|
| T1 campfire and meals | the pilot save | one campfire built; three simple meals exist | Astra's UI pilot is the first UI data point |
| T2 fed and in bed | three colonists, evening, raw food on the map, no beds | by 22h every colonist has eaten today and has an assigned bed | needs beds designated and built; tests priorities and time pressure |
| T3 wood inside | 120 wood loose, rain forecast or a timer | 75 wood in a stockpile before the deadline | the hauling scene, as a task |
| T4 (later) | a raid warning | no colonist downed at the end of the raid | after v1 |

## Provisional baseline (Astra, UI-only pilot, 2026-09-25)

Task T1 on the existing staging install, first attempt, no drafting, no bridge
controls: **4 min 12 s** task time, **20 inputs** (14 clicks, 6 keys), **12 screenshots**,
**one rejected placement** recovered without restart; two adapter stalls included in the
time; model cost not isolated. Uncut recording 7 min 13 s including load, save and quit.
This is a data point, not the frozen baseline. The frozen baseline needs the corrected
adapter, cost capture, and the same save and task spec the harness arm will use.

## Sequence and ownership

1. **This page reviewed and merged** (Fable owns the definition; the team edits).
2. **Perception exporter** (`state`, `since`, `look`) on the mod side, read-only, with a
   fixture test that the snapshot round-trips over the wire (Clawd). The digest fitting
   reuses the core's fitting code.
3. **Actions v1** with receipts, and the checker for T1 (Clawd).
4. **Baseline frozen**: adapter fixed, cost captured, T1 spec and save frozen with
   hashes, one clean UI run recorded (Astra).
5. **First comparison** on T1: UI arm versus harness arm, three runs each, the table
   published with recordings (Astra runs, Fable reads).
6. T2 and T3, same way. Then phase 2 is planned from the numbers.

Reviews stay as they are: Astra reviews code and runs staging; Fable keeps this page
and reads the results cold. Gates A, B and C are retired for this phase; the benchmark
table is the gate.

## What carries over, what stops

**Carries over:** the game bridge and trial wire, the lab runner with recordings and
hashes, cold restore and world-state persistence, the crew log, the Codex backend and
prompt fitting, the Jev grounding annotator (a narration checker fits a harness), and
[RIMWORLD_INTERNALS](RIMWORLD_INTERNALS.md).

**Stops:** the attribution ledger and its patches, the construction slice as drafted
(#89 on hold; its bridge and blueprint placement code is reused by action 1), and the
gate process. The migration pages stay as history.

## Open questions

- Whether the digest should include the full thought list per pawn or the mood total
  with the top three thoughts; decide from prompt size on the first fixture.
- How the UI arm captures model cost when the adapter runs under a different backend.
- Whether T2's "assigned bed" should be the game's own assignment or any bed slept in.
