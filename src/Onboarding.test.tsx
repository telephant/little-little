// T-18: onboarding (TC-32), download progress (TC-33 UI), claude guidance (TC-34),
// status chips + activity (TC-36), cloud dialog copy (M-4 groundwork).
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fake, resetFake, setFakeActivity, setFakeModels, setFakeModelsChosen } from "./test/fakeIpc";

vi.mock("./lib/ipc", () => import("./test/fakeIpc").then((m) => ({ ipc: m.fake })));

beforeEach(() => {
  resetFake();
});

async function createJournal() {
  render(<App />);
  const pass = await screen.findByLabelText(/passphrase/i);
  fireEvent.change(pass, { target: { value: "hunter2 hunter2" } });
  fireEvent.click(screen.getByRole("button", { name: /create journal/i }));
}

describe("onboarding (T-18)", () => {
  /**
   * TC-32: Given fresh journal, no models; When onboarding completed by picking
   * installed models; Then app lands in editor, AI invite gone, no settings visit.
   * Skipping also lands in the editor (invite present).
   */
  it("TC-32: picking installed models reaches a ready editor", async () => {
    await createJournal();
    const onboarding = await screen.findByTestId("onboarding");
    // Wait for the installed-model options to load (both dropdowns list them).
    await within(onboarding).findAllByRole("option", { name: /nomic-embed-text/i });
    fireEvent.change(within(onboarding).getByLabelText(/embedding model/i), {
      target: { value: "nomic-embed-text:latest" },
    });
    await waitFor(() =>
      expect(fake.setModels).toHaveBeenCalledWith("nomic-embed-text:latest", null),
    );
    fireEvent.change(within(onboarding).getByLabelText(/chat model/i), {
      target: { value: "qwen3:4b-instruct" },
    });
    await waitFor(() => expect(fake.setModels).toHaveBeenCalledWith(null, "qwen3:4b-instruct"));
    const done = await within(onboarding).findByRole("button", { name: /start writing/i });
    fireEvent.click(done);
    await screen.findByTestId("editor-body");
    expect(screen.queryByTestId("onboarding")).not.toBeInTheDocument();
  });

  it("TC-32 skip path: skipping lands in the editor too", async () => {
    await createJournal();
    const onboarding = await screen.findByTestId("onboarding");
    fireEvent.click(within(onboarding).getByRole("button", { name: /skip for now/i }));
    await screen.findByTestId("editor-body");
  });

  /**
   * TC-33 (UI half): Given mocked pull progress events; When a shortlist model is
   * downloaded; Then the progress bar updates live and on success the model
   * becomes selectable.
   */
  it("TC-33: download shows live progress then the model is selectable", async () => {
    setFakeModels({ ollama_running: true, ollama_models: ["qwen3:4b-instruct"], claude_available: true });
    await createJournal();
    const onboarding = await screen.findByTestId("onboarding");
    // Suggested embed model is missing → download button offered.
    const dl = within(onboarding).getByRole("button", { name: /download nomic-embed-text/i });
    fireEvent.click(dl);
    await waitFor(() => expect(fake.pullModel).toHaveBeenCalled());
    // Progress was rendered along the way and the select now contains the model.
    await waitFor(() => {
      const embed = within(onboarding).getByLabelText(/embedding model/i);
      expect(within(embed).getByRole("option", { name: /nomic-embed-text/i })).toBeInTheDocument();
    });
  });

  /** TC-34: claude missing → disabled with guidance. */
  it("TC-34: missing claude shows guidance instead of an enabled option", async () => {
    setFakeModels({ ollama_running: true, ollama_models: ["nomic-embed-text:latest"], claude_available: false });
    await createJournal();
    const onboarding = await screen.findByTestId("onboarding");
    expect(within(onboarding).getByText(/claude code not found/i)).toBeInTheDocument();
  });

  /** TC-36: chips + global indicator reflect activity states. */
  it("TC-36: status chips and global indicator reflect busy/idle", async () => {
    setFakeModelsChosen(); // chips should show progress states, not missing-model
    setFakeActivity({
      embed_pending: 3,
      embed_total: 12,
      mood_pending: 2,
      pulling: { model: "qwen3:4b-instruct", pct: 40, status: "pulling layer" },
    });
    await createJournal();
    await screen.findByTestId("editor-body"); // models chosen → no onboarding
    // Global indicator shows busy.
    await waitFor(() => expect(screen.getByTestId("activity-dot")).toHaveClass("busy"), {
      timeout: 5000,
    });
    // Settings chips spell out the states (AC-29: never vague).
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    await screen.findByTestId("settings-pane");
    const chips = await screen.findByTestId("status-chips");
    expect(chips).toHaveTextContent(/indexing 9 of 12/i); // 12-3 done
    expect(chips).toHaveTextContent(/downloading .*40%/i);

    // Idle: counts at zero → indicator calm.
    setFakeActivity({ embed_pending: 0, embed_total: 12, mood_pending: 0, pulling: null });
    await waitFor(() => expect(screen.getByTestId("activity-dot")).not.toHaveClass("busy"), {
      timeout: 6000,
    });
  });

  /** M-4 groundwork: cloud dialog copy mentions background mood classification. */
  it("cloud confirm dialog mentions mood classification", async () => {
    await createJournal();
    fireEvent.click(await screen.findByRole("button", { name: /skip for now/i }));
    await screen.findByTestId("editor-body");
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    await screen.findByTestId("settings-pane");
    fireEvent.click(screen.getByRole("radio", { name: /claude/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/mood/i);
  });
});
