# Cold-load perception follow-up — 2026-09-26

Recorded, zero-model capture on reviewed `b4806c7`, from the unchanged T1 save.
Both raw receipts round-trip unchanged; complete exported state matches after
normalizing snapshot ID at paused tick 2. This verifies the cold-load path, not
arbitrary mods' getter purity or every alert type.

The first read reports **Need colonist beds**, **Medical treatment needed** (Beatrice,
ID 408) and **Animal starvation** (animal ID 1874). The earlier empty active-alert
cache is no longer treated as an absence of needs.

Full snapshot **325,361 bytes**; digest **11,230 bytes**, within its new 14,000-byte
budget. All 12 thought groups and all def aggregates retained, no trimming omissions.
Compaction still drops individual detail by design; `look` retrieves the full entries.
First read **278 ms**, including transport/parsing, not isolated exporter CPU time.

[Summary, alerts, video hash and preservation](summary.json) · [digest](digest.json).
Full paired raw receipts and uncut recording retained privately with the run. Original
2026-09-25 evidence remains unchanged. Independent source review clear; 464 tests and
pinned compilation pass. The compact return type and stale comments were corrected.

All **439 prior saves unchanged**, no added saves; previous mod restored, game/display
stopped. No action trial, scored benchmark, model calls or harness advantage claimed.
