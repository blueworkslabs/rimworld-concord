# Coarse core status: design decision, not implemented telemetry

The agreed direction permits useful coarse bodily status without private-thought
access. We will use **explicit shared-link telemetry**, not claim that a hidden
need meter is something the core visually observed. This is a future sensor
capability, to be implemented and tested before the campfire/cooking trial; the
current lifecycle PR does not add it to the core perspective.

- Limit initial telemetry to Food and Rest status bands. Exclude mood, private
  memories, relationships, personal interpretations and exact need fractions.
- Label each reading with pawn, source `shared-link`, observed tick and freshness.
  Unavailable, stale or conflicting readings become unknown, never comfortable.
- The link reports coarse embodied state, not motives, willingness, medical
  diagnoses, guaranteed job readiness or permission to act. It does not manufacture
  visual cues, and the observer player's debug access is not its justification.
- Keep a pawn's deliberate report separately attributed even if it disagrees with
  telemetry. A reading and a claim are not interchangeable evidence.
- Only meaningful band transitions should be considered for bounded scheduling;
  polling must not create thoughts. Exact thresholds, expiry and deduplication
  belong in the versioned sensor contract and native acceptance tests.
- Better status does not reopen deferred work or override refusal. Re-invitation
  still needs the pawn's deliberate request and fresh work consent.

This resolves the design direction before expanding physical capabilities, while
keeping the current evidence honest: no core bodily sensor has yet been added.
