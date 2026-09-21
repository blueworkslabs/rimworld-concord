#!/usr/bin/env bash
set -euo pipefail
lab_source="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
lab_managed="${1:?Pass the installed game Managed directory}"
mkdir -p "$lab_source/mod/Assemblies"
mcs -target:library -out:"$lab_source/mod/Assemblies/StagingLab.dll" \
  -r:"$lab_managed/netstandard.dll" \
  -r:"$lab_managed/Assembly-CSharp.dll" \
  -r:"$lab_managed/UnityEngine.CoreModule.dll" \
  -r:"$lab_managed/UnityEngine.JSONSerializeModule.dll" \
  "$lab_source/mod/LabHarness.cs"
