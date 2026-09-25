# Ordered-haul retirement verification — 2026-09-25

Behavior under test: `531a3e0`, [PR #80](https://github.com/blueworkslabs/rimworld-concord/pull/80),
after the [#79 test port](https://github.com/blueworkslabs/rimworld-concord/pull/79).
This implements the existing [game-side Gate C verdict](HAULING_MIGRATION_GATE_C.md),
not a new live-model verdict.

## Review and offline checks

Independent Codex review and focused re-review completed. Two deletion gaps were
corrected: old persisted haul actions could still dispatch or be falsely completed,
and three surviving core scenes still required the removed hauling fixture.
Opening/restoring unsupported stored actions now fails before recovery or game
loading, without modifying historical records. Read-only exports and matching
historical revisions remain the way to inspect/replay them; no automatic migration.

Fable's requested fixture adapters moved out of runtime protocol into
`trials/fixtures/legacy.ts`. The frozen `active-haul` model-contract case and all
existing evidence/fixture JSON remain unchanged; any future native counterpart must
be authored alongside it. Construction/cooking's retained readiness debt is recorded
in [its planning notes](../MIGRATION_PRODUCTION.md), not silently fixed here.

Clean build: **400 passing tests, zero failures, two pre-existing native freshness
TODOs**. Both TODOs remain through deletion; no claim that those runtime defects or
the duplicate-exclusion delay are fixed. The mod compiles against the pinned 4871
assemblies; no proprietary assemblies are distributed.

## Focused staging — scripted, zero model calls

[Sanitized receipt and raw-evidence hashes](../evidence/hauling-retirement-acceptance.json).
Under one exclusive coordinator lock on a clean mod install:

- Removed `haul` dispatch and cancellation kinds were rejected without creating actions.
- Unknown cancellation kinds were rejected for both new and existing IDs.
- Pawn state no longer contained ordered-haul options or `workReady`.
- The ordinary-play menu retained other work and both capable native-haul recipients.
- Both pawns accepted authored offers; native hauling delivered **75/75**, with two
  reservation holders, zero overshoot and zero recorded consent violations.
- Paired restore matched the retained game intent ledger. A second coordinator process
  restored the same checkpoint and matched it again; the game process stayed up.

No character capability or original save was edited. All **412 pre-existing saves**
are unchanged; one new uniquely named verification checkpoint was retained. The
previous complete installed mod was restored, and game/display are stopped.
This is scripted protocol/ledger evidence, not live-model or new UI acceptance.
