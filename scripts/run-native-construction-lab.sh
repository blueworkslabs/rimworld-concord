#!/usr/bin/env bash
# Scripted construction checks (docs/MIGRATION_PRODUCTION.md, P4 construction 1-17). Zero model calls.
# Needs .runtime/native-construction-fixture.json (see the header of trials/native-construction-game.ts).
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Absolute lab root required}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
for concord_flag in "$@"; do case "$concord_flag" in --case=*) ;; *) exit 2;; esac; done
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_NATIVE_CONSTRUCTION_LOCKED=1 node "$concord_root/dist/trials/native-construction-game.js" "$@"
