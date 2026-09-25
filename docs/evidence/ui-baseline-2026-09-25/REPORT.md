# RimWorld standard-UI feasibility pilot — 25 September 2026

## Result

**Passed on the first attempt:** an agent built a campfire and completed three simple-meal cooking iterations using screenshots, mouse clicks and keyboard input through RimWorld's standard UI. No drafting, forced pawn jobs, semantic game controls or game-state reads during play. The game AI performed the work.

[Uncut recording, 7:13.333](https://discord.com/channels/1083662512806965308/1467116597645676546/1553129335798501606). Loading and save/quit are included, outside the task timer. This is a usable first UI reference, not proof that a future harness is faster.

## Measured baseline

- Frozen task: build one campfire, then complete a **Do X times: 3 / Cook simple meal** bill. Timeout: 20 minutes.
- Task wall time: **251.903 seconds (4m12s)**, from the ready paused colony/start marker through the success acknowledgement and final pause. First screenshot showing completion arrived at **235.851 seconds (3m56s)**.
- **20 control commands: 14 mouse clicks, 6 key commands.** A click counts as one pointer-and-button command, not an individual operating-system event.
- **12 screenshots during the interval**, plus one initial colony screenshot used before starting the timer.
- **1 rejected placement**, recovered without restarting. Zero drafts or forced pawn jobs.
- Controller tokens and cost: **not isolated / unavailable**, not zero. No additional character-model backend calls were made.

The controller placed the campfire through Architect, enabled Pedro's construction work, used ordinary speed/pause controls, then added and configured the cooking bill. The built campfire is visible in s010; the accidental duplicate-placement rejection in s011; the configured three-iteration bill in s016; and the completed 0x bill in s018. The initial colony is s006. All screenshots and timestamped inputs are retained.

## Verification and preservation

After play ended, a separate read-only check of the saved files found **no campfire initially and Campfire5668 at (79, 0, 83) afterward**, with a CookMealSimple / RepeatCount bill and zero remaining. The pinned game's serializer omits repeatCount when zero. This corroborates the visible 3x → 2x → 0x progression; no end-stock subtraction is used as proof of cooking, since food can be eaten.

The recording is uncut, 1280×800 at 15 fps, 11,328,346 bytes; ffmpeg reported **3 duplicated frames and 1 dropped frame**. It ended when normal UI Quit to OS closed the display; the MP4 is valid. Local and remote SHA-256 match:

`776d0c60e75499e3d05c4eba8d7c358fe44d31cf0c40078ffad870ca9951f243`

The isolated input-save SHA-256 is:

`f59c261f0737c999a6923dde87d01ce565d4b61083f41566a3b2af79feb86f0c`

The ending save SHA-256 is:

`e13f2a651a34e6dfa231bc2f8dba073a88bc455474d6e995fa78f769f3714b24`

All **439 pre-existing saves and installed mod files are unchanged**. The original profile is restored; game and display are stopped. Start/end saves and the private setup manifest are retained privately, not distributed in this packet.

## What this baseline does and does not establish

This was GPT-6 Astra with prior project knowledge, controlling **1.6.4871 rev600 on the existing staging installation** (Core, Biotech, Odyssey, Harmony, StagingLab and Concord). It used the standard UI, not Concord controls. It was not an unmodded-vanilla test or a fresh agent context. The existing helper fixture supplied the starting colony/resources. There was one first attempt, no reroll.

Two roughly 16-second waits came from the generic mouse adapter's `mousemove --sync` behavior at an unchanged position. That flag was removed mid-pilot; the correction and its elapsed time are retained. These are adapter overhead, not evidence that RimWorld's UI itself is inherently slow. Raw wall time also includes reasoning, tool/network latency and waits; no favorable adjusted time is substituted.

This demonstrates a small complete build-and-cook workflow, not sustained colony management, combat, or general reliability. It does not yet establish a harness advantage.

## Fair future comparison

Keep this pilot as the first reference. For a matched UI-versus-harness benchmark, use this same input-save hash, game/mod versions, task, success check, model and budgets; permit the same pause/speed policy and forbid drafting in both arms. Define timer boundaries consistently. Freeze the corrected generic input adapter before the comparison and run a matched UI arm; do not credit a harness with beating a known adapter stall. Capture per-task controller tokens/cost prospectively. Compare completion, wall time, cost and rejected actions; do not equate one semantic harness action with one mouse click. Preserve every scheduled attempt and use multiple tasks/trials before claiming general superiority.

No harness implementation, construction-ledger work or paid replay was started for this pilot.

[Original evidence packet with the five referenced screenshots](https://discord.com/channels/1083662512806965308/1467116597645676546/1553129891455696939). This repository copy preserves the pilot result; no rerun is substituted.
