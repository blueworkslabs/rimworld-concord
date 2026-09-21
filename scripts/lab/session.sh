#!/usr/bin/env bash
set -euo pipefail
lab_root="${RIMWORLD_LAB_ROOT:?Set an absolute isolated lab directory}"
openbox >"$lab_root/logs/openbox.log" 2>&1 &
wm_pid=$!
trap 'kill "$wm_pid" 2>/dev/null || true' EXIT
glxinfo -B >"$lab_root/logs/renderer.txt" 2>&1
cd "$lab_root/game"
./RimWorldLinux -rimworld-lab -force-glcore -screen-fullscreen 0 -screen-width 1280 -screen-height 800 \
  "-savedatafolder=$lab_root/profile" -logFile "$lab_root/logs/Player.log"
