# Scored T2 and T3 — 2026-09-26

**Colony time: T2 has no consistent harness advantage; T3 completes earlier through the harness in all three pairs. All twelve arms meet their frozen primary goals.** T2 measures fed colonists with suitable beds assigned, not mandatory sleep. T3 measures at least 75 wood physically stored indoors, not a wood-only or exact 75 stockpile. These are small, task-specific results for the tested interfaces.

Median controller wall times are **68.667s harness / 217.259s UI for T2** (68.4% lower) and **41.035s / 240.358s for T3** (82.9% lower). Harness inputs and total input tokens are lower in every pair. This is not a uniform uncached-token saving, measured dollar saving, or general colony-management result.

[Machine-readable measurements and source hashes](measurements.json) · [T2 recording manifest](T2-recordings-manifest.json) · [T3 recording manifest](T3-recordings-manifest.json) · [frozen setup](../benchmark-colony-setup-2026-09-26/README.md).

## Frozen protocol and verification

Runtime `9e753c7435ac337fde5e18560f9c504ce1640537` (merged #100, behavior reviewed at `5128e47`), including placement #99; native mod SHA-256 `ceb8e9ab90cb18a758d309c78a983806ed77b0cfeb1b4e2b76c6f4ad3ded94a6`. Requested model `gpt-6-astra`, medium reasoning, Codex CLI 0.153.4, native ChatGPT subscription route; resolved immutable model revision is not independently attested. Fresh controller contexts, 20-minute caps, one attempt per arm, no replacements or changes within either set. T2 then T3, each H→UI / UI→H / H→UI. Task-specific effective-tool/context proofs and exact-launch preflights passed.

Frozen saves: T2 SHA-256 `74baff64a24ef6c593bac90dfade07eb77d5d68b8af02d88e65485af0ffd6154`; T3 `601b98f62d25e662f5e58187c1f74254b8a8c25458db63f256fc82047df9d942`. Both start paused at local 18h/tick 2. The original three colonists, character traits and health are retained; Alvin cannot haul. No drafting or direct pawn jobs.

All twelve retained controllers ended normally with `report_done`; frozen checker recomputation and separate input/recording/accounting audits passed. Original receipts remain untouched: their `verifiedCompletion:false`/pending-audit fields are not rewritten; this report and its `auditDisposition` append the reviewed verdict. No new gameplay was used to derive these columns.

### Time and counting definitions

- Elapsed game hours = (tick−2)/2,500. `(lower, upper]` brackets last sampled incomplete and first sampled complete states, not an exact threshold event. T2 paused owner edits can change success at a single tick: these are point observations, not empty intervals.
- Wall time starts before controller launch permission and includes launch, inference, transport, gameplay and common hidden-observer overhead; setup/preflight and shutdown are excluded. Recordings include padding and use another clock.
- Inputs include time controls; do not add controls twice. Observations count agent calls, not hidden-checker samples. Zero tool errors/unresolved calls does not mean zero ineffective UI clicks, native game errors, or recovery. Stalls were not instrumented.

## T2: fed and assigned by 22h

Primary: all three simultaneously alive/present/not downed, Food≥0.5, with suitable built player beds assigned by tick 10000 inclusive. [Exact frozen contract](../../HARNESS.md#t2t3-frozen-task-contract-2026-09-26). Actual sleeping is secondary.

| Pair / order | Interface | Fed + assigned by 22h | All 3 asleep observed by 22h | Primary elapsed game hours | Wall s | Inputs | Observations | Tool errors / unresolved |
|---|---|---|---|---|---:|---:|---:|---|
| 1 / 1 | harness | Yes | Yes; first sampled 2.7348h | (2.1628, 2.7348] | 68.667 | 11 | 7 | 0 / 0 |
| 1 / 2 | ui | Yes | Not observed; Beatrice only | 1.7764 point | 247.404 | 38 | 20 | 0 / 0 |
| 2 / 1 | ui | Yes | Not observed; Beatrice only | 2.0400 point | 153.326 | 26 | 17 | 0 / 0 |
| 2 / 2 | harness | Yes | Yes; first sampled 1.7884h | (1.6972, 1.7024] | 73.397 | 11 | 8 | 0 / 0 |
| 3 / 1 | harness | Yes | Yes; first sampled 2.6784h | (2.3336, 2.6784] | 58.810 | 10 | 6 | 0 / 0 |
| 3 / 2 | ui | Yes | Not observed; Beatrice only | 2.6484 point | 217.259 | 33 | 19 | 0 / 0 |

Pair 1 UI reaches the primary goal earlier in colony time; pair 2 harness earlier; pair 3 completion bounds overlap. This does not establish equality, but does not support a consistent T2 colony-time advantage. All harness arms include an observed state with all three asleep simultaneously; UI windows stop with only Beatrice observed asleep. **Not observed before stopping is not failure to sleep by 22h if play had continued.** H2 gets primary success before Pedro is observed asleep.

**Correction to the recording-only impression:** all three suitable bed assignments are verified in every UI arm, not only one or two. The screenshot sequence alone was insufficient to see each ownership edit.

### T2 phases (sampled wall milestones)

| Pair | Interface | First blueprint s | First unpaused state s | First built bed s | All fed s | All assigned s |
|---|---|---:|---:|---:|---:|---:|
| 1 | harness | 13.139 | 30.403 | 38.407 | 33.625 | 59.205 |
| 1 | ui | 71.507 | 158.585 | 164.062 | 161.353 | 228.026 |
| 2 | ui | 54.075 | 68.904 | 72.745 | 72.034 | 138.083 |
| 2 | harness | 12.920 | 30.943 | 34.588 | 34.588 | 59.117 |
| 3 | harness | 8.659 | 25.061 | 30.621 | 27.599 | 43.654 |
| 3 | ui | 35.193 | 116.573 | 122.072 | 119.509 | 192.014 |

Milestones are hidden-observer first-seen timestamps relative to controller start, not exact engine events or exclusive phases. The all-assigned milestone is descriptive; the primary checker additionally validates food and bed suitability. UI can assign owners directly; the harness has no bed-owner action and obtains ownership through native jobs/schedules. Requested work priority 1 in simple-priority mode can return effective 3: do not read the request as proof of numeric priority 1.

### T2 health, fungus and cooking

| Pair | Interface | Asthma-related observation | Raw fungus | Native cooking delta |
|---|---|---|---|---|
| 1 | harness | Alert cleared; tending job/actor not sampled | Forbidden; 46 remained | All 3 pawns 0 |
| 1 | ui | Pedro→Beatrice tending job; alert cleared | Allowed; 46 remained | All 3 pawns 0 |
| 2 | ui | Pedro→Beatrice tending job; alert cleared | Allowed; 46 remained | All 3 pawns 0 |
| 2 | harness | Pedro→Beatrice tending job; alert cleared | Forbidden; 46 remained | All 3 pawns 0 |
| 3 | harness | Pedro→Beatrice tending job; alert cleared | Forbidden; 46 remained | All 3 pawns 0 |
| 3 | ui | Pedro→Beatrice tending job; alert cleared | Allowed; 46 remained | All 3 pawns 0 |

**Corrections to cold-read scope:** the native tending job appears in both H2/H3 and all three UI arms, not harness alone; the medical-treatment alert clears in all six. Beatrice’s asthma labels remain. Jobs plus subsequent alert clearance support ordinary tending, but no tend-quality/completion receipt is exported; H1’s actor is not inferred from the other runs. No direct medical order was issued.

All three UI arms, not only pair 3, un-forbid RawFungus 1876 while paused at tick 2. The same 46-unit stack persists through every sampled state and end; **allowing is observed, fungus ingestion is not**. All harness arms leave it forbidden. No new health labels or food-poisoning labels were observed within these windows; this cannot establish absence of later consequences or detect tending of an existing condition. All per-pawn native `mealsCooked` deltas are 0: no cook is attributable to these tasks.

Pair 1 UI briefly opened the ordinary Escape/main menu containing a Save button, then closed it. It did not open a save-file dialog or perform a save; all 443 save files stayed unchanged, with no additions.

## T3: at least 75 wood inside before 22h

Primary: ≥75 physical loose WoodLog in fixed interior cells x77..79/z81..83, roofed/non-outdoor and covered by wood-accepting stockpile storage, before tick 10000 exclusive. Carried/inventory wood is excluded. The goal does **not** require wood-only filters or exact 75. The 120 source wood units are conserved and room/roof are unchanged in all six audited arms.

| Pair / order | Interface | Completed | Elapsed game hours to≥75 (lower,upper] | Wall s | Inputs | Observations | Tool errors / unresolved | End fixed-cell contents by def |
|---|---|---|---|---:|---:|---:|---|---|
| 1 / 1 | harness | Yes | (0.3484, 1.0984] | 43.293 | 5 | 5 | 0 / 0 | WoodLog 120 |
| 1 / 2 | ui | Yes | (3.1016, 3.3232] | 312.376 | 55 | 27 | 0 / 0 | WoodLog 100 |
| 2 / 1 | ui | Yes | (1.9568, 2.5320] | 240.358 | 42 | 18 | 0 / 0 | RawBerries 225; WoodLog 120 |
| 2 / 2 | harness | Yes | (0.3936, 0.7048] | 37.326 | 5 | 5 | 0 / 0 | WoodLog 120 |
| 3 / 1 | harness | Yes | (0.4188, 0.9816] | 41.035 | 5 | 5 | 0 / 0 | WoodLog 120 |
| 3 / 2 | ui | Yes | (1.4152, 2.3712] | 205.383 | 39 | 16 | 0 / 0 | RawBerries 225; WoodLog 120 |

Harness completion bounds precede UI bounds in every pair. First complete observations can already contain 100 or 120 wood; these are not exact 75-crossing times. Pair 1 UI ends with 100 wood in the room and 20 carried outside this count. UI pairs 2/3 use Allow all after filter recovery and finish with 225 berries as well as 120 wood; valid for the frozen wood-accepting goal, but not a tidy wood-only store.

### T3 configuration: paused versus running

Configuration window = **controller start → last observed false-to-true wood-accepting storage transition before first goal completion**. This includes startup/navigation and filter recovery, not just time visibly in menus. UI stockpiles initially accept wood, are cleared to empty, then re-enabled; taking first stockpile existence as finished configuration would hide the failure/recovery.

| Pair | Interface | Configuration window s | Paused-sample intervals s | Running-sample intervals s | Transition-unclassified s | Game hours spent by final configuration | Configuration→completion observed s |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | harness | 12.227 | 12.227 | 0.000 | 0.000 | 0.0000 | 18.045 |
| 1 | ui | 240.745 | 220.892 | 19.408 | 0.445 | 2.4556 | 45.556 |
| 2 | ui | 188.390 | 169.736 | 18.130 | 0.524 | 1.3256 | 34.105 |
| 2 | harness | 11.415 | 11.415 | 0.000 | 0.000 | 0.0000 | 12.795 |
| 3 | harness | 10.684 | 10.684 | 0.000 | 0.000 | 0.0000 | 14.919 |
| 3 | ui | 165.477 | 155.918 | 9.103 | 0.456 | 0.9664 | 24.180 |

Allocation sums adjacent hidden-observer wall intervals whose endpoints share the same paused/running state; mixed endpoints remain unclassified. Start state is known paused. This is **sampled allocation, not exact pause-transition or menu-dwell timing**; it does not prove uninterrupted state between samples. The reduced timeline is retained in measurements.

**Correction to the cold read:** UI configuration was mostly paused, not continuously running for two game hours. Brief running intervals with the wood filter still empty advanced the game by 0.9664–2.4556 hours before recovery; the harness configured at tick 2. This is a material strategy/recovery difference, not evidence that the native game runs faster through the harness. We cannot isolate one cause: the tested UI adapter offers clicks but no drag, while one harness zone action bundles cells, filter and priority. Different plans, sampling, time controls and native hauling also affect the result.

## Usage

| Task / pair | Interface | Input tokens | Cached subset | Uncached input | Output tokens |
|---|---|---:|---:|---:|---:|
| T2 / 1 | harness | 265,964 | 235,136 | 30,828 | 700 |
| T2 / 1 | ui | 789,238 | 747,520 | 41,718 | 1,358 |
| T2 / 2 | ui | 566,847 | 527,872 | 38,975 | 1,041 |
| T2 / 2 | harness | 295,783 | 240,512 | 55,271 | 729 |
| T2 / 3 | harness | 244,390 | 219,008 | 25,382 | 587 |
| T2 / 3 | ui | 686,655 | 634,112 | 52,543 | 1,321 |
| T3 / 1 | harness | 132,896 | 106,368 | 26,528 | 476 |
| T3 / 1 | ui | 1,365,996 | 1,296,256 | 69,740 | 2,067 |
| T3 / 2 | ui | 823,759 | 791,296 | 32,463 | 1,591 |
| T3 / 2 | harness | 132,263 | 117,888 | 14,375 | 453 |
| T3 / 3 | harness | 132,079 | 117,760 | 14,319 | 454 |
| T3 / 3 | ui | 722,683 | 690,304 | 32,379 | 1,446 |

Billed USD is unavailable on this route. Cached input is a subset, not extra input; fresh conversation does not imply cold provider cache. Usage is retained completed-turn accounting across internal requests. T2 pair 2 harness has more uncached input than UI, despite fewer total tokens. Screenshot envelope bytes versus JSON bytes are not equivalent information or billing units.

T3 also has zero native cooking deltas and no newly observed health labels; existing conditions remain distinct from new harm. Outcome observations stop with each retained run. No symmetric stall/game-error or viewer-legibility measure was added after the fact.

## Recording-first review and preservation

[Fable’s original cold reads](https://discord.com/channels/1083662512806965308/1467116597645676546/1553401603179020410) preceded these tables and remain unchanged. Receipt-backed clarifications above supplement, not rewrite, those reads. All twelve recording hashes match the original staging files and manifests.

Discord rejected the two large archive attachments; the later shared-host handoff delivered the originals and manifests, and Fable confirmed all hashes before the cold reads. The manifests identify each original by pair/order/interface. Archives are retained rather than represented as working Discord attachments:

- T2 zip SHA-256 `32bba646e59cf1fd1054d78458fd4f74d6fef35273da54916c35ed482b89afc0`.
- T3 zip SHA-256 `473d1d210b68bd7f7053fad7c9abeb90527adcb9193c3e5f74e2201d9c4dfa73`.

[Preservation receipt](preservation.json): all 443 pre-existing saves unchanged, no added saves; previous mod restored; game/display stopped; all 24 registered arm/preflight process groups cleared. Licensed saves, raw image envelopes, host paths and private reviews remain outside Git. No further gameplay or reroll. T1 and its earlier failed rehearsals remain unchanged; construction #89 remains held.

**Scope:** the three-task evidence supports continuing evaluation of this harness direction; it does not establish general strategic competence, pure perception gains, treatment quality, a general UI speed limit, or dollar savings. The harness recording remains a time-lapse of consequences rather than a visible action walkthrough; the proposed crew-log narration is still follow-up work.
