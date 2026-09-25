# Hauling migration — live recording, 2026-09-25

**The single signed run is complete. Fable's recording-only cold read is next;
technical findings and Gate C verdict are deliberately withheld.** No rerolls or
runtime changes were made.

[Download/watch the uncut original MP4](../../diary/assets/recordings/hauling-migration-live-2026-09-25.mp4)
· [Recording and preservation evidence](../evidence/hauling-migration-live-recording.json)
· [Signed freeze](HAULING_MIGRATION_LIVE_FREEZE.md)

The original is **10:04.467**, including recording lead/trail; 14,228,095 bytes,
1280×800 at 15 fps, silent, 9,067 decoded frames. The capture log reports
**zero dropped frames and one duplicated frame**. SHA-256:
`b2c281ab7ecff69afb98546d341ca42f0daa3eb3cfd54292d060e4c8523b1368`. The local copy matches the retained remote original.
Continuous observation lasted **601.262 seconds**; all 372 sampled game
states were unpaused.

Paired restore and cold restore in **new host and coordinator OS processes** passed
against the retained checkpoint and actual game ledger. The game process stayed up
and reloaded the paired save. Cold restore made no additional inference calls;
project accounting was unchanged. Staging is stopped after a new handoff save;
all **407 pre-existing saves** are unchanged. The signed executable fingerprint
still matches after the run.

All exact input snapshots, returned choices, failures, cancellation records, game
receipts, databases and checkpoints are retained privately. This page contains only
capture, restore and preservation metadata, not a clean-cognition claim. No automated
video review was requested ahead of Fable.

**Read order:** uncut recording → Fable's four-sentence read → technical findings →
Gate C verdict → deletion PR. #71's live checks will be assessed in those findings;
unexercised branches will remain explicitly unexercised, not passed. Growing remains
parked at B1 2/2. No legacy deletion or completion-report-to-receipt linking has begun.
