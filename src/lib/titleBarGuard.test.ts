// window-polish: keep the macOS title-bar buttons from going stale after the app regains focus.
import { describe, expect, it, vi } from "vitest";
import { WINDOW_TITLE, installTitleBarGuard } from "./titleBarGuard";
import conf from "../../src-tauri/tauri.conf.json";

function fakeWindow() {
  let handler: ((e: { payload: boolean }) => void) | null = null;
  const unlisten = vi.fn();
  return {
    win: {
      onFocusChanged: vi.fn(async (cb: (e: { payload: boolean }) => void) => {
        handler = cb;
        return unlisten;
      }),
      setTitle: vi.fn(async () => undefined),
    },
    focus: (payload: boolean) => handler?.({ payload }),
    unlisten,
  };
}

describe("installTitleBarGuard", () => {
  it("re-sets the window title (which makes the window library re-apply the button position) when focus returns", async () => {
    const f = fakeWindow();
    await installTitleBarGuard(f.win);
    expect(f.win.onFocusChanged).toHaveBeenCalledTimes(1);
    f.focus(true);
    expect(f.win.setTitle).toHaveBeenCalledWith(WINDOW_TITLE);
  });
  it("does nothing when the window loses focus", async () => {
    const f = fakeWindow();
    await installTitleBarGuard(f.win);
    f.focus(false);
    expect(f.win.setTitle).not.toHaveBeenCalled();
  });
  it("never throws if setTitle fails, and hands back the unlisten function", async () => {
    const f = fakeWindow();
    f.win.setTitle.mockRejectedValueOnce(new Error("no permission"));
    const stop = await installTitleBarGuard(f.win);
    expect(() => f.focus(true)).not.toThrow();
    await Promise.resolve();
    stop();
    expect(f.unlisten).toHaveBeenCalled();
  });
  it("uses the same title as the window config", () => {
    expect(WINDOW_TITLE).toBe(conf.app.windows[0].title);
  });
});
