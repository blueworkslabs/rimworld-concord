# Local graphical test lab

These helpers operate an isolated, owned RimWorld Linux installation. They are a development harness, not the autonomous-character layer or a portable installer.

## Explicit configuration

Set `RIMWORLD_LAB_ROOT` to an absolute lab directory for both the game process and command runner. The game requires `-rimworld-lab` and `-savedatafolder` pointing to that directory's `profile` subdirectory. Both test mods refuse activation without the explicit environment/flag/profile combination. Use a disposable profile, not personal saves.

Expected layout:

- `game/`: owned game assets, never committed
- `profile/`: isolated game settings and saves
- `bin/`: installed Python/shell helpers
- `logs/`, `results/`: local diagnostics and screenshots
- `concord/`: domain mailbox and coordinator lock

The sample user service assumes a lab under the user's home directory. Adapt its paths and environment to the actual deployment. The display service is explicitly an `.example`: replace its group placeholder before installing it. It uses an authenticated local Xorg socket, not a public remote desktop.

The launcher can exclude conflicting workloads using `RIMWORLD_LAB_EXCLUDE_SERVICES` (comma-separated user-service names) and `RIMWORLD_LAB_EXCLUDE_LOCKS` (colon-separated absolute lock-file paths). Configure those for the host; no private deployment names or paths are shipped. It also rejects detected emulator processes. `android-start-guard.py` can be installed as an ExecStartPre in local Android services to reject overlap with the game. No service or sudo policy is installed automatically by this repository.

## Commands

```bash
export RIMWORLD_LAB_ROOT="$HOME/rimworld-lab"
python3 "$RIMWORLD_LAB_ROOT/bin/lab.py" start
python3 "$RIMWORLD_LAB_ROOT/bin/lab.py" command load lab-initial
python3 "$RIMWORLD_LAB_ROOT/bin/lab.py" command state
python3 "$RIMWORLD_LAB_ROOT/bin/lab.py" screenshot colony.png
python3 "$RIMWORLD_LAB_ROOT/bin/lab.py" stop
```

`stop` creates a lab shutdown save. That save alone is not a paired Concord checkpoint. Use the coordinator for paired character/game restoration. `force-stop` skips the save. Do not run multiple command owners or overwrite a pending mailbox request.

Main-thread admin operations: `state`, `new`, `pause`, `run`, `save`, `load`, `quit`, and the operator-only `food-diagnostics`. `lab.py status` reports whether the lab is running. Save names are restricted to `lab-*` basenames. `new` makes a small standard colony fixture, not the gravship campaign. UI helpers provide click/key/type/screenshot. Load/new acknowledgments accept the request; poll state until loaded. Paused controls work. Native pause-on-load advances one tick, so this is not bit-identical replay.

## Build and graphics

```bash
bash scripts/lab/build-harness.sh /path/to/RimWorldLinux_Data/Managed
```

Install the lab mod's `About` and built `Assemblies` under the game's `Mods` directory and enable `shellmaster.staginglab`. Install Concord separately as described in the project README. Restart after changing assemblies.

The launcher supports accelerated OpenGL (`virgl`) or an Xvfb software fallback (`RIMWORLD_LAB_RENDERER=software`). Configure graphics for your own machine; no GPU/VM configuration is provisioned here. Software rendering can be substantially slower. Typical prerequisites include Python/Pillow, Mono, Xorg or Xvfb, Mesa tools, xauth, Openbox and xdotool. Respect the host's resource limits and maintenance windows.

Existing receipt-generating `verify.py` phases cover simulation/save/reload and cold reload. Concord's `scripts/run-lab.sh` runs the foundation acceptance; feature trials have their own `scripts/run-*-lab.sh` launchers (see `docs/EVALUATION.md`). Proprietary assets, generated assemblies, screenshots, databases and saves remain local.
