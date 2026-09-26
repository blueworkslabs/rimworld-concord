# Construction slice #89: retired unmerged, reusable evidence

The agreed [phase-2 plan](PHASE2.md) retires [#89](https://github.com/blueworkslabs/rimworld-concord/pull/89)
when step A's first PR lands. **This is a direction change, not Gate C acceptance.**
Keep branch `feat/native-construction` and its final
[reviewed revision `7f881d3`](https://github.com/blueworkslabs/rimworld-concord/tree/7f881d367702c93cc106bc7223256aebe791de04).
No branch, recording, failure, checkpoint or historical design is deleted.

## Reuse inventory (candidates, not authorization to import the whole slice)

- Native blueprint/frame transitions, ordinary placement checks, withdrawal/cancellation
  boundary knowledge and actual receipt serialization lessons can inform minimal
  player-equivalent actions and later carrier-specific refusal checks.
- `trials/native-construction-game.ts`, `trials/native-construction-restore.ts` and the
  lock/fixture guard patterns are useful **test designs**. Reuse needs a fresh review,
  current runner preconditions and an assertion that its named branch really occurred.
- Recorded successes: basic campfire construction; ordinary cancellation versus
  deconstruction; accrued-work preservation; four withdrawal branches; blueprint/frame
  comparisons and successful continuation on the corrected build. These remain evidence
  for that old slice, not new-build acceptance.
- `mod/NativeBuild.cs`, `mod/NativeBuildPatches.cs`, `src/native-build.ts` and their tests
  remain archived reference code. **Do not carry their contribution/attribution ledger
  into phase 2.** Only minimal consent/ownership identities and truthful action receipts
  may be reused where the agreed new design requires them; review and test separately.
- Generic harness blueprint/bill actions already merged on main are separate from this
  unmerged construction-consent/accounting implementation. Closing #89 does not remove them.

## Limits retained

The replacement fixture was rejected by native placement. Forced work occurred, but the
queued-restore precondition failed because the job started immediately; that remains
unexercised. Eleven of seventeen case names remained unrun, and four hook paths were
unmeasured. Capped throughput did not establish absence of slowdown. The earlier native
construction failure, serialization failure and corrected attempts all stay in the record.

Pinned evidence: [review and limits](https://github.com/blueworkslabs/rimworld-concord/blob/7f881d367702c93cc106bc7223256aebe791de04/docs/trials/NATIVE_CONSTRUCTION_REVIEW.md),
[first review receipts](https://github.com/blueworkslabs/rimworld-concord/blob/7f881d367702c93cc106bc7223256aebe791de04/docs/evidence/native-construction-review.json),
[second review receipts/recording hashes](https://github.com/blueworkslabs/rimworld-concord/blob/7f881d367702c93cc106bc7223256aebe791de04/docs/evidence/native-construction-review-round2.json).
