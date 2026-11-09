// quiet-reflection: nothing is generated while you write; a long pause asks; old entries never auto-start.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fake, resetFake, setFakeModelsChosen, setFakePanelState, setFakeQuietLookup } from "./test/fakeIpc";
import { reflectTiming } from "./hooks/useReflectIdle";
import type { AiResponse, RelatedEntry } from "./lib/types";

vi.mock("./lib/ipc", () => import("./test/fakeIpc").then((m) => ({ ipc: m.fake })));

const defaultTiming = { ...reflectTiming };
beforeEach(() => {
  resetFake();
  setFakeModelsChosen();
  reflectTiming.idleMs = 1500; // the autosave settles after 1s; the panel waits this much longer
  reflectTiming.minChars = 60;
});
afterEach(() => Object.assign(reflectTiming, defaultTiming));

const related: RelatedEntry[] = [
  { entry_id: "e-past-1", snippet: "The interview went so much better than I feared.", distance: 0.3, created_at: "2026-03-06T21:30:00Z" },
];
const reflection: AiResponse = {
  id: "r1", entry_id: "e1", kind: "reflection", body: "You have been here before.",
  context_entry_ids: ["e-past-1"], provider: "ollama", dismissed: false, created_at: "2026-11-05T10:00:00Z",
};
const LONG = "I keep thinking about the interview and how nervous I was this morning, again. ";

const lastGenerate = () => {
  const calls = vi.mocked(fake.getAiPanel).mock.calls;
  return calls[calls.length - 1][1];
};

async function startJournal() {
  render(<App />);
  const pass = await screen.findByLabelText(/passphrase/i);
  fireEvent.change(pass, { target: { value: "hunter2 hunter2" } });
  fireEvent.click(screen.getByRole("button", { name: /create journal/i }));
  return await screen.findByTestId("editor-body");
}

describe("quiet reflection", () => {
  /** QR-5: saving does not ask; the long pause afterwards does, once, with generate = true. */
  it("QR-5: a saved new entry asks only after the long pause", async () => {
    setFakePanelState({ state: "ready", related, reflection, earlier: related, later: [] });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: LONG } });
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 4000 });
    expect(fake.getAiPanel).not.toHaveBeenCalled(); // saved, but not asked
    await waitFor(() => expect(fake.getAiPanel).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(vi.mocked(fake.getAiPanel).mock.calls[0][1]).toBe(true);
  });

  /** QR-6: a short entry is saved but never asks. */
  it("QR-6: a short entry never asks", async () => {
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "quick note" } });
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 4000 });
    await new Promise((r) => setTimeout(r, reflectTiming.idleMs + 400));
    expect(fake.getAiPanel).not.toHaveBeenCalled();
  });

  /** QR-7: opening an older entry looks up without generating; with nothing stored it offers "Look back". */
  it("QR-7: opening an old entry never generates; Look back asks on demand", async () => {
    setFakeQuietLookup(true);
    setFakePanelState({ state: "ready", related, reflection, earlier: related, later: [] });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: LONG } });
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 4000 });
    // open the past entry through the entry list
    vi.mocked(fake.getAiPanel).mockClear();
    await waitFor(() => expect(screen.getByTestId("entry-list").querySelector("li button")).not.toBeNull());
    fireEvent.click(screen.getByTestId("entry-list").querySelector("li button")!);
    await waitFor(() => expect(fake.getAiPanel).toHaveBeenCalled());
    expect(lastGenerate()).toBe(false);
    const lookBack = await screen.findByRole("button", { name: /look back/i });
    fireEvent.click(lookBack);
    await waitFor(() => expect(lastGenerate()).toBe(true));
  });
});
