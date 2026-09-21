# Concord development

- Preserve pawn autonomy: the core proposes, the bound pawn owns its decision. Never give character backends the lab admin or arbitrary shell/file interface.
- Game truth, character knowledge and operator diagnostics are distinct. Do not feed omniscient inspection into a character prompt.
- Keep domain IDs, deduplication and timeline invalidation below the model layer. Report actual outcomes, not intent as completion.
- Keep proprietary game files, runtime saves/databases and credentials out of Git. Use owned local assemblies to compile.
- Live inference is opt-in through finite operator trials, never enabled by default. Do not silently switch billing routes or increase operator-configured provider spending caps. Establish project accounting before unattended paid runs.
- Smooth continuous gameplay is the target; deliberate testing or extended-planning pauses are explicit modes.
- Run `npm test` for coordinator changes. Mod changes require compilation against the real installed assemblies and relevant staging acceptance. Do not claim live-model, gameplay or UI behavior from mocks alone.
- Reuse shared staging without running Android and RimWorld together; stop/save tests at handoff. Respect operator-configured maintenance windows.
- Document unimplemented seams honestly: the appraisal adapter has mocked tests plus synthetic and bounded real-game live evidence, the attention consumer has bounded live appraisal, cancellation and completed-reflection evidence in paused and continuous modes, with paired/cold restore; this does not prove long-run character quality, and the OpenClaw adapter is not an installed integration. The in-game badge is implemented.
