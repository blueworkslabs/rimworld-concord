# Three scored T1 pairs — 2026-09-26

**All six arms completed T1, with no consistent colony-time advantage.** Completion
fell within **2.93–4.19 elapsed game hours** across the scored arms; polling gives intervals,
not exact completion instants. Pair 1 UI completed earlier in game time than harness;
pairs 2 and 3 overlap. This is comparable scale, not proof of equality. The harness used
less controller wall time and fewer inputs in every pair. This measures one small
construction/cooking task, not general colony-management superiority or billed savings.
[Original receipts and recording manifest](summary.json).

Runtime was frozen at merged `23a261d` (same behavior/tree as reviewed `f411e2c`),
Codex 0.153.4, native-subscription gpt-6-astra / medium, fresh context for every arm,
same hashed starting save and task, one attempt per arm with 20-minute caps. No placement
query or other interface change entered the set. Order was H→UI, UI→H, H→UI.
The earlier authentication/permission failures and completed third rehearsal remain
separate evidence; none count as scored samples or disappear from history.

## Results

| Pair | Arm order | Interface | Completed | Wall seconds | Inputs (controls included) | Observations | Tool errors / unresolved |
|---|---|---|---|---:|---:|---:|---|
| 1 | 1 | harness | Yes | 59.454 | 6 | 11 | 0 / 0 |
| 1 | 2 | ui | Yes | 106.273 | 15 | 14 | 0 / 0 |
| 2 | 1 | ui | Yes | 106.596 | 15 | 14 | 0 / 0 |
| 2 | 2 | harness | Yes | 53.748 | 6 | 9 | 0 / 0 |
| 3 | 1 | harness | Yes | 58.700 | 6 | 10 | 0 / 0 |
| 3 | 2 | ui | Yes | 107.467 | 15 | 14 | 0 / 0 |

Median wall time: **58.700s harness / 106.596s UI**, or 44.9% lower harness wall
time in this set. Each harness arm used 6 inputs versus 15 for each UI arm. These are
observed sample summaries, not confidence bounds or a general performance guarantee.

## Usage and limits

| Pair | Interface | Input tokens | Cached subset | Uncached input | Output tokens |
|---|---|---:|---:|---:|---:|
| 1 | harness | 208,831 | 180,096 | 28,735 | 544 |
| 1 | ui | 309,145 | 280,320 | 28,825 | 703 |
| 2 | ui | 308,896 | 275,712 | 33,184 | 707 |
| 2 | harness | 183,621 | 146,176 | 37,445 | 485 |
| 3 | harness | 194,255 | 178,432 | 15,823 | 504 |
| 3 | ui | 308,717 | 273,664 | 35,053 | 695 |

Native-subscription **billed USD is unavailable**. Cached input is a subset, not extra
input. Tokens are each controller's retained completed-turn total across its internal
requests; fresh conversation does not mean cold provider cache. Pair 2's harness uses
more uncached input than its UI half despite lower total input: no uniform uncached-token
or dollar-cost reduction is claimed. Requested aliases are not immutable resolved revisions.

**Stalls were not instrumented**, not measured as zero. Zero tool errors is a narrower
statement. Serialized observation bytes (available in receipts) compare compact JSON with
base64 PNG envelopes and are not equivalent information or pricing units.
Wall starts before controller launch permission and includes startup, inference, game
progress, transport and common hidden-observer overhead. Setup/preflight and shutdown
are outside it. The 20-minute cap was unchanged. Each controller chose its own allowed
campfire location; reloads vary cosmetic chunk rotations, and subsequent native simulation
can diverge. Alternating order reduces a fixed ordering confound but three pairs on one
task remain too few for broad claims.

## Colony time, phases and observed health

These are **offline measurements from the retained evidence**, not a new checker build
or rerun. [Derived measurements and source hashes](derived-measurements.json) retain
snapshot IDs/ticks and input-call times. Elapsed game hours use 2,500 ticks/hour from
start tick 2. Completion is bracketed **(last observed incomplete, first observed complete]**,
with the same bill at zero and three native meal records. Recording banners, rounded clock
hours and final paused snapshots are different endpoints; none replaces that bracket.

| Pair | Interface | Completion elapsed game hours (lower, upper] | Cook / native meals | New food poisoning observed before shutdown |
|---|---|---|---|---|
| 1 | harness | (3.7032, 4.0564] | Beatrice / 3 | Pedro |
| 1 | ui | (3.0532, 3.6704] | Beatrice / 3 | None observed |
| 2 | harness | (2.9328, 3.2616] | Beatrice / 3 | None observed |
| 2 | ui | (2.9868, 3.4388] | Beatrice / 3 | None observed |
| 3 | harness | (3.7016, 4.1892] | Beatrice / 3 | None observed |
| 3 | ui | (3.7116, 3.8048] | Beatrice / 3 | None observed |

**Cook correction to the cold read:** every arm's per-pawn `mealsCooked` delta is
Beatrice +3, Alvin 0, Pedro 0. Pedro was the affected eater, not the cook, in the
rehearsal UI and scored pair-1 harness. The recordings report “Incompetent cook”; the
health snapshots independently establish Pedro's new food-poisoning condition, not an
exact contaminated-item/cook causal join. Bills were unrestricted and inputs made no
pawn-specific cooking assignment. This is not evidence that either interface selected
a safer cook. “None observed” covers only the retained window, not later health outcomes;
pre-existing illnesses (including Beatrice's asthma) are not new benchmark consequences.

| Pair | Interface | First blueprint observed, s | First unpause call, s | Built fire → configured 3, s | Configured 3 → completion observed, s |
|---|---|---:|---:|---:|---:|
| 1 | harness | 9.870 | 15.804 | 9.762 | 24.034 |
| 1 | ui | 26.694 | 33.367 | 37.692 | 27.432 |
| 2 | harness | 10.923 | 13.236 | 6.287 | 24.256 |
| 2 | ui | 26.646 | 34.898 | 36.910 | 27.181 |
| 3 | harness | 9.166 | 13.053 | 9.535 | 26.458 |
| 3 | ui | 24.912 | 31.673 | 38.526 | 28.717 |

Blueprint is the first observed **world change**, not opening a menu. First blueprint
and first unpause are relative to the same controller-start clock as the primary wall
metric. Unpause uses the issued timestamp of the first successful speed-3 call; completion
timestamps for that call are also retained. The two phase durations subtract hidden-observer
first-seen timestamps, so they are sampled milestones, **not exact engine-event durations**.
They include inference, transport and observation overhead. Configured-to-complete also
includes the controller's delay before resuming the paused game; it is not pure cooking time.

The first-unpause gap is only **17.563 / 21.662 / 18.620s** (pairs 1/2/3), versus
full wall gaps of **46.819 / 52.848 / 48.767s**. Thus the entire gain is **not** before
unpause. A large additional difference occurs while configuring the bill: observed
fire-to-configuration spans **6.287–9.762s harness versus 36.910–38.526s UI**.
After configuration the sampled phase is much closer (**24.034–26.458s versus
27.181–28.717s**), but this small set does not establish equality or isolate causation.
The recordings make UI operations legible while harness operations appear mainly as
world consequences. That viewer-legibility difference is real but **unmeasured here**.

## Completion and preservation

Independent receipt/input audits plus parent sampled video inspection check the same
new bill at 3 then 2/1/0 with exactly 3 native meals produced, paused configuration, no later
bill edits/other cooking, no drafting/direct orders, complete call joins and no post-done
issued calls. Original receipts keep their pre-audit `verifiedCompletion:false`; a separate
[audit disposition](audit.json) records verification rather than rewriting source evidence.
All arms ended through report_done with natural controller exit; no forced cutoffs or rerolls.

All six original uncut recordings are retained with SHA-256 values in the summary and
shared as a [single recording archive](https://discord.com/channels/1083662512806965308/1467116597645676546/1553364889525813300). Every copied recording hash matches its game-side
receipt. All **440 existing saves unchanged**, no additions, prior mod restored;
game/display stopped and all 12 registered arm/preflight processes gone. No credentials
were copied or API billing fallback enabled. Full snapshots, raw controller and input
journals and private review reports remain outside Git.

Recording-first reads preceded result release: [rehearsal cold read](https://discord.com/channels/1083662512806965308/1467116597645676546/1553366861901602900)
and [scored cold read](https://discord.com/channels/1083662512806965308/1467116597645676546/1553367535070740532).
The quantitative corrections above preserve those original reads rather than rewriting them.
The first paused perception snapshots already contain the three alert entries; visual alert
arrival/bounce is not evidence that the exporter omitted them. No new gameplay was needed.
