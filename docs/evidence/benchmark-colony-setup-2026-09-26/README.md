# T2/T3 setup and scripted viability — 2026-09-26

**Scripted game evidence, zero model calls. Not a benchmark result.**
The [machine-readable summary](summary.json) retains the exact results and recording hash.
The original uncut recording and full action/observation journals are retained privately.

T2's three wooden beds were placed, then all three pawns were scheduled to Sleep at
20h and 21h. Ordinary native jobs ate berries, built beds and claimed them. At tick
5115 (20h), all three had Food 0.876–0.879 and distinct assigned constructed beds.
Beatrice was observed asleep; Alvin and Pedro were resting, not yet sleeping.
This distinction is intentional: assignment is the primary; sleep is secondary.

T3's only authored action created the nine-cell WoodLog stockpile. At tick 1162
(18h), 80 wood were physically in its roofed, psychologically non-outdoor cells.
This is at least 75, not an exact-delivery quota. Carried wood was excluded.

The room was first constructed by ordinary native jobs in a separate recorded
preparation. The fixture builder copies only its 15 walls, door and local roof
cells into the original starting world. No accrued pawn skill, movement, food or
job progress from that preparation enters the T3 start. T2 separately changes
Food to 0.1, Rest to 0.4 and supplies 225 wood; both clocks start at 18h.
Character traits, backstories, capabilities, health and the rest of the original
world remain unchanged. In particular Alvin still cannot haul.

The [builder and hash manifest](../../../benchmark/fixtures/colony-manifest.json)
identify both private fixtures. Initial in-game snapshots verify 18h and checker
preconditions. The setup uses a 2,500-tick local hour; the shifted absolute start
is 47,500 and the local zone is −1 hour, so local 22h begins at tick 10,000.
T2 uses inclusive **by 22h**; T3 uses strict **before 22h**.

All 443 saves present before calibration were unchanged (the 440 old saves plus
the new room template and two new task fixtures). The previous mod was restored;
game/display were stopped. Preparation's 440-save preservation also passed.

## Next measurement protocol

The contract is in [HARNESS](../../HARNESS.md#t2t3-frozen-task-contract-2026-09-26).
Each task gets three fresh-context pairs in H→UI / UI→H / H→UI order, same
`gpt-6-astra` / medium and 20-minute wall cap. All attempts and recordings remain;
no outcome-driven rerolls. Exact-launch isolation preflight is still required for
every arm, in addition to the new task-specific proof.

Cold reads precede each published table. Tables lead with colony-time completion
bounds, then wall time, inputs/observations/errors, input/cached/output tokens,
observed cook and health changes, and observed sleep for T2. Phase timings use
retained observer wall timestamps: start→first unpause, first required control→
last relevant configuration, configuration→first observed success. Overlapping
work/feeding is shown as overlapping milestones, not invented disjoint durations.
Sampled milestones are not exact engine event times; poisoning and other health
changes are observations, not causal interface claims. USD remains unavailable,
stalls uninstrumented, and viewer legibility unmeasured.
