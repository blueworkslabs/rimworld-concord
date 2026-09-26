# Placement query acceptance — 2026-09-26

**Scripted game-verified, no model calls.** On the pinned 1.6.4871 build, the read-only
placement query refused an occupied wall cell, accepted a free campfire cell and returned
nearby valid cells. Placing a campfire blueprint at the first suggested cell succeeded.
An invalid def returned a harness refusal. All checks stayed paused at tick 2.

Two Bed checks exercised North/East rotated footprints with a revealed anchor and a fogged
adjacent footprint cell. Both returned the shared harness fog refusal before inspecting
hidden terrain or occupants. Candidates also use this whole-footprint guard. Native
placement validation alone checks only the anchor, so this is an explicit harness boundary.

The full perception snapshots before/after the five queries are identical except snapshotId:
no blueprint, designation, receipt, pawn/job or tick mutation. The subsequent action adds one
blueprint and one receipt. [Sanitized results and hashes](summary.json); full wire snapshots
remain private. Compilation against pinned assemblies and 493 coordinator tests passed;
independent source review is clear. Defaults remain North and GenStuff default material,
not the UI's resource-count-dependent material selection. Query results are not reservations:
subsequent state changes can invalidate a suggested cell.

A [7.73-second original recording](https://discord.com/channels/1083662512806965308/1467116597645676546/1553376917812547774) is retained, mostly loading plus the paused fixed camera;
it does not show off-screen queried locations. It is not a visual placement walkthrough or
benchmark arm. The private cleanup verifier encountered a before.json filename collision;
restore had completed and verification was recovered against the independently retained
preceding manifest. That failure remains recorded, not relabeled as a clean script exit.
**440 saves unchanged, no additions, previous mod restored, game/display stopped.**
T1 is closed. T2/T3 require a fresh controller proof after this interface change.
