# Native recovery log verification

This is a zero-inference operator-authored mechanics test. A disposable rescue
fixture uses finite anesthesia; no rescue job is proposed or dispatched. The
observer first sees the downed patient. The test checks actual native recovery,
record attribution/timing, duplicate suppression, paired restore and cold restart.

A separate saved-fixture branch explicitly relocates the observers out of sight
while the patient recovers, then relocates one observer nearby. This is not a
claim of native navigation: it verifies that no out-of-view recovery is emitted,
and that a persisted downed sighting permits a record only after reacquisition.
Returning to the earlier paired checkpoint removes that branch's future records.

Build with `npm test` and compile the mod using owned installed game assemblies.
On the isolated staging environment, use the lifetime-locked launcher:

```
RIMWORLD_LAB_ROOT=/absolute/lab bash scripts/run-rescue-lab.sh fixture
RIMWORLD_LAB_ROOT=/absolute/lab bash scripts/run-rescue-lab.sh native-log
# After an actual game restart:
RIMWORLD_LAB_ROOT=/absolute/lab bash scripts/run-rescue-lab.sh native-log-cold
```

Direct entry and lock contention are tested before game transport. Raw saves and
receipts remain private; sanitized verification evidence is published separately.
No model allowance is established or consumed by this test. Native recovery means
no longer downed, not full health, treatment or rescue. General reflection pacing
and richer character/social behavior remain separate work.
