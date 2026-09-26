#!/usr/bin/env bash
# Controller isolation proof for the benchmark (docs/HARNESS.md). No game, no model.
# Usage: run-benchmark-controller-proof.sh --model=<alias> [--reasoning=low|medium|high]
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
for concord_flag in "$@"; do case "$concord_flag" in --model=*|--reasoning=low|--reasoning=medium|--reasoning=high) ;; *) exit 2;; esac; done
exec node "$concord_root/dist/trials/benchmark-controller-proof.js" "$@"
