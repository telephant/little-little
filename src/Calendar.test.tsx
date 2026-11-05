// T-13: TC-26 calendar component behavior + mood picker.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
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
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: /mood good/i }));
    await waitFor(() => expect(fake.setMood).toHaveBeenCalledWith(expect.any(String), 4, null));

    fireEvent.click(screen.getByRole("button", { name: /^calendar$/i }));
    await screen.findByTestId("calendar");
    const todayStr = new Date().toISOString().slice(0, 10);
    const cell = await screen.findByTestId(`day-${todayStr}`);
    await waitFor(() => expect(cell.className).toContain("mood-4"));

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
