#!/usr/bin/env bash
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Set an absolute isolated lab directory}"
case "${1:-game}" in
  fixture) concord_entry=rescue-fixture; concord_args=() ;;
  game) concord_entry=rescue-acceptance; concord_args=() ;;
  interruptions) concord_entry=interruption-acceptance; concord_args=() ;;
  interruptions-cold) concord_entry=interruption-acceptance; concord_args=(--cold) ;;
  cold) concord_entry=rescue-acceptance; concord_args=(--cold) ;;
  *) echo 'Usage: run-rescue-lab.sh [fixture|game|cold|interruptions|interruptions-cold]' >&2; exit 2 ;;
esac
if [[ "$RIMWORLD_LAB_ROOT" != /* ]]; then echo 'Absolute lab root required' >&2; exit 2; fi
# The marker is only set inside the lifetime lock, after successful acquisition.
# This is trusted operator tooling, not a sandbox against a malicious local caller.
exec flock -n "$RIMWORLD_LAB_ROOT/concord/coordinator.lock" env CONCORD_RESCUE_LOCKED=1 \
  node "$concord_root/dist/src/$concord_entry.js" "${concord_args[@]}"
