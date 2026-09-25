# Perception capture — 2026-09-25

**Scripted capture passed, not a harness-versus-UI benchmark.** Reviewed runtime
`905c0bce616fe568547c723f6a52d3065a15a0e3`; 463 tests and pinned compilation passed.
Independent review and focused re-review resolved six material findings before staging.

## Recorded result

One capture loaded the unchanged T1 fixture, paused, and read twice at game tick 2.
Both raw receipts survived schema parsing unchanged; all exported state matched after
normalizing only the snapshot ID. `since` returned no changes. The runner asserts these
conditions and retains raw receipts on failure. No model calls or gameplay actions;
load/pause were explicit setup. Original saves were not written.

- Full snapshot: **325,064 bytes**, 2,072 things and three colonists.
- Digest: **23,946 bytes**, within the 24,000-byte limit. Removed 136 plants, 921 filth,
  485 items and 445 other things, with omission counts and queries back to the full data.
- First perception round trip: **391 ms**, including mailbox transport and parsing;
  not exporter-only CPU time or a repeatability estimate.
- Mood thought groups: Alvin **5 / 206 bytes**, Beatrice **4 / 165 bytes**, Pedro
  **3 / 122 bytes**. All retained in the digest: **493 bytes** of thought arrays total.
  Keep the complete exported groups for T1; this does not prove that every colony's list fits.
- Visible health includes Beatrice's two asthma conditions despite summary health 1.0.
- **439 prior saves unchanged**, no added saves; incoming mod restored; game/display stopped.

The 9.533-second uncut recording includes load and the paused capture. SHA-256:
`fe9b6d2d0f593d69a7eb602f961a6d46460ecded501b43d855f69736327cf01f`.
Local copy matches remote bytes. Source save SHA-256:
`f59c261f0737c999a6923dde87d01ce565d4b61083f41566a3b2af79feb86f0c`.
Installed game assembly SHA-256:
`082db1dd4f7f1d0b72960d7e1beead8fbfe6957200e8627f65bda0dbbe1dd8f8`.
Compiled mod SHA-256:
`656f482671e9895f54b8e16c74cb065bb94fa35915671bab8eaab650a67980cb`.

## Evidence and limits

[Actual full wire snapshot](../../../tests/fixtures/perception-staging.json),
[digest](digest.json), [summary](summary.json), [preservation](preservation.json).
Full raw paired receipts and the recording are retained with the staging run; the synthetic
fixture remains separate for branches absent from this save.

This is a cold-loaded, paused save. Alerts, letters, zones, bills, designations, threats
and the resource counter were empty; the screenshot also showed no active alerts and a
zero resource readout. This does **not** establish nonempty export coverage for those
sections or a complete strategic picture. Loose items are nevertheless in map things.
An empty cached readout is not proof the colony has no medical needs or resources.
Bill restrictions and hidden-enemy exclusion have source/offline review, not this runtime case.

Read-only means perception does not issue gameplay actions or run legacy job reconciliation.
Native UI/thought getters may refresh caches; paused snapshot equality is not proof all process
memory is unchanged. No new engine patches were added. The public snapshot is a v1 subset:
terrain/roof grids, apparel/equipment detail, non-colonist non-threat pawns and some treatment
settings are not represented. These limitations remain explicit; this is not a whole-UI parity claim.

Next: native actions v1 and T1 completion checker, then matched fresh-context benchmark arms.
No speed, token or dollar-cost advantage over the UI has been measured.
