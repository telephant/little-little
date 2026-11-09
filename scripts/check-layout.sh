#!/usr/bin/env bash
# DEV ONLY (window-polish T-05): assert the layout rules at the default and the minimum window size using the
# screenshot harness (real app, stubbed backend, headless Chrome). Exit code 1 if any rule fails.
# usage: scripts/check-layout.sh [min-week-row-px=55] [min-editor-px=300]   (the thresholds are provisional, see tests.md)
set -uo pipefail
cd "$(dirname "$0")/.."
ROW="${1:-55}"; EDITOR="${2:-300}"
FAIL=0
run() { scripts/shot-metrics.sh "$@" 2>/dev/null | grep '^{' | head -1; }
check() { # name, json, python predicate over m
  python3 - "$1" "$2" "$3" <<'PY'
import sys, json
name, raw, pred = sys.argv[1], sys.argv[2], sys.argv[3]
m = json.loads(raw)
ok = bool(eval(pred))
print(("PASS" if ok else "FAIL"), name)
sys.exit(0 if ok else 1)
PY
}
for SZ in "1100 760" "900 620"; do
  W=${SZ% *}; H=${SZ#* }
  CAL=$(run calendar $W $H "" pick); JOU=$(run journal $W $H)
  [ -z "$CAL" ] && { echo "FAIL no metrics for calendar $SZ"; FAIL=1; continue; }
  [ -z "$JOU" ] && { echo "FAIL no metrics for journal $SZ"; FAIL=1; continue; }
  echo "== ${W}x${H}"
  check "calendar: viewport is exactly ${W}x${H}"            "$CAL" "m['viewport']=={'w':$W,'h':$H}" || FAIL=1
  check "calendar: the page does not scroll (pane has no vertical overflow)" "$CAL" "not m['pane']['overflowsV'] and m['pageScroll']['scrollH']<=m['viewport']['h']" || FAIL=1
  check "calendar: no horizontal overflow"                     "$CAL" "not m['pane']['overflowsH']" || FAIL=1
  check "calendar: every week row is >= ${ROW}px tall (six weeks)" "$CAL" "len(m['weekRows'])==6 and min(m['weekRows'])>=$ROW" || FAIL=1
  check "calendar: grid ends above the legend, legend inside the window" "$CAL" "m['grid']['bottom']<=m['legend']['top'] and m['legend']['bottom']<=m['viewport']['h']" || FAIL=1
  check "calendar: day column is visible beside the grid"      "$CAL" "m['dayColumn'] and m['dayColumn']['width']>=200 and m['dayColumn']['left']>=m['grid']['right']" || FAIL=1
  check "journal: no vertical or horizontal overflow"          "$JOU" "not m['pane']['overflowsV'] and not m['pane']['overflowsH']" || FAIL=1
  if [ "$W" = "900" ]; then
  check "journal: editor is >= ${EDITOR}px wide at the minimum width" "$JOU" "m['editor']['width']>=$EDITOR" || FAIL=1
  fi
  check "bar: wordmark, nav, settings and privacy share one centre line (+-1px)" "$CAL" "max(m['barLine'][k] for k in ('wordmark','nav','settings','privacy'))-min(m['barLine'][k] for k in ('wordmark','nav','settings','privacy'))<=1" || FAIL=1
  check "bar: wordmark and privacy note stay on one line (not wrapped)" "$CAL" "m['wordmark']['height']<=28 and m['privacy']['height']<=28 and m['topBar']['height']==52" || FAIL=1
done
[ $FAIL -eq 0 ] && echo "ALL LAYOUT CHECKS PASSED" || echo "LAYOUT CHECKS FAILED"
exit $FAIL
