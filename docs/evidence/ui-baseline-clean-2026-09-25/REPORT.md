# T1 corrected-adapter UI calibration — 2026-09-25

**Passed once, no reroll:** campfire built and three simple-meal cooking iterations completed.
[Uncut recording, 4:15.933](https://discord.com/channels/1083662512806965308/1467116597645676546/1553134736233472173).

- **150.399 seconds (2m30s)** from first ready-colony screenshot request through success report/final pause.
- **19 controls:** 13 clicks + 6 key commands; **11 screenshots**, including the initial observation.
- **Zero rejected game inputs**, no drafting, no forced pawn jobs, no observed repeat-click adapter stalls.
- One orchestration error: image viewing was attempted before an asynchronous capture/copy completed. Waiting for that same process recovered it; elapsed time is retained.
- Screenshot-only perception and standard UI controls throughout. Pause and speed changes permitted. No game bridge, save or source inspection during the timed task.

## Usage, not invented billing

Native controller usage was captured across the task boundary: **1,995,347 input tokens**, including **1,981,056 cached**, and **2,407 output tokens**, including **151 reasoning tokens**. Uncached input: **14,291**. Cumulative deltas equal the sum of the 13 retained per-response usage records. [Usage](usage.json) contains only numeric receipt fields, not prompts, authentication or private session content.

**Actual billed USD is unavailable on this subscription route**, not zero. No alternative billing route or estimated dollar tariff was substituted. This is the actual interactive controller's usage, not the separate character-backend ledger.

The very large cached input reflects the existing project conversation. This run is therefore **calibration, not the fresh-context scored UI arm**. The future paired comparison must initialize both controllers with the same clean task context and model/settings; these usage totals cannot fairly be compared to an isolated harness agent. The model alias is openai/gpt-6-astra; no more precise revision was supplied by the route.

## Freeze and verification

[Task freeze](task-freeze.json), [metrics and hashes](metrics.json), [timestamped controls](actions.jsonl). The exact corrected adapter and private starting/ending saves are retained with the staging evidence. The task freeze and adapter hashes were recorded before starting; no adapter changes occurred during play.

Input save SHA-256: `f59c261f0737c999a6923dde87d01ce565d4b61083f41566a3b2af79feb86f0c` — identical to the [original pilot](../ui-baseline-2026-09-25/REPORT.md). Same pinned 1.6.4871 rev600 installation/mod files and native work settings at load. This is standard-UI control of the existing modded staging game, not an unmodded vanilla claim.

After gameplay stopped, offline inspection confirmed no starting campfire and final **Campfire5671**, with a **CookMealSimple / RepeatCount bill at zero remaining**. The screen record shows its initial 3x setting and the final bill-complete notification. Omitted repeatCount uses zero under the pinned game's serializer. The save check supplied no hints during play.

The uncut video includes setup, save and quit outside the task timer. It has **3 duplicate frames and 1 dropped frame**; local and remote hashes match. The recorder ended on the ordinary UI quit/display closure and the MP4 is valid. All **439 pre-existing saves and all installed mod files are unchanged**, original profile restored, game/display stopped. Isolated test saves remain private.

## Interpretation / next step

The corrected-adapter reference is 2m30s, not the original 4m12s. Both runs remain retained. Their difference is **not a measured adapter-only speedup**: prior task familiarity, input batching, observation cadence and timer boundaries also differ (the pilot excluded its initial screenshot). Nor is it a harness improvement—there is no harness arm yet.

The save, task and corrected adapter are frozen for calibration. Dollar billing remains unknown; the scored comparison still needs matched isolated controller contexts, prospective token capture and the shared T1 checker. These are benchmark integration work, not blockers for Clawd's read-only perception exporter. Three scheduled runs per arm follow when the harness exists; do not replace this calibration or the pilot with the best later attempt.
