#!/usr/bin/env bash
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Absolute lab root required}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
case "${1:-}" in game|cold) ;; *) exit 2;; esac
[[ "${2:-}" =~ ^[0-9a-f-]{36}$ ]] || exit 2
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_NATIVE_FOOD_LOCKED=1 node "$concord_root/dist/trials/native-food-game.js" "$1" "$2"
