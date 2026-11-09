// T-13: TC-26 calendar component behavior + mood picker.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { Calendar } from "./screens/Calendar";
import { MoodMark } from "./components/MoodMark";
import { fake, resetFake, setFakeModelsChosen } from "./test/fakeIpc";

vi.mock("./lib/ipc", () => import("./test/fakeIpc").then((m) => ({ ipc: m.fake })));

beforeEach(() => {
  resetFake();
  setFakeModelsChosen();
});

async function startJournal() {
  render(<App />);
  const pass = await screen.findByLabelText(/passphrase/i);
  fireEvent.change(pass, { target: { value: "hunter2 hunter2" } });
  fireEvent.click(screen.getByRole("button", { name: /create journal/i }));
  return await screen.findByTestId("editor-body");
}

describe("calendar (T-13)", () => {
  /**
   * TC-26: Given calendar data; When calendar opened; Then mooded days render
   * their color, clicking a day lists its entries (and can open one),
   * prev/next month navigates.
   */
  it("TC-26: colored days, day click lists entries, month nav", async () => {
    const editor = await startJournal();
    // Today's auto-created entry gets some text and a manual mood.
    fireEvent.change(editor, { target: { value: "a good calendar day" } });
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 6000 });
    fireEvent.click(screen.getByRole("button", { name: /mood good/i }));
    await waitFor(() => expect(fake.setMood).toHaveBeenCalledWith(expect.any(String), 4, null));

    fireEvent.click(screen.getByRole("button", { name: /^calendar$/i }));
    await screen.findByTestId("calendar");
    const todayStr = new Date().toISOString().slice(0, 10);
    const cell = await screen.findByTestId(`day-${todayStr}`);
    await waitFor(() => expect(cell.querySelector("svg.mood-mark")?.getAttribute("data-mood")).toBe("4"));

    fireEvent.click(cell);
    const list = await screen.findByTestId("day-entries");
    expect(list).toHaveTextContent(/good calendar day/);

    // Open the entry from the day list → back to journal view with it active.
    fireEvent.click(screen.getByRole("button", { name: /good calendar day/i }));
    await waitFor(() =>
      expect((screen.getByTestId("editor-body") as HTMLTextAreaElement).value).toContain(
        "good calendar day",
      ),
    );

    // Month navigation requests the adjacent month.
    fireEvent.click(screen.getByRole("button", { name: /^calendar$/i }));
    await screen.findByTestId("calendar");
    fake.calendarMonth.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /previous month/i }));
    await waitFor(() => expect(fake.calendarMonth).toHaveBeenCalled());
    const [y, m] = fake.calendarMonth.mock.calls[0] as [number, number];
    const now = new Date();
    const expected = now.getMonth() === 0 ? [now.getFullYear() - 1, 12] : [now.getFullYear(), now.getMonth()];
    expect([y, m]).toEqual(expected);
  });
});

describe("painted calendar (paper-ui T-08)", () => {
  const ym = () => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1, p: `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-` };
  };
  const g = (el: Element | null) => el!.querySelector("g")!.outerHTML;

  async function renderMonth() {
    const { p } = ym();
    fake.calendarMonth.mockResolvedValue([
      ...[1, 2, 3, 4, 5].map((l) => ({ date: `${p}0${l}`, level: l, count: 1, mark: null })),
      { date: `${p}07`, level: null, count: 2, mark: null }, // entries without a mood
    ]);
    const r = render(<Calendar onOpenEntry={() => {}} />);
    await screen.findByTestId(`day-${p}01`);
    await waitFor(() => expect(r.container.querySelectorAll(".calendar-grid svg.mood-mark").length).toBe(6));
    return { r, p };
  }

  /** TC-7 (calendar + legend part) */
  it("TC-7: each level shows the identical mark in its day and in the legend", async () => {
    const { r, p } = await renderMonth();
    for (const l of [1, 2, 3, 4, 5]) {
      const solo = render(<MoodMark level={l} />).container.querySelector("svg")!;
      const cell = screen.getByTestId(`day-${p}0${l}`).querySelector("svg.mood-mark");
      const legend = r.container.querySelector(`.calendar-legend svg[data-mood="${l}"]`);
      expect(g(cell)).toBe(g(solo));
      expect(g(legend)).toBe(g(solo));
    }
  });

  /** TC-8 (calendar + legend part) */
  it("TC-8: entries without a mood show the ring; empty days stay blank; legend has the ring", async () => {
    const { r, p } = await renderMonth();
    expect(screen.getByTestId(`day-${p}07`).querySelector('svg[data-mood="none"]')).not.toBeNull();
    expect(screen.getByTestId(`day-${p}09`).querySelector("svg")).toBeNull();
    expect(r.container.querySelector('.calendar-legend svg[data-mood="none"]')).not.toBeNull();
  });

  /** TC-21 (calendar part) */
  it("TC-21: painted structure classes are present and testids resolve", async () => {
    const { r } = await renderMonth();
    expect(screen.getByTestId("calendar")).toBeInTheDocument();
    for (const c of [".calendar-grid", ".calendar-legend", ".calendar-header"]) expect(r.container.querySelector(c)).not.toBeNull();
  });
});

describe("one-screen calendar (window-polish T-04)", () => {
  async function openCalendar() {
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "a day worth a note" } });
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 6000 });
    fireEvent.click(screen.getByRole("button", { name: /^calendar$/i }));
    return await screen.findByTestId("calendar");
  }
  const todayCell = async () => screen.findByTestId(`day-${new Date().toISOString().slice(0, 10)}`);

  /** TC-7: the page itself does not scroll in the calendar view. */
  it("TC-7: the calendar view uses the fixed pane and hides the AI side panel", async () => {
    await openCalendar();
    expect(screen.getByTestId("main-pane")).toHaveClass("main-pane-fixed");
    expect(document.querySelector(".shell")).toHaveClass("view-calendar");
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    await screen.findByTestId("search");
    expect(screen.getByTestId("main-pane")).not.toHaveClass("main-pane-fixed");
    expect(document.querySelector(".shell")).not.toHaveClass("view-calendar");
  });

  /** TC-9: the day column is always there: hint first, then the day's entries. */
  it("TC-9: day column shows a hint, then the picked day's entries in the same column", async () => {
    await openCalendar();
    const column = screen.getByTestId("day-column");
    expect(within(column).getByTestId("day-hint")).toHaveTextContent(/pick a day/i);
    expect(screen.queryByTestId("day-entries")).toBeNull();
    const cell = await todayCell();
    await waitFor(() => expect(cell).not.toBeDisabled());
    fireEvent.click(cell);
    const list = await screen.findByTestId("day-entries");
    expect(column).toContainElement(list);
    expect(list).toHaveTextContent(/a day worth a note/);
    expect(within(column).queryByTestId("day-hint")).toBeNull();
  });

  /** TC-10: several entries on one day, counts and opening an entry still work. */
  it("TC-10: a day with ten entries shows its count and lists them in the column", async () => {
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "first" } });
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 6000 });
    for (let i = 0; i < 9; i++) {
      const e = await fake.createEntry();
      await fake.saveEntry(e.id, `extra note ${i + 1}`);
    }
    fireEvent.click(screen.getByRole("button", { name: /^calendar$/i }));
    const cell = await todayCell();
    await waitFor(() => expect(cell).toHaveAttribute("title", "10 entries"));
    fireEvent.click(cell);
    const list = await screen.findByTestId("day-entries");
    await waitFor(() => expect(list.querySelectorAll("li")).toHaveLength(10));
    fireEvent.click(within(list).getByRole("button", { name: /extra note 3/i }));
    await waitFor(() =>
      expect((screen.getByTestId("editor-body") as HTMLTextAreaElement).value).toContain("extra note 3"),
    );
  });
});
