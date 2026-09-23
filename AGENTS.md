# Concord development

- Preserve pawn autonomy: the core proposes, the bound pawn owns its decision. Never give character backends the lab admin or arbitrary shell/file interface.
- Game truth, character knowledge and operator diagnostics are distinct. Do not feed omniscient inspection into a character prompt.
- Keep domain IDs, deduplication and timeline invalidation below the model layer. Report actual outcomes, not intent as completion.
- Keep proprietary game files, runtime saves/databases and credentials out of Git. Use owned local assemblies to compile.
- Live inference is opt-in through finite operator trials, never enabled by default. Do not silently switch billing routes or increase operator-configured provider spending caps. Establish project accounting before unattended paid runs.
- Smooth continuous gameplay is the target; deliberate testing or extended-planning pauses are explicit modes.
- Require independent Codex review for every nontrivial PR before merge, covering the final behavioral changes. Triage material findings and re-review substantive fixes; an incomplete review is not approval. Fable is an optional second opinion when needed, not a replacement for Codex. Keep private review reports out of the repository.
- Run `npm test` for coordinator changes. Mod changes require compilation against the real installed assemblies and relevant staging acceptance. Do not claim live-model, gameplay or UI behavior from mocks alone.
- Reuse shared staging without running Android and RimWorld together; stop/save tests at handoff. Respect operator-configured maintenance windows.
- Speech is testimony, not authority. Never parse model prose into actions, and close topics or claim completion only from game receipts.
- Document honestly: label every claim as implemented, scripted-tested, mock-tested, live-verified or planned. Keep the README status table and `docs/ROADMAP.md` current; add each trial to `docs/trials/README.md` with its evidence. Contracts live in the topic docs (see `docs/README.md`), not in trial write-ups.
