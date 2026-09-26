# Phase 2 A: narration and ordinary bed assignment — 2026-09-26

**Recorded scripted/UI evidence, zero model calls. Not a scored arm or the sealed
four-of-five viewer-legibility test.** PRs [#103](https://github.com/blueworkslabs/rimworld-concord/pull/103)
and [#104](https://github.com/blueworkslabs/rimworld-concord/pull/104).

## Build and protocol

Pinned game **1.6.4871 rev600**, assembly and tested DLL hashes in [manifest](manifest.json).
Independent source review and substantive re-reviews cleared the corrected runtime.
501 coordinator tests passed; real-assembly compilation and 14 Mono wording assertions passed.
The mod remains lab-only. No character changes, direct pawn jobs or developer construction.

The original T2 start has **no beds**. Authored player-equivalent blueprint controls built
 two wooden single beds and a campfire through ordinary native jobs. A separate named
fixture checkpoint was saved; the frozen T2 bytes were verified and left unchanged.
No model or benchmark controller participated. The acceptance script fails on missing
fixture prerequisites and journals requests/replies/snapshots incrementally.

## Results

Both scripted checks passed their assertions: **17 returned action receipts, 15 distinct
narrated request IDs** (two returns were same-ID placement retries). A separate stale-epoch
request was rejected without a saved receipt, mutation or narration.

- Native placement refusal and harness non-bed refusal preserve their actual reasons.
  The selected native refusal was **“Too close to map edge”**, not proof of an occupied-cell
  rejection; labels do not substitute for the actual receipt.
- Blueprint placement, effective work-priority read-back, forbid/no-change/allow,
  cell-target mining and cancellation all matched their receipts.
- Two distinct, identical-worded bill requests created two bills and two archive messages;
  replaying one request ID did neither again.
- Bed assignment released an existing previous bed, reported a no-change repeat, and
  displaced the owner of a full single bed. Both ownership snapshots matched.
- Same-game-process save/load kept the receipts and message-history counts; post-load
  retry returned the same receipt with no added line. No process-cold restore is claimed.
  The pre-save scripted interval remained paused; reload advanced the clock by one tick.
- Manual UI inspection of the initial recording showed harness-only records in both
  [compact](a1-compact.png) and [full journal](a1-journal.png) views, and native messages
  [paused](a1-paused-message.png) and [running](a1-running-message.png).

## Failures and corrections retained

The initial assertion pass was **not a clean native-log pass**. Its log contained a
redundant thing-index lookup for the cell-only Mine designation and two unresolved
compressed-rock references in saved message targets. The final build skips that index
lookup and uses stable native cell/map targets for save-compressible things. The recorded
repair pass repeats the scripted suite and has neither warning. Headless audio-device
warnings remain. The initial T2 load also retained its pre-existing Job_0 reference warning.

An extra diagnostic initially assumed cell (0,0) was fogged. The game refused mining there;
that failed probe remains in the private wire evidence and original recording. The corrected
known fog-edge cell (146,16) accepted mining and narrated only an undiscovered location,
without its contents. This was a named diagnostic correction, not a scored reroll.

Other source fixes: distinct messages now bypass native text coalescing only within the
exact new-receipt publication scope; normal game messages retain their native handling.
`shown` checks live-list acceptance, **not pixels read by a viewer**. Both journal views
work without a coordinator report. Native designation read-back matches the appropriate
thing/cell and only actually affected targets. Deathrest caskets are rejected before
mutation because they use a separate ownership slot; all special bed classes were not
instantiated in this fixture.

## Recordings, receipts and preservation

- [Initial uncut recording, 2:28.467](https://rimworld-concord.pages.dev/assets/recordings/harness-a1-initial-2026-09-26.mp4): native fixture construction, scripted checks, reload, diagnostic correction and UI inspection.
- [Repair uncut recording, 22.600s](https://rimworld-concord.pages.dev/assets/recordings/harness-a1-repair-2026-09-26.mp4): final-build scripted check including loading/save/load.
- [Initial receipts and preservation](initial.json) · [Repair receipts and preservation](repair.json) · [SHA-256 manifest](manifest.json).

Both original recording copies match staging hashes. The first run preserved all **443**
pre-existing saves and added the fixture plus one checkpoint. The repair preserved all
**445** then-existing saves and added one checkpoint. Prior mod restored each time;
game/display stopped. Raw snapshots, wire journals, source probes and player logs remain
private; no proprietary save or assembly is committed.

## Limits and next step

No T1–T4 regression or new effective-controller proof was run on this changed interface;
those precede future scored launches. Native message lifespan/live-count limits still
apply. The receipt/journal persists, but a readable screenshot is not the sealed viewer
measure. Fable owns that rubric/key and the broader project/docs/site review next.
T4 completed-tending witness, roofed-sleep fixture and authored viability remain pending;
so do the new core integration, annotation join and binding-refusal phase.
