# Source provenance

`scripts/lab/` derives from the earlier rimworld-gm staging-lab work under its MIT license (retained at the repository root); the harness mod still carries its original package ID `shellmaster.staginglab`. The public version replaces deployment-specific configuration with explicit environment variables and templates. Installation remains operator-owned; there is no portable installer yet.

New coordinator/protocol/game bridge code is separate; this repository does not import the older Shellmaster HTTP mod or assume it has RimWorld 1.6 compatibility.

No proprietary RimWorld/Unity reference DLLs, game/DLC assets, private saves, account files or model credentials are included. Build against an owned local installation. Generated artifacts and runtime state stay ignored.
