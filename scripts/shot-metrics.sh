#!/usr/bin/env bash
# DEV ONLY (window-polish C-8): measure and screenshot the real app layout in headless Chrome.
# usage: scripts/shot-metrics.sh <view: calendar|journal> <width> <height> [out.png] [pick]
# Needs the vite dev server on :1420 (started here if it is not already running).
set -euo pipefail
VIEW="${1:-calendar}"; W="${2:-1100}"; H="${3:-760}"; OUT="${4:-}"; PICK="${5:-}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# headless Chrome's --window-size includes its own frame; add it so the page viewport is exactly W x H (verified via metrics.viewport)
FRAME_H=87
WH=$((H + FRAME_H))
cd "$(dirname "$0")/.."
STARTED=""
if ! curl -s -o /dev/null http://localhost:1420/; then
  pnpm exec vite --port 1420 --strictPort >/tmp/shot-vite.log 2>&1 & STARTED=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null http://localhost:1420/ && break; sleep 0.5; done
fi
URL="http://localhost:1420/shot.html?view=${VIEW}${PICK:+&pick=1}"
DOM=$("$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size="${W},${WH}" --virtual-time-budget=15000 --dump-dom "$URL" 2>/dev/null)
echo "$DOM" | grep -o 'METRICS .* END' | sed 's/^METRICS //; s/ END$//' || echo "no metrics (page did not finish)"
if [ -n "$OUT" ]; then
  # screenshot mode has no extra frame: use the real W x H so the picture is exactly the viewport
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size="${W},${H}" --virtual-time-budget=15000 --screenshot="$OUT" "$URL" >/dev/null 2>&1
fi
[ -n "$STARTED" ] && kill "$STARTED" 2>/dev/null || true
