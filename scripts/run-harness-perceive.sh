#!/usr/bin/env bash
# Harness perception capture (docs/HARNESS.md). Read-only; zero model calls.
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Absolute lab root required}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
for concord_flag in "$@"; do case "$concord_flag" in --save=lab-*) ;; *) exit 2;; esac; done
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_HARNESS_LOCKED=1 node "$concord_root/dist/trials/harness-perceive.js" "$@"
