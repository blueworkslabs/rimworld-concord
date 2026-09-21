#!/usr/bin/env python3
"""Exercise actual game state, not mocks; run on staging with the lab started."""
import os
import json
from pathlib import Path
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = Path(os.environ['RIMWORLD_LAB_ROOT'])
if not ROOT.is_absolute():
    raise SystemExit('RIMWORLD_LAB_ROOT must be absolute')
CLI = [sys.executable, str(ROOT / 'bin/lab.py')]
phase = sys.argv[1] if len(sys.argv) > 1 else 'simulation'
receipt = {'phase': phase, 'passed': False}
output = ROOT / 'results' / (phase + '.json')

def command(op, *args, expect=True):
    result = subprocess.run(CLI + ['command', op, *args], capture_output=True, text=True, timeout=125)
    data = json.loads(result.stdout)
    if data['ok'] != expect:
        raise RuntimeError(data)
    return data

def state():
    return command('state')['state']

def identity(s):
    return sorted((p['id'], p['name'], p['health']) for p in s['pawns'])

try:
    if phase == 'simulation':
        before = state()
        assert before['loaded'] and before['odyssey'] and before['biotech']
        assert len(before['pawns']) == 3 and before['mapWidth'] == 150
        receipt['before'] = before
        start = time.monotonic()
        command('run')
        time.sleep(30)
        after = command('pause')['state']
        elapsed = time.monotonic() - start
        receipt.update(after=after, seconds=elapsed,
                       ticks_per_second=(after['ticks'] - before['ticks']) / elapsed)
        assert receipt['ticks_per_second'] >= 45, 'Below real-time smoke-test threshold'
        saved = command('save', 'lab-baseline')['state']
        receipt['saved'] = saved
        time.sleep(1)
        assert state()['ticks'] == saved['ticks'], 'Paused simulation advanced'
        path = ROOT / 'profile/Saves/lab-baseline.rws'
        tick = int(ET.parse(path).findtext('.//tickManager/ticksGame'))
        assert tick == saved['ticks'], 'Save XML tick did not match reported state'
        receipt.update(save_xml_ticks=tick, save_bytes=path.stat().st_size, pause_stable=True)
    elif phase in ('reload', 'cold-reload'):
        baseline = json.loads((ROOT / 'results/simulation.json').read_text())['saved']
        if phase == 'reload':
            command('run')
            time.sleep(3)
            advanced = command('pause')['state']
            assert advanced['ticks'] > baseline['ticks']
            receipt['advanced'] = advanced
        else:
            assert state()['boot'] != baseline['boot'], 'Not a new game process'
        command('load', 'lab-baseline')
        loaded = state()
        receipt['reloaded'] = loaded
        assert loaded['loaded'] and loaded['paused']
        # Native RimWorld PauseOnLoad intentionally performs one DoSingleTick.
        assert loaded['ticks'] == baseline['ticks'] + 1
        assert identity(loaded) == identity(baseline)
        receipt.update(saved=baseline, reloaded=loaded, native_load_tick_delta=1,
                       pawn_identity_health_preserved=True)
        bad = command('save', '../not-allowed', expect=False)
        missing = command('load', 'lab-missing-save', expect=False)
        assert state()['ticks'] == loaded['ticks']
        receipt.update(invalid_save_rejected=bad['error'], missing_load_rejected=missing['error'])
    else:
        raise ValueError('Use simulation|reload|cold-reload')
    receipt['passed'] = True
except Exception as error:
    receipt['error'] = repr(error)
    raise
finally:
    output.write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt, indent=2))
