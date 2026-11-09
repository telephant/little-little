# Window polish — backlog

- M3 Remember window size and position — reopen where the user left it; needs the Tauri window-state plugin (new dependency); P3
- M3 Painted title bar for Windows/Linux — custom close/minimise/maximise buttons when the native frame is removed; P3 (macOS is the supported look today)
- M3 Responsive journal below 900 px — a one- or two-column fallback if the minimum size is ever lowered; P3
- M3 Calendar year overview — a compact year view beside the month; P3
- M3 Painted window buttons — grey circles that turn red/yellow/green on hover, replacing the native buttons (needs `decorations: false`, rebuilding close/minimise/zoom/full-screen and three window permissions, and likely loses the native rounded corners); P3, user asked 2026-11-09 and chose to keep native for now
- M3 If the black block at the top-left returns — capture a screenshot into docs/specs/window-polish/evidence/ and try re-applying the button position on resize/move, or drop `trafficLightPosition` for a standard 28 px bar (the exact cause was never captured; the focus guard stays); P2
