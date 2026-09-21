#!/usr/bin/env python3
"""Generate a local X cookie without placing it in arguments or output."""
import os
from pathlib import Path
import secrets
import subprocess

path = Path('/run/rimworld-lab-display/Xauthority')
path.touch(mode=0o640)
os.chmod(path, 0o640)
subprocess.run(['xauth', '-f', str(path)],
               input='add :91 . ' + secrets.token_hex(16) + '\n',
               text=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
os.chmod(path, 0o640)
