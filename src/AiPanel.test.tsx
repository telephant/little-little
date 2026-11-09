// T-09: AI panel — memories, reflection, regenerate/dismiss, fallbacks.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fake, resetFake, setFakeModelsChosen, setFakePanelState } from "./test/fakeIpc";
import type { AiResponse, RelatedEntry } from "./lib/types";
import { LINGER_KEYS } from "./hooks/useReflectionPhase";
import { reflectTiming } from "./hooks/useReflectIdle";

vi.mock("./lib/ipc", () => import("./test/fakeIpc").then((m) => ({ ipc: m.fake })));

// These suites exercise the panel itself, so the "wait for a long pause" rule is switched off here;
// QuietReflection.test.tsx covers that rule.
const defaultTiming = { ...reflectTiming };
beforeEach(() => {
  resetFake();
  setFakeModelsChosen();
  reflectTiming.idleMs = 0;
  reflectTiming.minChars = 0;
});
afterEach(() => Object.assign(reflectTiming, defaultTiming));

const related: RelatedEntry[] = [
  { entry_id: "e-past-1", snippet: "The interview went so much better than I feared.", distance: 0.3, created_at: "2026-03-06T21:30:00Z" },
  { entry_id: "e-past-2", snippet: "Third gym session this week.", distance: 0.5, created_at: "2026-04-11T08:15:00Z" },
];

const reflection: AiResponse = {
  id: "r1",
  entry_id: "e1",
  kind: "reflection",
  body: "You have been here before, and it went well.",
  context_entry_ids: ["e-past-1", "e-past-2"],
  provider: "ollama",
  dismissed: false,
  created_at: "2026-11-05T10:00:00Z",
};

async function startJournal() {
  render(<App />);
  const pass = await screen.findByLabelText(/passphrase/i);
  fireEvent.change(pass, { target: { value: "hunter2 hunter2" } });
  fireEvent.click(screen.getByRole("button", { name: /create journal/i }));
  return await screen.findByTestId("editor-body");
}

describe("AI panel (T-09)", () => {
  it("ready state renders memory cards with source links and the reflection", async () => {
    setFakePanelState({ state: "ready", related, reflection, earlier: related, later: [] });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "new interview nerves" } });
    await waitFor(() => expect(fake.getAiPanel).toHaveBeenCalled(), { timeout: 6000 });

    fireEvent.click(await screen.findByRole("button", { name: /2 memories/i })); // tucked since paper-ui
    const cards = await screen.findAllByTestId("memory-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent(/better than I feared/);
    // Reflection with its "based on" audit line.
    expect(screen.getByTestId("reflection-body")).toHaveTextContent(/been here before/);
    expect(screen.getByTestId("reflection-sources")).toHaveTextContent(/2026-03-06/);

    // Clicking a card opens the source entry.
    fireEvent.click(cards[0]);
    await waitFor(() => expect(fake.getEntry).toHaveBeenCalledWith("e-past-1"));
  });

  /**
   * TC-16: Given displayed reflection; When regenerate clicked; Then new
   * provider call made and body replaced; When dismiss clicked; Then panel
   * closes, dismiss persisted, entry unchanged.
   */
  it("TC-16: regenerate replaces the reflection; dismiss closes it", async () => {
    setFakePanelState({ state: "ready", related, reflection, earlier: related, later: [] });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "hello" } });
    await screen.findByTestId("reflection-body", undefined, { timeout: 6000 });

    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    await waitFor(() =>
      expect(screen.getByTestId("reflection-body")).toHaveTextContent(/freshly regenerated/),
    );
    expect(fake.regenerateReflection).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    await waitFor(() =>
      expect(screen.queryByTestId("reflection-body")).not.toBeInTheDocument(),
    );
    expect(fake.dismissResponse).toHaveBeenCalledWith("r1-regen");
    // Entry text untouched.
    expect((screen.getByTestId("editor-body") as HTMLTextAreaElement).value).toBe("hello");
  });

  /**
   * TC-17: Given no models selected and providers unavailable; When the user
   * writes, saves, lists and reopens; Then all succeed and the panel shows a
   * calm fallback instead of an error.
   */
  it("TC-17: writing still works with no provider; panel shows calm fallback", async () => {
    setFakePanelState({ state: "provider_unavailable", reason: "the on-device model isn't running" });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "writing with no AI at all" } });
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 6000 });

    await waitFor(() =>
      expect(screen.getByTestId("side-panel")).toHaveTextContent(/isn't running/),
    );
    // No scary error UI; the editor keeps working.
    fireEvent.change(editor, { target: { value: "still writing happily" } });
    expect((editor as HTMLTextAreaElement).value).toBe("still writing happily");
  });

  it("AC-16 invite: models-not-chosen state links to settings", async () => {
    setFakePanelState({ state: "models_not_chosen" });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "first words" } });
    await waitFor(
      () => expect(screen.getByTestId("side-panel")).toHaveTextContent(/choose.*model/i),
      { timeout: 6000 },
    );
    fireEvent.click(screen.getByRole("button", { name: /choose models/i }));
    await screen.findByTestId("settings-pane");
  });
});

// ---- paper-ui T-06: reflection lifecycle (arriving -> present -> dissolving -> tucked) ----
const refl = () => screen.queryByTestId("reflection");
const settle = { timeout: 6000 };
/** jsdom: React listens for the prefixed name here and fireEvent.animationEnd misses; dispatch both by hand (handler is idempotent). */
const endAnimation = (el: Element) => {
  fireEvent(el, new Event("animationend", { bubbles: true }));
  fireEvent(el, new Event("webkitAnimationEnd", { bubbles: true }));
};

async function arrivedIdle() {
  setFakePanelState({ state: "ready", related, reflection, earlier: related, later: [] });
  const editor = await startJournal();
  fireEvent.change(editor, { target: { value: "k" } });
  await screen.findByTestId("reflection", undefined, settle);
  return editor;
}

function typeKeys(editor: HTMLElement, n: number, from = 0) {
  for (let i = 0; i < n; i++) fireEvent.change(editor, { target: { value: "k" + "x".repeat(from + i + 1) } });
}

describe("reflection lifecycle (paper-ui T-06)", () => {
  /** TC-10 */
  it("TC-10: arrives with the drift-in class, becomes present after animationend", async () => {
    await arrivedIdle();
    expect(refl()).toHaveClass("phase-arriving", "motion-drift");
    endAnimation(refl()!);
    expect(refl()).toHaveClass("phase-present");
    expect(refl()).not.toHaveClass("phase-arriving");
  });

  /** TC-11 */
  it("TC-11: arriving while the user is typing goes straight to tucked", async () => {
    setFakePanelState({ state: "ready", related, reflection, earlier: related, later: [] });
    const editor = await startJournal();
    fake.getAiPanel.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 300));
      return { state: "ready", related, reflection, earlier: related, later: [] } as never;
    });
    fireEvent.change(editor, { target: { value: "k" } });
    await waitFor(() => expect(fake.getAiPanel).toHaveBeenCalled(), settle);
    fireEvent.change(editor, { target: { value: "kk" } }); // still typing when it lands
    await screen.findByRole("button", { name: /bring it back/i }, settle);
    expect(refl()).toBeNull();
    expect(document.querySelector(".phase-arriving")).toBeNull();
  });

  /** TC-12 */
  it("TC-12: lingers below the threshold, dissolves at it, tucks on animationend", async () => {
    const editor = await arrivedIdle();
    endAnimation(refl()!);
    typeKeys(editor, LINGER_KEYS - 1, 1);
    expect(refl()).toHaveClass("phase-present");
    typeKeys(editor, 1, LINGER_KEYS);
    expect(refl()).toHaveClass("phase-dissolving");
    endAnimation(refl()!);
    expect(refl()).toBeNull();
    expect(screen.getByRole("button", { name: /bring it back/i })).toBeInTheDocument();
  });

  it("TC-12: tucks after the timeout when animationend never fires", async () => {
    const editor = await arrivedIdle();
    endAnimation(refl()!);
    typeKeys(editor, LINGER_KEYS, 1);
    expect(refl()).toHaveClass("phase-dissolving");
    await screen.findByRole("button", { name: /bring it back/i }, settle); // duration + 150ms fallback
    expect(refl()).toBeNull();
  });

  /** TC-13 */
  it("TC-13: bring it back recalls the same text without a model call", async () => {
    const editor = await arrivedIdle();
    endAnimation(refl()!);
    typeKeys(editor, LINGER_KEYS, 1);
    endAnimation(refl()!);
    fireEvent.click(screen.getByRole("button", { name: /bring it back/i }));
    expect(refl()).toHaveClass("phase-arriving");
    expect(screen.getByTestId("reflection-body")).toHaveTextContent(/been here before/);
    expect(fake.regenerateReflection).not.toHaveBeenCalled();
  });

  /** TC-14 */
  it("TC-14: reduced motion uses only the fade variant", async () => {
    const mm = vi.fn((q: string) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} }));
    Object.defineProperty(window, "matchMedia", { value: mm, configurable: true, writable: true });
    try {
      await arrivedIdle();
      expect(refl()).toHaveClass("motion-fade");
      expect(refl()).not.toHaveClass("motion-drift");
      expect(document.querySelector(".motion-drift, .motion-wiggle, .motion-scale")).toBeNull();
    } finally {
      // @ts-expect-error cleanup of the mock
      delete window.matchMedia;
    }
  });
});

describe("memories and panel states (paper-ui T-07)", () => {
  async function readyPanel() {
    setFakePanelState({ state: "ready", related, reflection, earlier: related, later: [] });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "k" } });
    const control = await screen.findByRole("button", { name: /2 memories/i }, { timeout: 6000 });
    return { editor, control };
  }
  const cards = () => screen.queryAllByTestId("memory-card");

  /** TC-15 */
  it("TC-15: memories sit behind an 'N memories' control; hover/focus/click reveal, leave/Esc hide", async () => {
    const { control } = await readyPanel();
    expect(cards()).toHaveLength(0);
    expect(control).toHaveAttribute("aria-expanded", "false");

    const wrap = control.closest(".memories")!;
    fireEvent.mouseEnter(wrap);
    expect(cards()).toHaveLength(2);
    fireEvent.mouseLeave(wrap);
    expect(cards()).toHaveLength(0);

    fireEvent.focus(control);
    expect(cards()).toHaveLength(2);
    fireEvent.keyDown(control, { key: "Escape" });
    expect(cards()).toHaveLength(0);

    fireEvent.click(control);
    expect(cards()).toHaveLength(2);
    expect(control).toHaveAttribute("aria-expanded", "true");
  });

  it("TC-15: the reflection dissolving does not close or reopen the memories", async () => {
    const { editor, control } = await readyPanel();
    fireEvent.click(control);
    expect(cards()).toHaveLength(2);
    for (let i = 0; i < LINGER_KEYS; i++) fireEvent.change(editor, { target: { value: "k" + "y".repeat(i + 1) } });
    expect(screen.getByTestId("reflection")).toHaveClass("phase-dissolving");
    expect(cards()).toHaveLength(2);
  });

  /** TC-18 */
  it.each([
    ["models_not_chosen", { state: "models_not_chosen" }, /choose your models first/i, /choose models/i],
    ["thinking", { state: "thinking" }, /thinking about what this connects to/i, null],
    ["nothing_to_relate", { state: "nothing_to_relate" }, /nothing to relate yet/i, null],
    ["provider_unavailable", { state: "provider_unavailable", reason: "the on-device model isn't running" }, /writing is safe and saved.*isn't running/i, null],
  ] as const)("TC-18: %s keeps its meaning", async (_n, st, text, action) => {
    setFakePanelState(st as never);
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "k" } });
    await waitFor(() => expect(screen.getByTestId("side-panel")).toHaveTextContent(text), { timeout: 6000 });
    if (action) expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
  });

  it("TC-18: ready keeps Regenerate, Dismiss, sources line and the reflection text", async () => {
    await readyPanel();
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
    expect(screen.getByTestId("reflection-body")).toHaveTextContent(/been here before/);
    expect(screen.getByTestId("reflection-sources")).toHaveTextContent(/based on 2026-03-06, 2026-04-11/);
  });
});

describe("memories before and after this page (memories-sides)", () => {
  const later: RelatedEntry[] = [
    { entry_id: "e-later-1", snippet: "Looking back, the interview opened a door.", distance: 0.4, created_at: "2026-12-02T09:00:00Z" },
  ];

  /** MS-1: one control, two plain groups: Earlier and Later. */
  it("MS-1: the memories control opens two groups, Earlier and Later", async () => {
    setFakePanelState({ state: "ready", related, reflection, earlier: related, later });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "new interview nerves" } });
    await waitFor(() => expect(fake.getAiPanel).toHaveBeenCalled(), { timeout: 6000 });
    fireEvent.click(await screen.findByRole("button", { name: /3 memories/i }));
    const earlierGroup = screen.getByRole("group", { name: /earlier/i });
    const laterGroup = screen.getByRole("group", { name: /later/i });
    expect(earlierGroup.querySelectorAll('[data-testid="memory-card"]')).toHaveLength(2);
    expect(laterGroup.querySelectorAll('[data-testid="memory-card"]')).toHaveLength(1);
    expect(laterGroup).toHaveTextContent(/opened a door/);
    // Earlier comes before Later in reading order.
    expect(earlierGroup.compareDocumentPosition(laterGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(laterGroup.querySelector('[data-testid="memory-card"]')!);
    await waitFor(() => expect(fake.getEntry).toHaveBeenCalledWith("e-later-1"));
  });

  /** MS-2: an empty side shows no heading at all (nothing to explain). */
  it("MS-2: a side with nothing in it is not shown", async () => {
    setFakePanelState({ state: "ready", related, reflection, earlier: [], later });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "new interview nerves" } });
    await waitFor(() => expect(fake.getAiPanel).toHaveBeenCalled(), { timeout: 6000 });
    fireEvent.click(await screen.findByRole("button", { name: /1 memory/i }));
    expect(screen.queryByRole("group", { name: /earlier/i })).toBeNull();
    expect(screen.getByRole("group", { name: /later/i })).toBeInTheDocument();
  });
});

describe("reflection first (journal-layout)", () => {
  /** JL-1: the reflection sits at the top of the right side; the memories control comes after it. */
  it("JL-1: the reflection is above the memories control", async () => {
    setFakePanelState({ state: "ready", related, reflection, earlier: related, later: [] });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "new interview nerves" } });
    const refl = await screen.findByTestId("reflection", undefined, { timeout: 6000 });
    const memories = screen.getByRole("button", { name: /2 memories/i });
    expect(refl.compareDocumentPosition(memories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
