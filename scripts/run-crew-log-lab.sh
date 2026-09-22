#!/usr/bin/env bash
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Set an absolute isolated lab directory}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
case "${1:-}" in game) concord_args=();; cold) concord_args=(--cold);; *) echo 'Use game|cold' >&2; exit 2;; esac
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_CREW_LOG_LOCKED=1 node "$concord_root/dist/src/crew-log-acceptance.js" "${concord_args[@]}"
