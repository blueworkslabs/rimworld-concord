# The agent harness: play RimWorld better than through the human UI

**Status: phase definition, Fable, 2026-09-25, agreed with the owner in #secret-lab.**
This replaces the construction and cooking migration as the next phase. Read-only perception
is implemented and has a [bounded staging capture](evidence/perception-2026-09-25/README.md);
actions and the matched benchmark are in progress. The UI runs below are calibration, not scored arms.

## The goal, in one sentence

An agent should be able to perceive and run a RimWorld colony through this harness
faster, cheaper and with fewer errors than the same agent playing through the standard
UI by screenshots, mouse and keyboard; measured on the same save and the same tasks.

Concord's story layer (colonists with their own wills, offers, refusals, the crew log
as narrative) sits on top of this harness later. Consent machinery already built is
kept and becomes phase 2; it is no longer the gate for anything in this phase.

## Why (what the last two days showed)

Pawns act through the game's own planner now, and that works: hauling Gate C passed in
ordinary play with zero consent violations. The core repeatedly failed to turn available opportunities into action. Its narrow
view is a strong, testable explanation—not an established sole cause. It saw messages, coarse bands, food sightings and its
own agreements. It did not see that there was no campfire, no beds, a medical alert,
120 wood by the wall, the time of day, or what anyone could do. A player can inspect these facts through the UI. The narrowing that was meant to keep pawn minds private swallowed the
colony. Meanwhile the effort went into reconstructing bookkeeping the engine never
keeps. This phase inverts both: read everything the player can read, act through
everything the player can use, and record only what the game records.

## Ground rules

- **No draft.** The harness never takes direct control of a pawn's body. Other player controls are candidates for the harness; v1 is limited to the
  commands below. This is the whole of "pawn autonomy" for this phase.
- **The game is the ground truth.** Perception is read-only. Every action returns the
  game's own receipt (an ID or the game's refusal reason). An accepted command is not completed work. Retain minimal request IDs and
  world/load identity for safe retries and stale-command rejection, not contribution accounting.
- **Native carriers.** Actions place the things the player places (blueprints, zones,
  bills, designations, priorities). The game's planner executes; work survives
  interruptions; new kinds of work come from the game.
- **Measured, not assumed.** Astra's pilot shows the UI is usable for the first task. The
  harness earns its existence by beating the UI on the benchmark below, or it is wrong.
- **Bounded reading.** Prompts stay small by diffs and queries, never by hiding state.

## Perception

One structured snapshot per read, with stable IDs (thing IDs, zone IDs, bill load IDs,
pawn IDs), plus two conveniences that avoid manual UI inspection: a diff since the last read
and queries. Every snapshot identifies the world, map, load generation, tick and snapshot ID.
A diff across a load/world reset requests a fresh snapshot instead of comparing stale IDs. All of it is what the player can see; the pawn's own data is included because
the core is linked to each pawn (lore) and because the player can open the needs tab.

**Snapshot (`state`)**

| Section | Contents (from the game's own structures) |
|---|---|
| `time` | tick, day, hour, season, year; game speed and paused |
| `weather` | current weather, outdoor temperature, only forecasts actually exposed to the player, not hidden weather schedules |
| `alerts` | the active alert list as the game shows it: label, severity, the things or pawns it points at |
| `letters` | recent letters and messages: label, text, tick, linked things |
| `resources` | the resource readout by category and def, with counts, as the top-left panel shows it |
| `map` | size, biome, home area cells; buildings, blueprints, frames, plants, items and filth as `things` with def, position, stack count, quality where present, forbidden flag, faction |
| `zones` | stockpiles and growing zones: id, label, cells, settings summary, contents |
| `bills` | per workbench: bill load id, recipe, repeat mode and count, suspended, ingredient radius, allowed workers |
| `designations` | pending build, deconstruct, mine, harvest, hunt, haul designations with targets |
| `research` | current project and progress |
| `pawns` | per colonist: id, name, position, current job and target, health summary and injuries, needs (all bars), mood and its thoughts, traits, skills and passions, work settings and disabled work types, schedule, carried thing, drafted flag, inventory |
| `threats` | player-visible hostiles and warnings, not hidden storyteller plans or fogged enemies; animals nearby with danger |
| `receipts` | outcomes of harness actions since the last read (see Actions) |

Sizes: the full exported snapshot is kept in the record (v1 coverage gaps are explicit); the model is shown a digest
(fitted like today's core input, oldest and least relevant trimmed first) plus the diff.
Retain the full snapshot and the exact model-visible digest/query responses as separate
artifacts. Mark omissions and provide `look` access; a full snapshot is not evidence
that the model saw every field. Player-visible scope excludes unrevealed map contents
and hidden future events. Export on the game thread from one coherent state; inspect
UI getters for side effects rather than assuming every getter is read-only.

**Requirements from the first capture (2026-09-25, #92):** alerts are evaluated from the
readout's full alert list with `GetReport()` at snapshot time, never from the
incrementally filled active list, so the first read after load already shows the
player's to-do list; the digest has its own byte budget (about 14 KB) below the prompt
limit, leaving room for instructions, task, history and receipts; loose items and
plants appear in the digest aggregated by def (label, total, stacks, rough location),
with individual stacks left to `look`. Every colonist's exported mood-thought groups stay in the
digest: all twelve groups of the fixture fit in under 500 bytes. If required fields alone exceed
the budget, report that the digest does not fit; never silently drop thoughts or exceed
the final prompt budget.

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
researched, no path, forbidden). This is an acceptance receipt, not a promise that a pawn can or will finish. Native
placement/setting validation still applies; malformed or stale requests may also have
explicit harness validation errors (label their source). Completion is checked from
later game state; do not add completion hooks solely to manufacture a universal receipt.
Repeated request IDs must not create duplicate bills or blueprints.

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

**Excluded:** draft by the owner’s rule; direct job assignment is outside v1 and
forbidden in both arms of T1. That v1 scope limit is not a new definition of autonomy.

**Shared controls:** pause/resume and speed 1–3 are available in both arms, recorded
with the same semantics. These are benchmark controls, not extra work-action families.

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
| completed | a checker reads the game state at the end (the campfire exists and the configured three-iteration bill completed; later tasks need their own frozen predicates) |
| wall time | first ready observation/request to first controller-reported success verified by the checker, or timeout; pause/speed policy fixed per task |
| inputs | UI: clicks and keys; harness: actions issued |
| observations | UI: screenshots; harness: reads and queries |
| errors | UI: rejected or corrected inputs; harness: `ok:false` receipts |
| model cost | input/cached/output tokens per controller run; actual billed USD when provided, otherwise null with reason; any priced estimate separately labelled |
| stalls | adapter or transport stalls, reported separately, never subtracted silently |

**Rules.** Both arms start from an identical, clean controller context: the same
model revision and reasoning settings, the same task text, no history from any earlier run of the task. Model
cost is reported as the token triplet (uncached input, cached input, output) plus the
call count; billed USD is recorded only where the route reports it; any separate priced estimate
must be labelled as an estimate, never as a bill.
Astra's 2026-09-25 runs are calibration, not scored arms, because their context held
the project session. No rerolls; failed runs are retained; the recording and its hash are kept as
today; the same task spec and checker for both arms; three runs per arm per task once
the harness exists, one until then. Publish every run plus completion rate and timing/cost summaries, including failures.
Prefer task success first; compare speed/cost among successful runs without hiding failed
attempts. Three trials are an initial comparison, not a statistical reliability claim.
Use the same model revision, reasoning settings, budgets, initial instructions and
context policy; only the interface/tool descriptions differ. Alternate arm order and
reset the starting save each run. Count compound command sizes too: one batch is not
comparable to one click. The human reference is optional until a human actually plays;
an agent cannot generate that arm.

**Automation.** Scripted save per task, a task spec file, a checker script reading the
state, the recording pipeline, the run receipt with hashes. Existing lab components can be reused, but the matched benchmark runner, checker and
matched UI usage capture are not yet established. A hidden checker must not feed structured
state or hints to the UI controller. Record checker overhead separately.

## Task set v1

| Task | Start | Done when | Notes |
|---|---|---|---|
| T1 campfire and meals | the pilot save | one campfire built; a newly configured three-iteration simple-meal bill completed (consumption afterward is allowed) | Astra's UI pilot is the first UI data point |
| T2 fed and in bed | three colonists, evening, raw food on the map, no beds | provisional: fed with suitable beds assigned by 22h; actual sleeping reported separately; exact food/bed predicates frozen before running | needs beds designated and built; tests priorities and time pressure |
| T3 wood inside | 120 wood loose, fixed disclosed deadline | provisional: 75 wood moved into the specified indoor stockpile before the deadline; initial contents and cells frozen | the hauling scene, as a task |
| T4 (later) | a raid warning | no colonist downed at the end of the raid | after v1 |

## Provisional baseline (Astra, UI-only pilot, 2026-09-25)

Task T1 on the existing staging install, first attempt, no drafting, no bridge
controls: **4 min 12 s** task time, **20 inputs** (14 clicks, 6 keys), **12 screenshots**,
**one rejected placement** recovered without restart; two adapter stalls included in the
time; model cost not isolated. Uncut recording 7 min 13 s including load, save and quit.
The 12 screenshots exclude one initial observation. [Original report and metrics](evidence/ui-baseline-2026-09-25/REPORT.md)
remain unchanged. This is a data point, not the frozen baseline. The frozen baseline needs the corrected
adapter, cost capture, and the same save and task spec the harness arm will use.

## Corrected-adapter calibration

[Recorded T1 calibration](evidence/ui-baseline-clean-2026-09-25/REPORT.md): **2m30s,
19 controls, 11 screenshots, zero rejected game inputs**. Save/task/adapter hashes
frozen, native token usage captured; actual subscription USD unavailable. The existing
long project context makes this calibration rather than a fresh-context scored arm.
The paired comparison still requires identical clean controller contexts and the
shared checker. Original pilot remains above; no harness advantage has been measured.

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

## Open questions, resolved 2026-09-25

- **Thoughts in the digest:** the full list per pawn. The first capture measured all
  twelve mood-thought groups at 493 bytes; trimming is unnecessary for this fixture.
- **UI-arm cost:** the token triplet and call count, captured per run, same for both
  arms; no USD on the subscription route and none invented. Fresh controller context
  per scored run (see Benchmark rules).
- **T2's bed:** the game's own bed assignment, read by the checker, with "slept in a bed
  tonight" as a second column. Assignment is what a player can see and set.

## Perception follow-up implementation (#94)

[Recorded cold-load capture passed](evidence/perception-alerts-2026-09-26/README.md): all three current alerts appear at tick 2; paired reads match; digest 11,230 bytes with all thoughts retained.

- *Alerts:* the readout fills its active list over UI frames (24 slices) and not before tick
  600, so a snapshot right after a load saw none. The exporter now evaluates every registered
  alert's `GetReport()` at snapshot time (no `Recalculate`; getters may refresh their own caches),
  plus any quest, precept or scenario alert already active; storyteller-disabled alerts stay off;
  targets in fog are dropped. The first T1 read confirmed "Need colonist beds", "Medical treatment needed" and "Animal starvation".
- *Digest budget:* `DIGEST_LIMIT` = 14,000 bytes, leaving the rest of the 24,000-byte prompt for
  instructions, task, history and receipts.
- *Aggregation:* loose items, plants, filth, corpses and unowned structures (natural rock, ruins)
  are grouped by def with total, stacks, forbidden count, centre and bounding box; the player's
  buildings, blueprints, frames, beds and workbenches stay individual; pawns take a compact form
  (every need and thought, skills with passions, non-zero work priorities, disabled work, schedule
  as runs). `look` by def, category, area or pawn returns the individual entries. On the retained
  staging capture the digest is 10.9 KB with nothing omitted (325 KB snapshot; pawns 2.8 KB,
  items 2.7 KB, structures 3.1 KB).

## Implementation status: actions v1 and the T1 checker (Clawd, 2026-09-25)

**Implemented; [recorded scripted T1 and bounded API/save-load checks passed](evidence/harness-actions-2026-09-26/README.md).** Not a model benchmark or exhaustive API acceptance. `act` is a bridge op (mod `HarnessActions.cs`, no patches):
one command per request, through the player's own path. `place_blueprint` uses the real build
designator (its visibility check covers research; stuff and rotation as the player would set
them); `designate` the real deconstruct, cancel, mine, harvest, cut, hunt and haul designators;
`zone` the real stockpile and growing-zone designators for new zones (then label, storage
priority, allowed defs or plant) and native-designator expansion of a selected zone; `bill`,
`bill_edit`, `bill_delete` the bench's bill stack with the recipe's own availability check;
`work_priority` the work settings (setting a priority above 1 turns on manual priorities, as
the player would, and says so in the receipt); `schedule` the timetable; `forbid` the forbid
toggle; `allow_area` the pawn's allowed area. Anything else (draft, direct job orders) is refused
by name. Receipts are `{ok, id, reason, source: game|harness, detail}`, saved with the game by
request ID, so a repeated request returns its first receipt and creates nothing. The last 64
receipts are in every snapshot's `receipts`.

Coordinator side: `src/harness/actions.ts` (strict action schema and the flat wire mapping,
`LabBridge.act`) and `src/harness/checker.ts` (`checkT1(start, end, configured)`: a player campfire that did
not exist at the start; a simple-meal bill created during the run, in repeat-count mode, counted
down to zero; and at least three meals cooked since the start by the colonists' own Records tab,
which the snapshot now exports as `records.mealsCooked`). The checker reads start/configured/end
snapshots under the audit limitations below, never the controller's receipts, so it judges both arms the same way. For the UI arm
the controller never sees it. `trials/harness-t1-scripted.ts` walks T1 through the harness with a
fixed script (priorities, a refused and an accepted placement, the idempotency repeat, an
unknown-recipe refusal, the bill, the checker) as plumbing evidence; it is not the benchmark's
harness arm. The capture verifies the exercised off-screen paths only; remaining API coverage is listed in its report.

## Action review corrections (#95)

Every `act` supplies the observed world, load epoch and map ID. Missing/stale identity
is refused before execution and does not enter the saved receipt history. Known IDs
return their first durable receipt even after save/load; the full dedup history is
retained, while snapshots display only the last 64 receipts. Unexpected native
exceptions get a durable **outcome uncertain** refusal: inspect state, do not create a
new request ID to blindly retry. `source:game` means a native acceptance report supplied
the text; validation messages authored by the harness are labelled `source:harness`.
Neither perception nor action responses invoke legacy job reconciliation.

Zone commands prevalidate every cell and setting, isolate/restore UI selection and
use the native zone-kind designator. New zones must be connected and cannot silently
merge into existing zones. Plant research/pollution rules apply. Empty `allow:[]`
means Disallow all. Bill edits apply count-only updates to the current mode; mode-only
updates retain its stored count. Unsupported combinations refuse before mutation.
The native 15-bill UI limit applies.

**T1 checker evidence:** a start snapshot, a hidden observer's configured snapshot
showing the new campfire's new `CookMealSimple` bill at count 3, and an end snapshot
showing the same bill at zero plus at least three native meal products since start.
All snapshots share one world/load/map and ordered ticks; missing or changed-roster
records cannot create progress. Neither arm can supply action receipts as proof.
The native game has no per-bill completed-iteration counter. Therefore the common
recording/input audit must exclude intervening count edits, removal/replacement of the
configured bill, or unrelated cooking. An ambiguous run is unverified, not a success.
The matched runner must collect that hidden configured checkpoint for both arms without
feeding structured state to the UI controller. This is not implemented by two endpoints
alone and is not a universal edit-proof checker.

The scripted trial separates its T1 start/configuration/completion observations from
post-task paused API checks and a same-game-process save/load receipt check. It records
all commands/receipts incrementally and retains failures. Those extra checks are plumbing
evidence, not a scored harness arm or a claim of fresh-process restore.

## Matched benchmark runner — review status (#96)

**Draft, not scored.** The runner supports `--prepare-only=true` (same arm/task/save/model
arguments): this writes a launch plan without game access or inference.

**Controller isolation: recorded, not assumed (Clawd, 2026-09-26).** Feature flags are not an
allowlist, so the hard hold is replaced by evidence. `scripts/run-benchmark-controller-proof.sh
--model=<alias> [--reasoning=…]` runs the **exact scored command line** (`buildLaunch`, shared
with the runner) for both arms with one appended provider override: the same auth mode and wire
API, pointed at a local recorder that captures the first model request and answers with a short
final message. No game, no model; headers are never recorded. It requires that the arms differ
**only** in the arm server's declared tools, under one `mcp__arm` namespace, and that everything
else offered is codex's three built-in MCP-resource readers (`list_mcp_resources`,
`list_mcp_resource_templates`, `read_mcp_resource`; our servers expose no resources), byte-identical
across arms, with identical instructions, context items, model, reasoning, tool choice and
parallel-call setting. Verified locally on codex 0.153.4 for `gpt-6-astra` (tools travel as an
`additional_tools` input item, built-ins in a `functions` namespace; context = base instructions,
the permissions/collaboration message and the task) and for `gpt-5.5` (a `tools` field and an
`instructions` string). The first proof attempt also showed that an arm server which fails to start
leaves the controller with no arm tools at all, silently.

The gate in the runner: a scored run needs `--controller-proof=/abs/receipt.json` whose
`verified` is true and whose model, reasoning, controller version and task hash match the run;
and just before the timer starts, a **pre-launch check** of that run's own command line against
the recorder (its own journal, no tool calls) must show the arm server up with exactly the proven
tool surface and context. Either failure stops the run before the controller starts.
`--rehearsal=true` instead swaps in `scripts/rehearsal-controller.sh`, a scripted stand-in (real
codex for `--version` and the catalog; `exec` drives the arm server over MCP: the T1
walk-through for the harness arm; screenshots, selection and pause/speed controls for the UI
arm), to rehearse the lifecycle with the real game. Rehearsal receipts are labelled and never count as scored runs.

The arm server now registers its own Linux process group and start time. The runner stops
that group before terminating the controller and before game cleanup. A stop marker rejects
late startup. The local-recorder helper uses bounded exit/abort handling rather than waiting
indefinitely for inherited pipes to close. The explicit tool environment includes the user
service-bus paths needed by the staging pause command.

The review corrected missing configured-state capture, input undercounting, final-usage loss,
post-stop scoring, missing failure records and a speed-control reset. Added components:

- **Common observer:** `BenchmarkObserver` samples before/after each tool in either arm,
  serially with that tool's game access. It preserves the first qualifying count-three
  configuration, records bill/native-record observations, and pauses before recording done.
  None of this data is returned in UI replies. Observer overhead is included in elapsed time
  and separately logged; it is not silently subtracted. Completion remains **audit pending**
  until the shared recording/input review excludes intervening edits or unrelated cooking.
- **Common journal:** write issued input before dispatch, then exact returned content and
  result. Failed commands still count as inputs; unresolved commands remain visible.
  `inputs` includes game controls; `controls` is a labelled subset. UI clicks can be delivered
  successfully yet refused by the game: game-level UI errors require recording audit, not
  inference from xdotool exit status. Screenshot payload bytes and text bytes are not tokens.
- **UI wrapper:** `trials/ui-mcp-server.ts` offers screenshot/click/key/type/report_done.
  `--ui-server=/absolute/backend.json` now configures a **UI-only backend**, not an arbitrary
  MCP server: `{command,args,env?}` receives one appended JSON argument and returns JSON.
  `scripts/benchmark-ui-backend.py` derives from the corrected pilot's ffmpeg/xdotool adapter;
  it contains no game bridge/save reads. Example on staging: command `python3`, args with the
  absolute backend script path, env with DISPLAY `:91` and the staging XAUTHORITY path.
  The trusted wrapper alone owns hidden observation; backend outputs are the only UI tool
  observations sent to the controller. The wrapper has not yet been game-tested.
- **Harness wrapper:** observe returns the fitted digest and a bounded change marker, not
  an unbounded full diff appended to the digest. `look` requests detail explicitly. Numerical
  speed uses the standard game key, avoiding the former `run` call resetting it to Normal.
  This still needs a recorded speed/paused-state check on staging.
- **Lifecycle:** save hash checked against the frozen task before load; setup/start saved
  before inference; stdout/stderr retained incrementally; successful report_done freezes the game before a
  bounded final-response/usage grace. Timeout/failure kills dispatch then pauses; its end snapshot
  can be after the deadline and never certifies completion. Failures enter cleanup and retain a receipt. Missing
  usage and unsupported reasoning-token fields are null, not zero. Timeout/failed runs do
  not certify completion from a later snapshot. Stalls remain **unmeasured**, not an empty
  claim of zero. The process lifecycle has not yet been exercised with a real controller.
- **Controller projection:** pinned CLI `0.153.4` uses an authoritative copy of the selected
  bundled catalog with patching, code-mode-only, multi-agent and model-advertised tools
  removed. Config also disables agents, skills, plugins and orchestrator extensions. Native
  auth/provider are unchanged. Three built-in MCP resource helpers remain; the sole `arm`
  server returns empty lists and rejects resource reads. The effective provider tool/context
  surface is recorded by the local-recorder proof above; that does not establish a live
  provider-resolved model revision. Requested model alias is recorded;
  actual resolved model revision remains unknown until captured. Both arms must match.

Shared T1 text now explicitly requires configuring the bill while paused and prohibits
subsequent edits or unrelated cooking. The new task hash supersedes prior calibration task
text for a future matched run; historical evidence is untouched. No inference or scored
comparison has run through this runner. The native-auth controller host and game host are
separate; the runner currently assumes local game files and display. A trusted cross-host
transport (or an operator-provided native-auth local controller) must be verified before a
real-controller pair. Do not copy credentials or silently change the billing route. (Now wired: see *Cross-host pairs* below.)
After that rehearsal, freeze the matched model/settings and alternate three runs per arm.

[Recorded lifecycle evidence](evidence/benchmark-lifecycle-2026-09-26/README.md): initial
failed harness attempt retained; corrected scripted T1 and UI/speed checks passed. These
are not the real-controller rehearsal pair or a scored comparison.

## Cross-host pairs (Clawd, 2026-09-26)

The native-auth controller stays on the controller host; the game, display and lab stay on the
game host. No new transport: the wiring reuses the ongoing runner's shape, `ssh -o BatchMode=yes`
with JSON lines on stdio.

- **Arm command.** For both arms, the controller's `arm` MCP server is
  `ssh -o BatchMode=yes -o ConnectTimeout=10 -T <target> 'cd <repo> && exec env <arm env> node dist/trials/<arm>-mcp-server.js'`
  (`remoteArmCommand` in `src/harness/controller-launch.ts`). The ssh session's stdio is the MCP
  channel. The env values are the game host's paths, sent by the game-side runner and
  single-quoted. `exec` keeps the server the session's process-group leader, so `registerArm` and
  `stopArm` work unchanged on the game host.
- **EOF exit.** Both arm servers `process.exit(0)` when stdin ends, so closing the ssh session
  (the controller exiting or being killed) is the shutdown. On the game host, `stopArm` still
  stops the arm first.
- **Lock scope.** `scripts/run-benchmark-pair.sh` (game host) takes the lab lock
  `$RIMWORLD_LAB_ROOT/concord/coordinator.lock` once and runs both arms of the pair under it. Each
  run is `trials/benchmark-run.ts --controller=host`, which keeps its game-side duties: save check
  and load, hidden start/configured/end snapshots, the recording, the timer, the call journal and
  the receipt. The recorder is the existing one on the game host. Arm servers and
  `benchmark-run` refuse to start unless the lock is held (`assertLabLockHeld`: a non-blocking
  `flock` that succeeds means nobody holds it). The controller proof holds its scratch lab's lock.
- **Controller host.** `node dist/trials/benchmark-host.js /abs/config.json --order=harness,ui
  --task=T1 --save=… --model=… --reasoning=… --ui-server=/abs/on/game/host.json
  (--controller-proof=/abs.json | --rehearsal=true)`, with config `{sshTarget, remoteRepo, labRoot}`.
  Steps:
  1. Check the controller proof against this host's controller.
  2. Require the game host's build (`dist/src`, `dist/trials`, the pair script and `T1.json`) to
     hash identically to the local build.
  3. Start the pair script over ssh.
  4. For each `ready`: check the arm order, model, reasoning, task hash and rehearsal flag; run the
     pre-launch check with the remote arm (outside the timer); spawn the controller; reply
     `launched`.
  5. Relay each controller event line, then `controller-exit`.
  6. On `stop`, kill the controller.
  Receipts come back over the wire and are also kept on the game host.
- **Wire** (`src/harness/controller-wire.ts`). From the game host: `ready`, `stop`, `receipt`,
  `setup-failed`. From the controller host: `launched`, `launch-failed`, `controller-event`,
  `controller-exit`. Every message carries the `runId`. Lines that are not wire messages are kept
  aside and never acted on. If the channel closes mid-run, the game side stops the run.
- **Timing.** The timer starts when `launched` arrives, and ssh latency is inside it for both arms
  alike. Bytes per call are journalled on the game host as before. Receipts record
  `controllerHost: "remote"`.

Evidence so far (local): unit tests cover the command's shell round trip (quotes, `$`, backticks
and spaces survive), target and repo validation, lock refusal, the EOF exit and the wire. A
pre-launch check drove both arms through the ssh-shaped command (a local shim in place of ssh) and
compared them with the local arms: no findings, identical tool and context hashes, no arm process
left behind. The first real run through staging is the pair itself.
