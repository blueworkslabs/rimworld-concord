#!/usr/bin/env bash
set -euo pipefail
concord_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
concord_managed="${1:?Pass the installed game Managed directory}"
mkdir -p "$concord_root/mod/Assemblies"
mcs -target:library -out:"$concord_root/mod/Assemblies/Concord.dll" \
  -r:"$concord_managed/netstandard.dll" \
  -r:"$concord_managed/Assembly-CSharp.dll" \
  -r:"$concord_managed/UnityEngine.CoreModule.dll" \
  -r:"$concord_managed/UnityEngine.JSONSerializeModule.dll" \
  -r:"$concord_managed/UnityEngine.IMGUIModule.dll" \
  -r:"$concord_managed/UnityEngine.TextRenderingModule.dll" \
  "$concord_root"/mod/*.cs
