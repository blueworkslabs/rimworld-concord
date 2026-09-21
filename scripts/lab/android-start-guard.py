#!/usr/bin/env python3
"""Installed as an Android user-service ExecStartPre on shared staging."""
import socket
import subprocess

state = subprocess.check_output(
    ['systemctl', '--user', 'show', 'rimworld-lab.service', '--value', '-p', 'ActiveState'],
    text=True).strip()
if state in ('active', 'activating', 'reloading', 'deactivating'):
    raise SystemExit('RimWorld owns staging. Save/stop the RimWorld lab before starting Android.')
