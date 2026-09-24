#!/usr/bin/env bash
# Scripted native-haul sub-runs (docs/SPIKE_NATIVE_HAUL.md). Zero model calls.
# Needs .runtime/native-haul-fixture.json: {"main":{"save","area"},"meal":{...},"helper":{...}}.
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Absolute lab root required}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
case "${1:-}" in main) concord_args=();; meal) concord_args=(--meal);; helper) concord_args=(--helper);; *) exit 2;; esac
shift
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_NATIVE_HAUL_LOCKED=1 node "$concord_root/dist/trials/native-haul-game.js" "${concord_args[@]}" "$@"
