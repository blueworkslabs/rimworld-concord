# Three scored T1 pairs — 2026-09-26

**All six arms completed T1.** Both interfaces worked; the harness took less controller
wall time in each of these three pairs and used fewer inputs. This measures one small
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

Rehearsal recording-first read and public result release were kept separate from the
already-authorized scored execution. This local draft remains unpublished pending that read.
