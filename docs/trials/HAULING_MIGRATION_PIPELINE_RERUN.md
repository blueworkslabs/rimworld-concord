# Hauling migration — pipeline-corrected rerun, 2026-09-25

## Authorization and unchanged setup

Fable’s [Part D disposition](https://discord.com/channels/1083662512806965308/1467116597645676546/1552972709065924719)
classified the [first live run](HAULING_MIGRATION_LIVE.md) as retained diagnosis, not a
scene: Gate C did not pass and no deletion was authorized. She directed six pipeline
corrections followed by one rerun of the same frozen setup. The original recording,
cold read and findings remain intact. This is the separately identified authorized
rerun, not an erased or relabelled first attempt.

[PR #77](https://github.com/blueworkslabs/rimworld-concord/pull/77) merged at
`e436933d349942d4e1062acb2768ef4a224e8875` after independent review, corrections and
focused re-review. **423 tests passed**; the independent focused suite passed 98.
Corrections cover explicit consumption-report receipt binding, capacity-aware topic
schemas, existing-open-only action links, grounded rejection causes through the native
relay, visible failure counts and heard/wait status, and eating-count revalidation.
These checks were offline; the rehearsal below is authored-only. Live coverage must
be established from the retained scene, not inferred from either.

[Public freeze projection and rehearsal evidence](../evidence/hauling-migration-pipeline-rerun-freeze.json)
records the reviewed runtime and hashes. Full canonical setup inputs remain private;
the public projection is deliberately not itself the canonical fingerprint input.

- New setup SHA-256: `ac88cea172160541a20a6a280e398ae7273ac82852e77efce7736ffd064e3d4f`.
- Same helper save and **75 wood** quota; strict, attribution-only native hauling in
  ordinary play, with rescue, construction and cooking unchanged.
- Pedro and Beatrice capable; Alvin natively incapable, no capability override.
- Same native Luna at low, no Jev, no model-turn cap, ten-minute continuous window,
  #64 recording protocol and failure stop rule. No additional rerolls.
- Same #71 live checks: receipt-age prefixes, causes and per-lane visible failures,
  lapsed wording if a late offer answer occurs. Unexercised branches remain gaps.
- Same cold restore: new host and coordinator processes, game process stays up and
  reloads the paired save. No inference during restore.

## Recorded zero-model rehearsal

Run `78fc3693-d3ae-474d-a752-2c68a3d49f3c`: both capable pawns received and accepted
authored offers, 75/75 credited, and paired plus new-process cold restores matched
the retained game ledger. Zero model calls. The original 49-second rehearsal video
is retained privately, SHA-256
`7b326f19ca8692f7ead4038f15132bf4f071ccc8ea47ee7bde76f4b930eaeb3e`.
This is not evidence of what the live model chooses.

## Live evidence

**The one authorized rerun is complete. Technical findings remain withheld for
Fable’s recording-only cold read.**

[Watch/download the uncut original MP4](../../diary/assets/recordings/hauling-migration-pipeline-rerun-2026-09-25.mp4)
· [Preservation metadata](../evidence/hauling-migration-pipeline-rerun-recording.json)

Run `25bcdc7e-c6c3-40bc-8f95-f9659afc1e10`: **10:04.867**, 14,143,927 bytes,
1280×800, 15 fps, 9,073 decoded frames, silent. Capture reports zero dropped frames
and one duplicated frame; both are retained in the original bytes. SHA-256:
`9ea5f3bcc6cd00b03096515b43127dcc4a01ad54aec07ae80da640a6f96c12cf`.
Remote and copied-file hashes match. Continuous observation lasted 601.766 seconds;
all 371 sampled states were unpaused.

Paired and new-process cold restores passed against the retained checkpoint and
the actual game ledger. Host process 551655 → 566669; coordinator 177691 → 178643.
The game process stayed running and reloaded the checkpoint. No inference was
added during cold restore. These are preservation checks, not a Gate C verdict.

Staging is stopped after a new handoff save. All **409 pre-existing saves** are
unchanged, and the executable fingerprint matches after the run. Exact requests,
responses, failures, accounting, game receipts, databases, checkpoints and capture
logs remain private and intact. No further scene was run.
Read order stays: uncut recording → Fable’s recording-only read → technical findings
→ verdict. Growing remains parked at B1 2/2. No deletion PR.
