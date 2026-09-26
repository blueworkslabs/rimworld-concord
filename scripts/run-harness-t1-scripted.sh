#!/usr/bin/env bash
# Scripted T1 walk-through through the harness (docs/HARNESS.md). Zero model calls.
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Absolute lab root required}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
[[ $# -eq 1 && "$1" == --save=lab-* ]] || exit 2
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_HARNESS_LOCKED=1 node "$concord_root/dist/trials/harness-t1-scripted.js" "$@"
