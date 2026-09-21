#!/usr/bin/env bash
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Set an absolute isolated lab directory}"
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" node "$concord_root/dist/src/attention-acceptance.js" "$@"
