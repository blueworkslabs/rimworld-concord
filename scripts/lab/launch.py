#!/usr/bin/env python3
"""Staging-only graphical RimWorld runner; no personal save/Steam profile."""
import fcntl
import os
from pathlib import Path
import socket
import subprocess
import time

ROOT = Path(os.environ['RIMWORLD_LAB_ROOT'])
if not ROOT.is_absolute():
    raise SystemExit('RIMWORLD_LAB_ROOT must be absolute')
locks = []
for service in filter(None, os.environ.get('RIMWORLD_LAB_EXCLUDE_SERVICES', '').split(',')):
    state = subprocess.check_output(['systemctl', '--user', 'show', service + '.service',
                                     '--value', '-p', 'ActiveState'], text=True).strip()
    if state in ('active', 'activating', 'reloading', 'deactivating'):
        raise SystemExit('Stop the Android service before starting RimWorld: ' + service)
for folder in filter(None, os.environ.get('RIMWORLD_LAB_EXCLUDE_LOCKS', '').split(os.pathsep)):
    path = Path(folder)
    handle = path.open('a')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('An Android acceptance suite owns staging: ' + folder)
    locks.append(handle)
for entry in Path('/proc').iterdir():
    if not entry.name.isdigit():
        continue
    try:
        comm = (entry / 'comm').read_text().strip()
        args = (entry / 'cmdline').read_bytes().split(b'\0')
    except (OSError, ProcessLookupError):
        continue
    if comm.startswith('qemu-system') or (args and b'/emulator' in args[0] and b'-avd' in args):
        raise SystemExit('Stop the Android emulator before starting RimWorld')
env = dict(os.environ, LANG='C.UTF-8', LC_ALL='C.UTF-8',
           LP_NUM_THREADS='2', SDL_AUDIODRIVER='dummy')
for name in ('logs', 'results', 'profile', 'game/Mods'):
    (ROOT / name).mkdir(parents=True, exist_ok=True)
for name in ('request.json', 'response.json', 'state.json'):
    path = ROOT / name
    if path.exists():
        path.rename(ROOT / 'results' / (str(time.time_ns()) + '-' + name))
renderer = os.environ.get('RIMWORLD_LAB_RENDERER', 'virgl')
if renderer == 'virgl':
    env.pop('LIBGL_ALWAYS_SOFTWARE', None)
    env.update(DISPLAY=':91', XAUTHORITY='/run/rimworld-lab-display/Xauthority')
    subprocess.run(['sudo', '-n', 'systemctl', 'start', 'rimworld-lab-display.service'], check=True)
    try:
        for attempt in range(50):
            ready = subprocess.run(['xrandr', '--query'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(0.1)
        else:
            raise SystemExit('Accelerated display did not become ready')
        subprocess.run(['xrandr', '--output', 'Virtual-1', '--mode', '1280x800'], env=env, check=True)
        raise SystemExit(subprocess.call(['/bin/bash', str(ROOT / 'bin/session.sh')], env=env))
    finally:
        subprocess.run(['sudo', '-n', 'systemctl', 'stop', 'rimworld-lab-display.service'], check=False)
elif renderer == 'software':
    env['LIBGL_ALWAYS_SOFTWARE'] = '1'
    auth = ROOT / '.Xauthority'
    auth.touch(mode=0o600, exist_ok=True)
    os.chmod(auth, 0o600)
    raise SystemExit(subprocess.call([
        '/usr/bin/xvfb-run', '-n', '91', '-f', str(auth),
        '-s', '-screen 0 1280x800x24 -nolisten tcp',
        '/bin/bash', str(ROOT / 'bin/session.sh')], env=env))
else:
    raise SystemExit('Unknown renderer; expected virgl or software')
