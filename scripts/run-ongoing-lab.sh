#!/usr/bin/env bash
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Absolute lab root required}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
case "${1:-}" in game) concord_args=();; cold) concord_args=(--cold);; *) exit 2;; esac
shift
for concord_flag in "$@"; do
 case "$concord_flag" in --scripted|--recorded|--native-haul|--hauling-migration) concord_args+=("$concord_flag");; *) exit 2;; esac
done
exec flock -n -F "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_ONGOING_LOCKED=1 node "$concord_root/dist/trials/ongoing-game.js" "${concord_args[@]}"
