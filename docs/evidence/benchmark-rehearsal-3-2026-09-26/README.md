# First completed real-controller rehearsal pair — 2026-09-26

**Unscored rehearsal, not the three-pair benchmark.** Both native-subscription
`gpt-6-astra` / medium controllers finished T1 from fresh contexts on the frozen save.
Runtime `f411e2c`; harness then UI, one attempt each, 1,200-second caps. All previous
infrastructure-failed attempts remain retained. [Original receipts](summary.json).

## Measurements

| Measure | Harness | UI |
|---|---:|---:|
| Task completion | Yes, audited | Yes, audited |
| Controller-start wall time | 55.320 s | 113.698 s |
| First tool request → stop (secondary) | 49.802 s | 108.769 s |
| Inputs, including controls | 6 | 15 |
| Controls (subset of inputs) | 4 | 3 |
| Observations | 11 | 15 |
| Total tool calls, including report_done | 18 | 31 |
| Tool errors / unresolved | 0 / 0 | 0 / 0 |
| Input tokens | 207,486 | 327,577 |
| Cached input tokens (subset) | 191,232 | 305,664 |
| Uncached input tokens | 16,254 | 21,913 |
| Output tokens | 538 | 718 |
| Reported reasoning tokens (subset) | 0 | 0 |
| Serialized observed bytes | 22,686 | 19,887,705 |
| Recording including setup/shutdown | 62.400 s | 119.800 s |

The primary wall clock includes controller startup, inference, game evolution, controls,
and common hidden-observer overhead. It excludes setup/preflight and post-task shutdown.
The UI byte count includes base64 PNG transport overhead; **it is not a token or cost measure**.
Stalls remain **not instrumented**, not zero. Native-subscription billed USD is unavailable;
no dollar-cost advantage is claimed. Reported input totals include repeated context across
model requests inside the turn; cached input is a subset, not extra usage.

Both aliases were requested as gpt-6-astra; no immutable resolved model revision was
reported. One fixed-order rehearsal cannot isolate cache/order effects or establish a
reliable speed advantage; scored pairs must alternate H→UI, UI→H, H→UI without changing
interfaces, save, task or settings. The older long-context UI calibration is not one of
these fresh-context arms.

## Completion audit

Both hidden checkers observed a newly built campfire, a new simple-meal bill at count
three, the same bill at zero and exactly three additional native meal-production records.
The independent input/receipt audit and sampled video-frame inspection exclude edits
after configuration, other cooking, drafting and direct pawn orders. UI configured while
paused at tick6,243; harness at tick2,708. The sole bill progressed3→2→1→0 with
matching native meal increments0→1→2→3 in both arms. Original receipts retain `verifiedCompletion:false` and
pending audit status; [separate audit disposition](audit.json) records completion without
rewriting them. Both reloads use the same hashed save; initial snapshots differ in decorative
rotation of352 stone chunks, not otherwise in non-metadata state.

## Recording-first read and preservation

Original uncut recordings: [harness](https://discord.com/channels/1083662512806965308/1467116597645676546/1553359769182539951),
[UI](https://discord.com/channels/1083662512806965308/1467116597645676546/1553359788996436119).
Delivered before metrics; Fable's cold read pending when this local report was drafted.
Both original files match the game-side receipt hashes. All **440 existing saves unchanged**,
no additions, prior mod restored, game/display stopped; all four registered preflight/arm
processes gone. No credentials were copied and no API fallback used.

The private freeze template initially retained pair-2 source/proof fields alongside the
correct new fields; the immutable host pair metadata/launch plans pin this actual source
and new proof. That copied-template error was corrected with the original retained, not
used to change the runtime or inputs. The third pair's named cause was the explicit
MCP permission repair documented in [pair 2 evidence](../benchmark-native-home-2026-09-26/README.md).
