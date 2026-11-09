import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoodMark } from "./MoodMark";
import { EntryList } from "./EntryList";
import { MoodPicker } from "./MoodPicker";
import type { EntrySummary } from "../lib/types";

const NAMES = ["rough", "low", "okay", "good", "great"];

function inner(el: Element) {
  return el.querySelector("g")!.outerHTML;
}

describe("TC-6 five marks, own colour", () => {
  const markup = [1, 2, 3, 4, 5].map((l) => {
    const { container, unmount } = render(<MoodMark level={l as 1 | 2 | 3 | 4 | 5} />);
    const svg = container.querySelector("svg")!;
    const out = { svg, html: inner(svg), l };
    unmount();
    return out;
  });

  it.each([1, 2, 3, 4, 5])("level %i has data-mood, name label and its token colour", (l) => {
    const { container } = render(<MoodMark level={l as 1 | 2 | 3 | 4 | 5} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-mood")).toBe(String(l));
    expect(svg.getAttribute("aria-label")).toBe(NAMES[l - 1]);
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.innerHTML).toContain(`var(--m${l})`);
  });

  it("all five drawings are distinct", () => {
    expect(new Set(markup.map((m) => m.html)).size).toBe(5);
  });

  it("the same markup is produced for every size", () => {
    for (const l of [1, 2, 3, 4, 5] as const) {
      const a = render(<MoodMark level={l} size={26} />).container.querySelector("svg")!;
      const b = render(<MoodMark level={l} size={84} />).container.querySelector("svg")!;
      expect(inner(a)).toBe(inner(b));
      expect(a.getAttribute("width")).toBe("26");
      expect(b.getAttribute("width")).toBe("84");
    }
  });
});

describe("TC-8 no-mood ring", () => {
  it("level null renders the open ink ring with no mood colour", () => {
    const { container } = render(<MoodMark level={null} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-mood")).toBe("none");
    expect(svg.getAttribute("aria-label")).toBe("no mood");
    expect(svg.innerHTML).toContain("var(--ink)");
    expect(svg.innerHTML).not.toMatch(/var\(--m[1-5]\)/);
    expect(svg.querySelector("path")!.getAttribute("d")).toContain("A15 15");
  });
});

function summary(i: number, level: number | null, label: string | null = null): EntrySummary {
  return { id: `e${i}`, preview: `entry ${i}`, created_at: "2026-03-0" + (i % 9 + 1) + "T10:00:00Z", updated_at: "", no_cloud: false, tags: [], mood_level: level, mood_label: label, mark: null };
}
const gOf = (el: Element) => el.querySelector("g")!.outerHTML;

describe("TC-7 marks identical across list and picker", () => {
  it("each level has the same data-mood and path markup in both places", () => {
    const entries = [1, 2, 3, 4, 5].map((l) => summary(l, l));
    const list = render(<EntryList entries={entries} activeId={null} onOpen={() => {}} onNew={() => {}} />);
    const listMarks = [...list.container.querySelectorAll("svg.mood-mark")];
    const picker = render(<MoodPicker entryId="x" level={null} label={null} source={null} onChanged={() => {}} />);
    const pickerMarks = [...picker.container.querySelectorAll("svg.mood-mark")];
    expect(listMarks).toHaveLength(5);
    expect(pickerMarks).toHaveLength(5);
    for (const l of [1, 2, 3, 4, 5]) {
      const a = listMarks.find((m) => m.getAttribute("data-mood") === String(l))!;
      const b = pickerMarks.find((m) => m.getAttribute("data-mood") === String(l))!;
      const solo = render(<MoodMark level={l} />).container.querySelector("svg")!;
      expect(gOf(a)).toBe(gOf(solo));
      expect(gOf(b)).toBe(gOf(solo));
    }
  });
});

describe("TC-8 no-mood ring in list and picker", () => {
  it("shows the ring for null (with free-text label kept) and selects nothing in the picker", () => {
    const entries = [summary(1, null, "proud")];
    const list = render(<EntryList entries={entries} activeId={null} onOpen={() => {}} onNew={() => {}} />);
    expect(list.container.querySelector('svg.mood-mark[data-mood="none"]')).not.toBeNull();
    const picker = render(<MoodPicker entryId="x" level={null} label="proud" source="ai" onChanged={() => {}} />);
    expect(picker.getByText("proud")).toBeInTheDocument();
    for (const b of picker.container.querySelectorAll("button")) expect(b.getAttribute("aria-pressed")).toBe("false");
  });
});
