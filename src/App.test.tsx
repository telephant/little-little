// T-02 smoke + T-04 editor tests, against the fake IPC backend.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { PrivacyBadge } from "./components/PrivacyBadge";
import { fake, resetFake, setFakeModelsChosen, setFakeNextEntryMood } from "./test/fakeIpc";

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
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 6000 });

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
    const tagInput = screen.getByPlaceholderText(/\+ tag/i);
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

describe("painted shell (paper-ui T-04)", () => {
  /** TC-16: Given the journal view, Then three columns are separated by a black rule (left) and a blue rule (right). */
  it("TC-16: black rule then blue rule separate list | editor | panel", async () => {
    const editor = await setUpUnlockedWithEntry();
    const list = document.querySelector(".entry-list")!;
    const black = document.querySelector(".rule-black")!;
    const blue = document.querySelector(".rule-blue")!;
    const panel = screen.getByTestId("side-panel");
    expect(list && black && blue).toBeTruthy();
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(list, black)).toBe(true);
    expect(before(black, editor)).toBe(true);
    expect(before(editor, blue)).toBe(true);
    expect(before(blue, panel)).toBe(true);
    expect(black.getAttribute("aria-hidden")).toBe("true");
  });

  /** TC-19: Given provider local, then cloud, Then wording differs independent of colour. */
  it("TC-19: local vs cloud badge wording differs", () => {
    const local = render(<PrivacyBadge isCloud={false} />);
    const localText = local.getByTestId("privacy-badge").textContent!;
    local.unmount();
    const cloud = render(<PrivacyBadge isCloud={true} />);
    const cloudText = cloud.getByTestId("privacy-badge").textContent!;
    expect(localText).toMatch(/on-device/i);
    expect(localText).toMatch(/this device/i);
    expect(cloudText).toMatch(/cloud/i);
    expect(cloudText).not.toMatch(/on-device/i);
    expect(cloudText).not.toBe(localText);
  });
});

describe("mood marks in the journal (paper-ui T-05)", () => {
  /** TC-9: AI mood, user picks another mark → manual, list+header update, hint disappears. */
  it("TC-9: picking a mark saves manual, updates list and header, hides the AI hint", async () => {
    setFakeNextEntryMood(2, "low", "ai");
    const editor = await setUpUnlockedWithEntry();
    fireEvent.change(editor, { target: { value: "a quiet day" } }); // saved entries show in the list
    const header = () => document.querySelector(".editor-mark svg")!;
    const listMark = () => screen.getByTestId("entry-list").querySelector("svg.mood-mark")!;
    expect(header().getAttribute("data-mood")).toBe("2");
    await waitFor(() => expect(listMark().getAttribute("data-mood")).toBe("2"), { timeout: 6000 });
    expect(screen.getByText(/AI guess/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /mood good/i }));

    await waitFor(() => expect(header().getAttribute("data-mood")).toBe("4"));
    const id = (await fake.listEntries())[0].id;
    expect(fake.setMood).toHaveBeenCalledWith(id, 4, null); // IPC setMood always stores source=manual
    await waitFor(() => expect(listMark().getAttribute("data-mood")).toBe("4"));
    expect(screen.queryByText(/AI guess/i)).toBeNull();
  });
});

describe("autosave baseline (found via flaky panel tests)", () => {
  it("saves an edit even if it lands before the first effect run, and saves a revert to the loaded text", async () => {
    const editor = await setUpUnlockedWithEntry();
    fireEvent.change(editor, { target: { value: "first words" } });
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalledTimes(1), { timeout: 6000 });
    fireEvent.change(editor, { target: { value: "" } }); // back to the loaded (empty) text
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalledTimes(2), { timeout: 6000 });
    expect(fake.saveEntry).toHaveBeenLastCalledWith(expect.any(String), "");
  });
});

describe("independent scrolling (journal view)", () => {
  it("the journal pane does not scroll as a whole; list and editor scroll on their own", async () => {
    await setUpUnlockedWithEntry();
    expect(screen.getByTestId("main-pane")).toHaveClass("main-pane-fixed");
    expect(screen.getByTestId("entry-list")).toBeInTheDocument();
  });
  it("search and settings keep a normally scrolling pane (the calendar is a fixed pane since window-polish)", async () => {
    await setUpUnlockedWithEntry();
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    await screen.findByTestId("search");
    expect(screen.getByTestId("main-pane")).not.toHaveClass("main-pane-fixed");
  });
});

describe("title bar (window-polish T-03)", () => {
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
  const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
  afterEach(() => vi.restoreAllMocks());

  /** TC-4: the bar is a deep drag region; its controls never carry a drag attribute. */
  it("TC-4: top bar is the drag region and its controls are not", async () => {
    await setUpUnlockedWithEntry();
    const bar = screen.getByTestId("top-bar");
    expect(bar).toHaveAttribute("data-tauri-drag-region", "deep");
    const controls = bar.querySelectorAll("button, a");
    expect(controls.length).toBeGreaterThanOrEqual(4); // Journal, Calendar, Search, Settings
    for (const c of controls) expect(c.hasAttribute("data-tauri-drag-region")).toBe(false);
  });

  /** TC-5 (component half): the inset class only exists on macOS. */
  it("TC-5: platform-mac class on macOS, absent elsewhere", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(MAC);
    const mac = render(<App />);
    expect(mac.container.querySelector(".shell")).toHaveClass("platform-mac");
    mac.unmount();
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(WIN);
    const other = render(<App />);
    expect(other.container.querySelector(".shell")).not.toHaveClass("platform-mac");
    other.unmount();
    await screen.findByLabelText(/passphrase/i).catch(() => undefined);
  });

  /** TC-6: the painted bar still works. */
  it("TC-6: nav and the status notes keep working", async () => {
    await setUpUnlockedWithEntry();
    fireEvent.click(screen.getByRole("button", { name: /^calendar$/i }));
    await screen.findByTestId("calendar");
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    await screen.findByTestId("search");
    fireEvent.click(screen.getByRole("button", { name: /^journal$/i }));
    await screen.findByTestId("editor-body");
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    await screen.findByTestId("settings-pane");
    expect(screen.getByTestId("activity-dot")).toBeInTheDocument();
    expect(screen.getByTestId("privacy-badge")).toHaveTextContent(/on-device · stays on this device/i);
  });
});

describe("privacy note keeps distinct words in its short form (window-polish)", () => {
  it("renders the key word and a separate detail span", () => {
    const local = render(<PrivacyBadge isCloud={false} />);
    expect(local.getByTestId("privacy-badge").querySelector(".privacy-detail")).toHaveTextContent(/stays on this device/i);
    expect(local.getByTestId("privacy-badge").firstElementChild).toHaveTextContent(/^On-device$/);
    local.unmount();
    const cloud = render(<PrivacyBadge isCloud={true} />);
    expect(cloud.getByTestId("privacy-badge").firstElementChild).toHaveTextContent(/^Cloud$/);
    expect(cloud.getByTestId("privacy-badge").querySelector(".privacy-detail")).toHaveTextContent(/text goes to Claude/i);
  });
});
