#!/usr/bin/env bash
# Game-host side of one cross-host benchmark pair (docs/HARNESS.md). Started by the controller host
# (trials/benchmark-host.ts) over `ssh -o BatchMode=yes`; this session's stdio is the wire. Holds the
# lab lock for both runs of the pair; each run's arm server, reached over its own ssh session, only
# serves while that lock is held.
# Usage: run-benchmark-pair.sh --order=harness,ui|ui,harness --task=T1 --save=lab-... --model=<alias> [--reasoning=...] --ui-server=/abs.json [--rehearsal=true]
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${RIMWORLD_LAB_ROOT:?Absolute lab root required}"
[[ "$RIMWORLD_LAB_ROOT" == /* ]] || exit 2
concord_order=""; concord_pass=()
for concord_flag in "$@"; do case "$concord_flag" in
  --order=harness,ui|--order=ui,harness) [[ -z "$concord_order" ]] || exit 2; concord_order="${concord_flag#--order=}" ;;
  --task=T[0-9]*|--save=lab-*|--model=*|--reasoning=low|--reasoning=medium|--reasoning=high|--ui-server=/*|--rehearsal=true) concord_pass+=("$concord_flag") ;;
  *) exit 2 ;;
esac; done
[[ -n "$concord_order" ]] || exit 2
exec 9>>"$RIMWORLD_LAB_ROOT/concord/coordinator.lock"
flock -n 9 || { echo 'Lab is busy' >&2; exit 3; }
for concord_arm in ${concord_order//,/ }; do
  CONCORD_HARNESS_LOCKED=1 node "$concord_root/dist/trials/benchmark-run.js" --arm="$concord_arm" --controller=host "${concord_pass[@]}" 9>&-
done
