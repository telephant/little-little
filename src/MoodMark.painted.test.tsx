// paint-marks T-06: the painted variant of MoodMark and where it shows.
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MoodMark } from "./components/MoodMark";
import { EntryList } from "./components/EntryList";
import { Editor } from "./components/Editor";
import { Calendar } from "./screens/Calendar";
import { fake, resetFake } from "./test/fakeIpc";
import { encodeMark, strokesToPath, toStroke } from "./lib/mark";

const MIXED = encodeMark([toStroke([[60, 60], [240, 400], [420, 80]]), toStroke([[100, 300], [380, 300]])], [0, 4]);
import type { Entry, EntrySummary } from "./lib/types";

vi.mock("./lib/ipc", () => import("./test/fakeIpc").then((m) => ({ ipc: m.fake })));

beforeEach(() => resetFake());

const strokes = [toStroke([[60, 60], [240, 400], [420, 80]]), toStroke([[100, 300], [380, 300]])];
const MARK = encodeMark(strokes);
const g = (el: Element | null) => el!.querySelector("g")!;

describe("TC-13 mood colour rule", () => {
  it("uses --m4, then --m2, then ink, with identical shape", () => {
    const shapes: string[] = [];
    const colours: string[] = [];
    for (const level of [4, 2, null]) {
      const { container, unmount } = render(<MoodMark level={level} mark={MARK} />);
      const svg = container.querySelector("svg")!;
      expect(svg).toHaveAttribute("data-painted", "true");
      shapes.push([...svg.querySelectorAll("path")].map((p) => p.getAttribute("d")).join("|"));
      colours.push((svg.querySelector("path") as SVGPathElement).getAttribute("style") ?? "");
      unmount();
    }
    expect(new Set(shapes).size).toBe(1);
    expect(shapes[0]).toBe(strokes.map(strokesToPath).join("|"));
    expect(colours[0]).toContain("var(--m4)");
    expect(colours[1]).toContain("var(--m2)");
    expect(colours[2]).toContain("var(--ink)");
  });

  it("falls back to the default mark when the stored mark is damaged", () => {
    const { container } = render(<MoodMark level={3} mark={'{"v":1,"strokes":[[1,2,481,4]]}'} />);
    const svg = container.querySelector("svg")!;
    expect(svg).not.toHaveAttribute("data-painted");
    expect(svg).toHaveAttribute("data-mood", "3");
  });
});

describe("TC-24 colour rule with chosen colours", () => {
  it("stroke 1 follows the mood (--m4, --m2, ink); stroke 2 keeps its chosen sky colour", () => {
    const first: string[] = [];
    const second: string[] = [];
    const shapes: string[] = [];
    for (const level of [4, 2, null]) {
      const { container, unmount } = render(<MoodMark level={level} mark={MIXED} />);
      const paths = [...container.querySelectorAll("svg path")];
      first.push(paths[0].getAttribute("style") ?? "");
      second.push(paths[1].getAttribute("style") ?? "");
      shapes.push(paths.map((p) => p.getAttribute("d")).join("|"));
      unmount();
    }
    expect(first[0]).toContain("var(--m4)");
    expect(first[1]).toContain("var(--m2)");
    expect(first[2]).toContain("var(--ink)");
    for (const c of second) expect(c).toContain("var(--sky)");
    expect(new Set(shapes).size).toBe(1);
  });
});

describe("TC-18 painted look at every size", () => {
  it("is the same inline svg group with the paint filter at 26, 34, 44 and 84 px", () => {
    const groups = [26, 34, 44, 84].map((size) => {
      const { container, unmount } = render(<MoodMark level={4} mark={MARK} size={size} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("width")).toBe(String(size));
      expect(g(svg)).toHaveAttribute("filter", "url(#paint-s)");
      expect(svg.querySelector("image")).toBeNull();
      const html = g(svg).outerHTML;
      unmount();
      return html;
    });
    expect(new Set(groups).size).toBe(1);
  });
});

describe("TC-11 identical painted mark in list, header and calendar", () => {
  it("renders the same markup in all three places", async () => {
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-05`;
    const summary: EntrySummary = {
      id: "e1", preview: "painted day", created_at: `${day}T10:00:00Z`, updated_at: "", no_cloud: false,
      tags: [], mood_level: 4, mood_label: null, mark: MARK,
    };
    const entry: Entry = {
      id: "e1", body: "painted day", created_at: summary.created_at, updated_at: "", no_cloud: false,
      embed_status: "ok", tags: [], mood_level: 4, mood_label: null, mood_source: "manual", mark: MARK,
    };
    fake.calendarMonth.mockResolvedValue([{ date: day, level: 4, count: 1, mark: { mark: MARK, level: 4 } }]);

    const list = render(<EntryList entries={[summary]} activeId={null} onOpen={() => {}} onNew={() => {}} />);
    const inList = list.container.querySelector('svg[data-painted="true"]');
    const header = render(<Editor entry={entry} />);
    const inHeader = header.container.querySelector('.editor-mark svg[data-painted="true"]');
    const cal = render(<Calendar onOpenEntry={() => {}} />);
    await waitFor(() => expect(cal.container.querySelector('.calendar-grid svg[data-painted="true"]')).not.toBeNull());
    const inCalendar = cal.container.querySelector('.calendar-grid svg[data-painted="true"]');

    expect(inList && inHeader && inCalendar).toBeTruthy();
    expect(g(inList)!.outerHTML).toBe(g(inHeader)!.outerHTML);
    expect(g(inList)!.outerHTML).toBe(g(inCalendar)!.outerHTML);
    // the legend and the mood picker stay on the default marks
    expect(cal.container.querySelectorAll('.calendar-legend svg[data-painted]')).toHaveLength(0);
    expect(header.container.querySelectorAll('.mood-picker svg[data-painted]')).toHaveLength(0);
    expect(screen.queryAllByRole("img", { name: /painted mark/i }).length).toBeGreaterThanOrEqual(3);
  });
});
