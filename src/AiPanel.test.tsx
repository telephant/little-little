// T-09: AI panel — memories, reflection, regenerate/dismiss, fallbacks.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fake, resetFake, setFakeModelsChosen, setFakePanelState } from "./test/fakeIpc";
import type { AiResponse, RelatedEntry } from "./lib/types";

vi.mock("./lib/ipc", () => import("./test/fakeIpc").then((m) => ({ ipc: m.fake })));

beforeEach(() => {
  resetFake();
  setFakeModelsChosen();
});

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
    setFakePanelState({ state: "ready", related, reflection });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "new interview nerves" } });
    await waitFor(() => expect(fake.getAiPanel).toHaveBeenCalled(), { timeout: 3000 });

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
    setFakePanelState({ state: "ready", related, reflection });
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "hello" } });
    await screen.findByTestId("reflection-body", undefined, { timeout: 3000 });

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
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 3000 });

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
      { timeout: 3000 },
    );
    fireEvent.click(screen.getByRole("button", { name: /choose models/i }));
    await screen.findByTestId("settings-pane");
  });
});
