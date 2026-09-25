# Construction and cooking migration — planning notes

**Status: next migration; design and staging gates are not yet signed.** Hauling's
retirement does not authorize construction/cooking implementation or a live run.

The intended targets are native blueprints and bills. Budget a test-port PR before
the runtime deletion PR, using the actual dependency footprint recorded in the
[hauling retirement ledger](MIGRATION_HAULING.md#retiring-the-ordered-haul).

## Readiness debt carried by the hauling deletion

`Production.Ready` intentionally retains the former `Hauling.Ready` checks unchanged,
including the 35% food/rest stop and the incorrect shared
`WorkTagIsDisabled(WorkTags.Hauling)` gate. Remove that borrowed gate with this
migration; capability must use the work type's own disabled state (construction or
cooking), as hauling's not-offered path already does for its own work type. Do not
silently change build/cook behavior in the hauling deletion PR.
