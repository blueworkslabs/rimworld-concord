#!/usr/bin/env bash
# Narration wording test (tests/mod/phrase-test.cs) against a built mod/Assemblies/Concord.dll.
# Local only: building the mod needs the game assemblies (scripts/build-mod.sh), which CI does not have.
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
concord_tmp="$(mktemp -d)"; trap 'rm -rf "$concord_tmp"' EXIT
cp "$concord_root/mod/Assemblies/Concord.dll" "$concord_tmp/"
mcs -nowarn:1591 -out:"$concord_tmp/phrase-test.exe" -r:"$concord_tmp/Concord.dll" "$concord_root/tests/mod/phrase-test.cs"
mono "$concord_tmp/phrase-test.exe"
