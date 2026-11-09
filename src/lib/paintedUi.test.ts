// Static checks for the painted UI (spec paper-ui): fonts, image assets, filter placement.
import { describe, expect, it } from "vitest";
import css from "../App.css?raw";
import html from "../../index.html?raw";

const fontFiles = Object.keys(import.meta.glob("../assets/fonts/*", { query: "?url", eager: true }));
const images = Object.keys(
  import.meta.glob(["/src/**/*.{png,jpg,jpeg,gif,webp,svg}", "/public/**/*.{png,jpg,jpeg,gif,webp,svg}"], {
    query: "?url",
    eager: true,
  }),
).sort();

describe("TC-2 fonts are bundled files", () => {
  const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m: RegExpMatchArray) => m[1]);
  const wanted = [
    ["Walter Turncoat", "400", "normal"],
    ["Spectral", "400", "normal"],
    ["Spectral", "500", "normal"],
    ["Spectral", "400", "italic"],
  ];
  it.each(wanted)("%s %s %s has a local file", (family, weight, style) => {
    const face = faces.find(
      (f) =>
        f.includes(`"${family}"`) &&
        new RegExp(`font-weight:\\s*${weight}`).test(f) &&
        new RegExp(`font-style:\\s*${style}`).test(f),
    );
    expect(face, "missing @font-face").toBeDefined();
    const src = /url\(["']?([^"')]+)["']?\)/.exec(face!)![1];
    expect(src).toMatch(/^\.\/assets\/fonts\/[\w-]+\.woff2$/);
    expect(fontFiles).toContain(src.replace("./assets", "../assets"));
  });
  it("loads nothing over http(s)", () => {
    expect(css).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/(href|src)=["']https?:\/\//);
  });
  it("ships a licence for each font", () => {
    expect(fontFiles).toContain("../assets/fonts/OFL-Spectral.txt");
    expect(fontFiles).toContain("../assets/fonts/LICENSE-WalterTurncoat.txt");
  });
});

describe("TC-3 no new image assets; filters are inline", () => {
  it("only the pre-existing images exist", () => {
    expect(images).toEqual(["/public/tauri.svg", "/public/vite.svg", "/src/assets/react.svg"]);
  });
  it("index.html defines every paint filter inline", () => {
    for (const id of ["paint-s", "paint-a", "paint-b", "paint-c", "wash", "wash2", "linev", "ink", "line"]) {
      expect(html).toContain(`<filter id="${id}"`);
    }
  });
});

describe("TC-4 filters never touch text", () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...bare.matchAll(/([^{}]+){([^{}]*filter:\s*url\([^}]*)}/g)];
  it("uses filters somewhere only on pseudo-elements or mark classes", () => {
    for (const [, sel] of rules) {
      for (const s of sel.split(",").map((x) => x.trim())) {
        expect(s, s).not.toMatch(/(^|[\s>+~])(textarea|input|p|label|span|h[1-6]|button|a)(?![\w-])(?!.*::)/);
        expect(s, s).toMatch(/::(before|after)|\.mark|\.wash|\.rule|\.no-filter-target|svg/);
      }
    }
  });
});

describe("AC-11 reduced motion (static)", () => {
  it("wiggle only runs inside prefers-reduced-motion: no-preference", () => {
    const uses = [...css.matchAll(/animation:\s*wiggle/g)];
    expect(uses.length).toBeGreaterThan(0);
    for (const m of uses) {
      const before = css.slice(0, m.index);
      expect(before.lastIndexOf("@media (prefers-reduced-motion: no-preference)")).toBeGreaterThan(before.lastIndexOf("\n}\n"));
    }
  });
  it("reduced motion reflections get the fade classes, not drift", () => {
    expect(css).toMatch(/\.motion-fade[^{]*\{\s*animation:\s*fade-in/);
  });
});

// ---- T-12: legacy sweep -------------------------------------------------------------------------
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const OLD_TOKENS = ["--bg", "--bg-panel", "--accent", "--border", "--badge-bg", "--text", "--text-muted", "--mood-1", "--mood-2", "--mood-3", "--mood-4", "--mood-5"];
// class names / ids from the pre-painted UI that must be gone from source
const OLD_NAMES = [/\bmood-dot\b/, /\bhas-entries\b/, /["'`. ]mood-[1-5]\b/, /\bpanel-ready h3\b/];

describe("TC-1 tokens only, light only", () => {
  const bare = strip(css);
  const outsideRoot = bare.replace(/:root\s*{[^}]*}/g, "");
  it("has no colour literal outside :root", () => {
    expect(outsideRoot.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)).toBeNull();
  });
  it("has no dark-mode media query", () => {
    expect(bare).not.toMatch(/prefers-color-scheme/);
  });
  it("defines none of the old tokens and uses none", () => {
    for (const t of OLD_TOKENS) {
      expect(bare, t).not.toMatch(new RegExp(`${t}\\b(?![-\\w])`));
    }
  });
});

describe("TC-5 no legacy classes or tokens in source", () => {
  const sources = import.meta.glob(["/src/**/*.{ts,tsx,css}", "!/src/**/*.test.{ts,tsx}", "!/src/test/**"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  it("finds the source files", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
  });
  it.each(Object.entries(sources))("%s", (_path, text) => {
    const t = strip(text);
    for (const re of OLD_NAMES) expect(t, String(re)).not.toMatch(re);
    for (const tok of OLD_TOKENS) expect(t, tok).not.toMatch(new RegExp(`${tok}\\b(?![-\\w])`));
  });
});

describe("independent scrolling (static)", () => {
  const rule = (sel: string) => {
    const m = strip(css).match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*{([^}]*)}`));
    return m?.[2] ?? "";
  };
  it("the fixed journal pane clips, the list scrolls, the writing area scrolls", () => {
    expect(rule(".main-pane-fixed")).toMatch(/overflow(-y)?:\s*hidden/);
    expect(rule(".entry-list")).toMatch(/overflow-y:\s*auto/);
    expect(rule(".editor textarea")).toMatch(/overflow-y:\s*auto/);
    expect(rule(".editor textarea")).toMatch(/min-height:\s*0/);
  });
});

describe("the paint filter does not depend on the stroke's size (no shaking)", () => {
  it("paint-s uses a fixed user-space region", () => {
    const m = html.match(/<filter id="paint-s"[^>]*>/);
    expect(m?.[0]).toMatch(/filterUnits="userSpaceOnUse"/);
  });
});
