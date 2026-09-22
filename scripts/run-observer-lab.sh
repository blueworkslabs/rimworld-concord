#!/usr/bin/env bash
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Set absolute lab root}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
concord_entry=observer-live
case "${1:-}" in fixture) concord_entry=observer-fixture; concord_args=();; game) concord_args=();; cold) concord_args=(--cold);; *) echo 'Use game|cold'; exit 2;; esac
if [[ "${2:-}" == --scripted ]]; then concord_args+=(--scripted); fi
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_OBSERVER_LOCKED=1 node "$concord_root/dist/src/$concord_entry.js" "${concord_args[@]}"
