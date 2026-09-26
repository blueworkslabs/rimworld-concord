# Benchmark runner review — 2026-09-26

PR #96 remains **draft**. No game or inference run was made. The original runner could
never pass T1 because it omitted the configured checkpoint, and could lose final usage by
terminating immediately after `report_done`. Rejected inputs were missing from input counts;
numerical speed was reset to Normal; failed attempts lacked unconditional cleanup/durable
records; state after the timed window could be scored as completion.

Corrections and a UI backend wrapper are implemented with **475 passing offline tests**.
The common hidden observer captures count-three configuration without exposing it in UI
responses. Commands are journalled before dispatch; exact tool replies are retained; failed
inputs still count. Finish seals the tool server and pauses before the checker snapshot.
Usage may remain null/partial; no billed-dollar claim is made. The new UI transport derives
from the pilot's corrected ffmpeg/xdotool adapter, rather than pretending its wrapper is
unchanged or game-verified.

[Prepared arm metadata](summary.json) confirms matching task/model request/reasoning/catalog
hashes for two **preparation-only** invocations. This does not prove controller isolation.
A source-reviewed catalog projection removes model-advertised patch/code/multi-agent tools,
with config disabling skills and external extensions. Three built-in MCP resource helpers
remain; the arm server supplies no resources. No actual effective provider tool list/context
or resolved model revision has yet been captured. Actual launch therefore fails before any
game/model access; `--prepare-only=true` remains usable.

The process lifecycle and UI/speed paths still need rehearsal before scoring. Start/end
checker observations alone are not sufficient; recording/input audit is required. The
recorded UI calibration and scripted #95 result remain separate historical evidence.
Staging game/display are stopped; no saves, profile or installed mods changed this pass.
