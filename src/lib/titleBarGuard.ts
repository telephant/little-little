// macOS keeps the custom title-bar button position (tauri.conf.json trafficLightPosition) only until AppKit re-lays out
// the title bar. The window library (tao) re-applies it when the view redraws, when the title is set, and after leaving
// full-screen, but NOT when the app merely regains focus. After switching away and back the title bar could be left
// stale and draw a black block at the top-left (user report, 2026-11-09). Setting the same title again on focus runs
// the library's own re-apply path (set_title_async -> reapply_traffic_light_inset, verified in tao 0.37.2).

/** Must equal `app.windows[0].title` in src-tauri/tauri.conf.json (checked by a test). */
export const WINDOW_TITLE = "little-little";

interface FocusWindow {
  onFocusChanged(handler: (e: { payload: boolean }) => void): Promise<() => void>;
  setTitle(title: string): Promise<void>;
}

/** Returns the function that stops listening. Never throws: a failure only means the guard is not active. */
export async function installTitleBarGuard(win: FocusWindow): Promise<() => void> {
  return win.onFocusChanged(({ payload: focused }) => {
    if (focused) void win.setTitle(WINDOW_TITLE).catch(() => undefined);
  });
}
