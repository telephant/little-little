// window-polish: static checks of the window configuration and its capability (TC-1, TC-2, TC-3).
import { describe, expect, it } from "vitest";
import confRaw from "../../src-tauri/tauri.conf.json?raw";
import capRaw from "../../src-tauri/capabilities/default.json?raw";

const conf = JSON.parse(confRaw);
const cap = JSON.parse(capRaw);
const win = conf.app.windows[0];

describe("TC-1 window size and minimum", () => {
  it("opens centred at 1100x760 and never shrinks below 900x620", () => {
    expect(win.width).toBe(1100);
    expect(win.height).toBe(760);
    expect(win.minWidth).toBe(900);
    expect(win.minHeight).toBe(620);
    expect(win.center).toBe(true);
  });
});

describe("TC-2 painted title bar style", () => {
  it("uses the Overlay bar with a hidden title and keeps the native buttons", () => {
    expect(win.titleBarStyle).toBe("Overlay");
    expect(win.hiddenTitle).toBe(true);
    expect(win.decorations).not.toBe(false); // trafficLightPosition needs decorations on
    expect(typeof win.trafficLightPosition?.x).toBe("number");
    expect(typeof win.trafficLightPosition?.y).toBe("number");
  });
});

describe("TC-3 drag permissions granted", () => {
  it("lets the main window start a drag and toggle maximise", () => {
    expect(cap.windows).toContain("main");
    expect(cap.permissions).toContain("core:window:allow-start-dragging");
    expect(cap.permissions).toContain("core:window:allow-internal-toggle-maximize");
  });
  it("lets the app re-set the window title on focus (titleBarGuard)", () => {
    expect(cap.permissions).toContain("core:window:allow-set-title");
  });
  it("still has the permissions it had", () => {
    for (const p of ["core:default", "opener:default", "dialog:default"]) expect(cap.permissions).toContain(p);
  });
});

// ---- App.css checks (T-03) ----
import css from "../App.css?raw";
const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel: string) => bare.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*{([^}]*)}`))?.[2] ?? "";

describe("TC-5 (css half) room for the macOS buttons", () => {
  it("gives the bar a left inset of at least 5rem on macOS only", () => {
    const m = rule(".platform-mac .top-bar").match(/padding-left:\s*([\d.]+)rem/);
    expect(m, "missing .platform-mac .top-bar padding-left").not.toBeNull();
    expect(parseFloat(m![1])).toBeGreaterThanOrEqual(5);
    expect(rule(".top-bar")).not.toMatch(/padding-left:\s*[5-9]/); // the base rule has no big inset
  });
  it("keeps the bar tall enough to centre the buttons", () => {
    expect(rule(".top-bar")).toMatch(/min-height:\s*(4[4-9]|[5-9]\d)px/);
  });
});

describe("the bar and the macOS buttons share one line (tuned with the user on the real window)", () => {
  // tao sizes the title-bar container to (button height + trafficLightPosition.y) and keeps the buttons at its bottom,
  // so the buttons' centre line is about y px below the window top (derived from tao 0.37 inset_traffic_lights).
  // The bar centres its content on its own half-height. Keep the two equal (within 1px).
  const barHeight = () => Number(rule(".top-bar").match(/(?:^|[;\s])height:\s*(\d+)px/)?.[1]);
  it("the buttons' centre line equals the bar's centre line", () => {
    expect(Math.abs(win.trafficLightPosition.y - barHeight() / 2)).toBeLessThanOrEqual(1);
  });
  it("the bar is a fixed-height border-box row with no vertical padding, so its centre is its half height", () => {
    const r = rule(".top-bar");
    expect(r).toMatch(/box-sizing:\s*border-box/);
    expect(r).toMatch(/padding:\s*0\s+[\d.]+rem/);
    expect(r).toMatch(/display:\s*flex/);
    expect(r).toMatch(/align-items:\s*center/);
    expect(r).not.toMatch(/flex-wrap:\s*wrap/);
  });
  it("keeps the macOS inset", () => {
    expect(rule(".platform-mac .top-bar")).toMatch(/padding-left:\s*6\.4rem/);
  });
});

describe("TC-8 the calendar grid fills the height", () => {
  it("has no square cells; the week rows share the height", () => {
    expect(rule(".calendar-grid .day")).not.toMatch(/aspect-ratio/);
    const g = rule(".calendar-grid");
    expect(g).toMatch(/flex:\s*1/);
    expect(g).toMatch(/min-height:\s*0/);
    expect(g).toMatch(/grid-auto-rows:\s*minmax\(0,\s*1fr\)/);
  });
  it("the calendar page fills the pane and only the day column scrolls", () => {
    expect(rule(".calendar")).toMatch(/height:\s*100%/);
    expect(rule(".calendar")).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
    expect(rule(".day-column")).toMatch(/overflow-y:\s*auto/);
    expect(rule(".day-column")).toMatch(/min-height:\s*0/);
  });
});

describe("TC-11 the journal fits at the minimum width", () => {
  const px = (v: string) => (v.endsWith("rem") ? parseFloat(v) * 16 : parseFloat(v));
  it("leaves the editor at least 300px at 900px", () => {
    const shell = rule(".shell").match(/grid-template-columns:\s*1fr\s+(\d+)px\s+minmax\((\d+)px,\s*([^)]+)\)/);
    expect(shell, ".shell grid-template-columns").not.toBeNull();
    const [, ruleW, sideMin] = shell!;
    const pad = rule(".main-pane").match(/padding:\s*([\d.]+rem)\s+([\d.]+rem)/);
    const ws = rule(".workspace").match(/grid-template-columns:\s*(\d+)px\s+(\d+)px\s+1fr/);
    const gap = rule(".workspace").match(/gap:\s*([\d.]+rem)/);
    expect(pad && ws && gap).toBeTruthy();
    // With a flexible 1fr sibling, a minmax(min, max) track grows to its MAX before the fr track gets the rest (measured in the
    // harness: 320px at 900px). So the effective side width is max(min, max) at this viewport.
    const maxToken = shell![3].trim();
    const maxPx = maxToken.endsWith("vw") ? (parseFloat(maxToken) / 100) * 900 : px(maxToken);
    const side = Math.max(Number(sideMin), maxPx);
    const pane = 900 - Number(ruleW) - side;
    const inner = pane - 2 * px(pad![2]);
    const editor = inner - Number(ws![1]) - Number(ws![2]) - 2 * px(gap![1]);
    expect(editor).toBeGreaterThanOrEqual(300);
  });
});

describe("the bar's text never wraps, even at the minimum width", () => {
  it("keeps the wordmark, nav and privacy note on one line", () => {
    for (const sel of [".wordmark", ".view-nav button", ".privacy-badge"]) {
      expect(rule(sel), sel).toMatch(/white-space:\s*nowrap/);
    }
  });
  it("drops the long tail of the privacy note on narrow windows (the words On-device / Cloud stay)", () => {
    expect(bare).toMatch(/@media\s*\(max-width:\s*1[01]\d\dpx\)\s*{[^}]*\.privacy-detail\s*{\s*display:\s*none/);
  });
});
