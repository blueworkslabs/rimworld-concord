#!/usr/bin/env bash
# Copy rendered manim scenes into site/media as web-friendly MP4 plus a poster frame.
set -euo pipefail
cd "$(dirname "$0")"
src=media/videos/concord_scenes/720p30
out=../media
mkdir -p "$out"
for s in ConsentLoop WhoKnowsWhat TimelineGuard CoreWakes; do
  slug=$(echo "$s" | sed -E 's/([a-z])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]')
  ffmpeg -loglevel error -y -i "$src/$s.mp4" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an "$out/$slug.mp4"
  ffmpeg -loglevel error -y -sseof -0.4 -i "$src/$s.mp4" -frames:v 1 -q:v 3 "$out/$slug.jpg"
done
ls -la "$out"
