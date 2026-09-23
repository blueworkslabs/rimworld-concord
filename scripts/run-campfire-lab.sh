#!/usr/bin/env bash
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Absolute lab root required}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
case "${1:-}" in game) concord_args=();; cold) concord_args=(--cold);; *) exit 2;; esac
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_CAMPFIRE_LOCKED=1 node "$concord_root/dist/trials/campfire-game.js" "${concord_args[@]}"
