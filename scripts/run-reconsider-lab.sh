#!/usr/bin/env bash
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Set an absolute isolated lab directory}"
if [[ "$RIMWORLD_LAB_ROOT" != /* ]]; then echo 'Absolute lab root required' >&2; exit 2; fi
case "${1:-}" in
 fixture) concord_entry=reconsider-fixture; concord_args=() ;;
 game) concord_entry=reconsider-live; concord_args=() ;;
 cold) concord_entry=reconsider-live; concord_args=(--cold) ;;
 *) echo 'Usage: run-reconsider-lab.sh [fixture|game|cold] [--scripted]' >&2; exit 2 ;;
esac
if [[ "${2:-}" == --scripted ]]; then concord_args+=(--scripted); fi
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_RECONSIDER_LOCKED=1 \
 node "$concord_root/dist/src/$concord_entry.js" "${concord_args[@]}"
