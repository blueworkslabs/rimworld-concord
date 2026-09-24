#!/usr/bin/env bash
# Scripted hauling-migration checks (docs/MIGRATION_HAULING.md, Gate B). Zero model calls.
# Needs .runtime/hauling-migration-fixture.json: {"save":"lab-...","manifest":<fixture script output>}.
# --strict runs the same checks with the strict hold (the signed fallback).
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Absolute lab root required}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
for concord_flag in "$@"; do case "$concord_flag" in --strict|--case=*) ;; *) exit 2;; esac; done
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_HAULING_MIGRATION_LOCKED=1 node "$concord_root/dist/trials/hauling-migration-game.js" "$@"
