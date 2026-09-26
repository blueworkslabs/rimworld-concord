# Native-home rehearsal and MCP permission correction — 2026-09-26

**No task-performance comparison.** The second real-controller rehearsal authenticated
successfully but failed before any game-tool execution. Both original attempts and uncut
recordings remain retained, alongside the earlier authentication failures.
[Machine-readable receipts](summary.json).

Runtime `b91c7c5`; fresh gpt-6-astra / medium, harness then UI, frozen T1 task/save,
1,200-second cap per arm. The explicit label is `real-controller-rehearsal-pair-2-native-home`;
`rehearsal:false` in runner receipts means real Codex rather than an authored stand-in.
The native home was pinned in the host launch plan; the remote game receipt's
`controllerCodexHome:null` is missing remote metadata, not evidence of an unpinned host.

## Recorded results

| Measure | Harness | UI |
|---|---:|---:|
| T1 completed | No | No |
| Controller wall time | 13.487 s | 10.942 s |
| Executed game inputs | 0 | 0 |
| Returned game observations | 0 | 0 |
| Controller MCP permission refusals | 2 | 1 |
| Input tokens | 17,021 | 10,503 |
| Cached input tokens (subset) | 10,880 | 4,992 |
| Output tokens | 136 | 113 |
| Reasoning output tokens (subset) | 18 | 27 |
| Recording, including setup/shutdown | 16.800 s | 14.333 s |

Both controllers exited naturally with status 0 after reporting inability to proceed;
that is not task success. The arm logs are empty: their zero tool-error counts omit the
controller's earlier permission refusals. Stalls were **not instrumented**, not zero.
Native billing USD is unavailable. The model alias is requested, not an immutable resolved
revision. Usage is the retained completed-turn triplet; cached input is not additional input.

The exact refusal was `MCP tool call requires approval, but approval policy is never`.
Harness attempted `observe` and `look`; UI attempted `screenshot`. Game tick stayed 2.

## Recording-first read and preservation

Fable's [cold read](https://discord.com/channels/1083662512806965308/1467116597645676546/1553356409813467178)
preceded these metrics: both loaded games were never played. He noted empty screenshot
alert areas at this paused first-read tick, unlike later gameplay. Preserve that timing
observation; the exporter cold-alert fix does not populate native screenshot UI.

Original recordings: [harness](https://discord.com/channels/1083662512806965308/1467116597645676546/1553356145370865745),
[UI](https://discord.com/channels/1083662512806965308/1467116597645676546/1553356161737298040).
Original SHA-256 values are in the receipts; downloaded/platform-processed recording hashes
may differ and must not replace original hashes. Both local originals matched staging.
All **440 saves unchanged**, no additions; prior mod restored, game/display stopped.

## Named cause and narrow correction

Tool-list isolation did not establish execution permission. Unannotated MCP tools default
to approval-requiring behavior; global `never` therefore rejected them before dispatch.
Installed CLI 0.153.4 supports per-tool `approval_mode="approve"`. The launcher now
explicitly authorizes only the five declared tools for each arm, adds an exact
`enabled_tools` allowlist, and keeps unknown-tool default `prompt`, global `never`,
read-only sandbox, disabled built-ins and native home unchanged.

The updated proof records and checks the home, approval, sandbox and exact per-arm
permission policy; old receipts without that policy are rejected. The
[controlled execution probe](execution-probe.json) used installed Codex with an inert MCP
server and deterministic loopback Responses stub: all five authorized tools dispatched
in each arm, while an advertised and explicitly attempted sixth `rogue` tool never
reached the server. Seven local requests per arm; **no model or game calls**. The probe
is execution evidence, unlike the original list-only isolation proof. Independent source
review confirmed per-tool precedence and invocation-time allowlist enforcement.

[Official config reference](https://learn.chatgpt.com/docs/config-file/config-reference.md).
A third rehearsal is warranted for this named cause after refreshed proof, as directed by
Fable; no scored run or merge follows from the failed second pair.
