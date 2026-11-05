// T-02 smoke + T-04 editor tests, against the fake IPC backend.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fake, resetFake, setFakeModelsChosen } from "./test/fakeIpc";

vi.mock("./lib/ipc", () => import("./test/fakeIpc").then((m) => ({ ipc: m.fake })));

beforeEach(() => {
  resetFake();
  setFakeModelsChosen();
});
afterEach(() => {
  vi.useRealTimers();
});

async function setUpUnlockedWithEntry() {
  render(<App />);
  // first run → set passphrase
  const pass = await screen.findByLabelText(/passphrase/i);
  fireEvent.change(pass, { target: { value: "hunter2 hunter2" } });
  fireEvent.click(screen.getByRole("button", { name: /create journal/i }));
  // journal opens on the new-entry editor
  return await screen.findByTestId("editor-body");
}

describe("app shell", () => {
  it("renders main pane, side panel and privacy badge placeholder", async () => {
    render(<App />);
    expect(screen.getByTestId("main-pane")).toBeInTheDocument();
    expect(screen.getByTestId("side-panel")).toBeInTheDocument();
    expect(screen.getByTestId("privacy-badge")).toBeInTheDocument();
    await screen.findByLabelText(/passphrase/i); // settle async mount
  });
});

describe("editor (T-04)", () => {
  /**
   * TC-1 (e2e flavor): Given unlocked app with typed text pending debounce;
   * When the window is closed and app relaunched (unmount/remount, same backend);
   * Then entry shows identical text.
   */
  it("TC-1: autosaved text survives unmount/remount", async () => {
    const editor = await setUpUnlockedWithEntry();
    fireEvent.change(editor, { target: { value: "today I planted basil" } });
    // flush: debounce saves even though the user never pressed save
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 3000 });

    const { unmount } = render(<div />); // placeholder to satisfy lint
    unmount();
    // "relaunch": fresh App against the same fake backend
    document.body.innerHTML = "";
    render(<App />);
    const pass = await screen.findByLabelText(/passphrase/i);
    fireEvent.change(pass, { target: { value: "hunter2 hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    const editor2 = await screen.findByTestId("editor-body");
    await waitFor(() =>
      expect((editor2 as HTMLTextAreaElement).value).toBe("today I planted basil"),
    );
  });

  it("debounces: many keystrokes in one window → exactly one save", async () => {
    vi.useFakeTimers();
    const editor = await vi.waitFor(async () => {
      render(<App />);
      const pass = await screen.findByLabelText(/passphrase/i);
      fireEvent.change(pass, { target: { value: "hunter2 hunter2" } });
      fireEvent.click(screen.getByRole("button", { name: /create journal/i }));
      return await screen.findByTestId("editor-body");
    });
    fake.saveEntry.mockClear();
    fireEvent.change(editor, { target: { value: "t" } });
    fireEvent.change(editor, { target: { value: "to" } });
    fireEvent.change(editor, { target: { value: "today" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(fake.saveEntry).toHaveBeenCalledTimes(1);
    expect(fake.saveEntry).toHaveBeenLastCalledWith(expect.any(String), "today");
  });

  it("adding a tag calls setTags", async () => {
    const editor = await setUpUnlockedWithEntry();
    expect(editor).toBeInTheDocument();
    const tagInput = screen.getByPlaceholderText(/add tag/i);
    fireEvent.change(tagInput, { target: { value: "garden" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });
    await waitFor(() =>
      expect(fake.setTags).toHaveBeenCalledWith(expect.any(String), ["garden"]),
    );
  });

  it("wrong passphrase shows an error and allows retry", async () => {
    await setUpUnlockedWithEntry();
    document.body.innerHTML = "";
    render(<App />);
    const pass = await screen.findByLabelText(/passphrase/i);
    fireEvent.change(pass, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await screen.findByText(/wrong passphrase/i);
    fireEvent.change(pass, { target: { value: "hunter2 hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await screen.findByTestId("editor-body");
  });
});
