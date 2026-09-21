#!/usr/bin/env python3
"""Private staging UI controls; stop checkpoints a loaded colony before quitting."""
import os
import fcntl
import json
from pathlib import Path
import socket
import subprocess
import sys
import time
import uuid

ROOT = Path(os.environ['RIMWORLD_LAB_ROOT'])
if not ROOT.is_absolute():
    raise SystemExit('RIMWORLD_LAB_ROOT must be absolute')
auth = Path('/run/rimworld-lab-display/Xauthority')
if not auth.exists():
    auth = ROOT / '.Xauthority'
env = dict(os.environ, DISPLAY=':91', XAUTHORITY=str(auth))
args = sys.argv[1:]
action = args.pop(0) if args else 'status'
if action == 'start':
    old = json.loads((ROOT / 'state.json').read_text()).get('boot') if (ROOT / 'state.json').exists() else None
    active = subprocess.run(['systemctl', '--user', 'is-active', '--quiet', 'rimworld-lab']).returncode == 0
    subprocess.run(['systemctl', '--user', 'start', 'rimworld-lab.service'], check=True)
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        if (ROOT / 'state.json').exists():
            ready = json.loads((ROOT / 'state.json').read_text())
            if active or ready.get('boot') != old:
                print('RimWorld control ready: ' + ready['boot'])
                break
        if subprocess.run(['systemctl', '--user', 'is-active', '--quiet', 'rimworld-lab']).returncode != 0:
            raise SystemExit('Game startup failed; inspect logs/service.log and logs/Player.log')
        time.sleep(0.5)
    else:
        raise SystemExit('Game readiness timed out; inspect logs before retrying')
elif action in ('stop', 'force-stop'):
    active = subprocess.run(['systemctl', '--user', 'is-active', '--quiet', 'rimworld-lab']).returncode == 0
    if action == 'stop' and active:
        call = [sys.executable, __file__, 'command']
        state = json.loads(subprocess.check_output(call + ['state'], text=True))['state']
        if state['loaded']:
            subprocess.run(call + ['save', 'lab-shutdown'], check=True)
        subprocess.run(call + ['quit'], check=True)
    subprocess.run(['systemctl', '--user', 'stop', 'rimworld-lab.service'], check=True)
elif action == 'status':
    subprocess.run(['systemctl', '--user', 'show', 'rimworld-lab.service',
                    '-p', 'ActiveState', '-p', 'SubState', '-p', 'MemoryCurrent',
                    '-p', 'MemoryPeak', '-p', 'CPUUsageNSec'], check=True)
elif action == 'screenshot':
    from PIL import ImageGrab
    name = args[0] if args else 'screen.png'
    if Path(name).name != name or not name.endswith('.png'):
        raise SystemExit('Screenshot name must be a .png basename')
    os.environ.update(DISPLAY=env['DISPLAY'], XAUTHORITY=env['XAUTHORITY'])
    path = ROOT / 'results' / name
    ImageGrab.grab(xdisplay=':91').save(path)
    print(path)
elif action == 'click':
    if len(args) != 2:
        raise SystemExit('click X Y')
    subprocess.run(['xdotool', 'mousemove', str(int(args[0])), str(int(args[1])),
                    'click', '1'], env=env, check=True)
elif action == 'key':
    subprocess.run(['xdotool', 'key', '--clearmodifiers', *args], env=env, check=True)
elif action == 'type':
    subprocess.run(['xdotool', 'type', '--clearmodifiers', '--', ' '.join(args)], env=env, check=True)
elif action == 'command':
    op = args.pop(0) if args else 'state'
    if op not in ('state', 'new', 'pause', 'run', 'save', 'load', 'quit'):
        raise SystemExit('Unknown game command')
    subprocess.run(['systemctl', '--user', 'is-active', '--quiet', 'rimworld-lab'], check=True)
    with (ROOT / 'command.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        request = ROOT / 'request.json'
        if request.exists():
            raise SystemExit('A previous command is pending; do not overwrite it')
        ident = uuid.uuid4().hex
        payload = {'id': ident, 'op': op, 'name': args[0] if args else ''}
        temporary = ROOT / 'request.json.tmp'
        temporary.write_text(json.dumps(payload))
        temporary.replace(request)
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            response = ROOT / 'response.json'
            if response.exists():
                result = json.loads(response.read_text())
                if result.get('id') == ident:
                    print(json.dumps(result, indent=2))
                    raise SystemExit(0 if result.get('ok') else 1)
            time.sleep(0.1)
        raise SystemExit('Command timed out; inspect state before retrying (it may still execute)')
else:
    raise SystemExit('Use start|stop|status|screenshot [name.png]|click X Y|key KEY|type TEXT|command OP [NAME]')
