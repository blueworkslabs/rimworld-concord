#!/usr/bin/env bash
# One matched benchmark run (docs/HARNESS.md): a fresh controller context, one arm, one task.
# Usage: run-benchmark.sh --arm=harness|ui --task=T1 --save=lab-... --model=<alias> [--reasoning=...] [--ui-server=<json>]
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Absolute lab root required}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
for concord_flag in "$@"; do case "$concord_flag" in --arm=harness|--arm=ui|--task=T[0-9]*|--save=lab-*|--model=*|--reasoning=low|--reasoning=medium|--reasoning=high|--ui-server=/*) ;; *) exit 2;; esac; done
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_HARNESS_LOCKED=1 node "$concord_root/dist/trials/benchmark-run.js" "$@"
