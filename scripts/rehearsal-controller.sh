#!/usr/bin/env bash
# Scripted stand-in controller for benchmark lifecycle rehearsals (never a scored run).
exec node "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)/dist/trials/rehearsal-controller.js" "$@"
