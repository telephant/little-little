// T-05: settings pane, privacy indicator (TC-12) and cloud confirm (TC-20).
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fake, resetFake } from "./test/fakeIpc";

vi.mock("./lib/ipc", () => import("./test/fakeIpc").then((m) => ({ ipc: m.fake })));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => "/fake/journal-backup.json"),
  save: vi.fn(async () => "/fake/backup-out.json"),
}));

beforeEach(() => {
  resetFake();
});

async function openSettingsFromUnlockedApp() {
  render(<App />);
  const pass = await screen.findByLabelText(/passphrase/i);
  fireEvent.change(pass, { target: { value: "hunter2 hunter2" } });
  fireEvent.click(screen.getByRole("button", { name: /create journal/i }));
  // Fresh journal → onboarding first (models deliberately unset in this suite).
  fireEvent.click(await screen.findByRole("button", { name: /skip for now/i }));
  await screen.findByTestId("editor-body");
  fireEvent.click(screen.getByRole("button", { name: /settings/i }));
  await screen.findByTestId("settings-pane");
}

describe("settings (T-05)", () => {
  /**
   * TC-12: Given settings open, provider=ollama; When switched to claude_cli
   * (confirm accepted); Then indicator shows "Cloud" in shell layout;
   * switch back shows "On-device".
   */
  it("TC-12: provider switch updates the always-visible privacy badge", async () => {
    await openSettingsFromUnlockedApp();
    expect(screen.getByTestId("privacy-badge")).toHaveTextContent(/on-device/i);

    fireEvent.click(screen.getByRole("radio", { name: /claude/i }));
    // confirm dialog appears (first time) — accept it
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /send my entries/i }));
    await waitFor(() =>
      expect(screen.getByTestId("privacy-badge")).toHaveTextContent(/cloud/i),
    );

    fireEvent.click(screen.getByRole("radio", { name: /on-device|ollama/i }));
    await waitFor(() =>
      expect(screen.getByTestId("privacy-badge")).toHaveTextContent(/on-device/i),
    );
  });

  /**
   * TC-20: Given provider=ollama, cloud never confirmed; When claude_cli selected;
   * Then confirm dialog shown; on cancel provider stays ollama; on accept it
   * switches and the dialog never reappears.
   */
  it("TC-20: cloud switch needs one-time confirmation; cancel keeps ollama", async () => {
    await openSettingsFromUnlockedApp();

    // Cancel path
    fireEvent.click(screen.getByRole("radio", { name: /claude/i }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("privacy-badge")).toHaveTextContent(/on-device/i);

    // Accept path
    fireEvent.click(screen.getByRole("radio", { name: /claude/i }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /send my entries/i }));
    await waitFor(() =>
      expect(screen.getByTestId("privacy-badge")).toHaveTextContent(/cloud/i),
    );

    // Back to ollama, then to claude again: no dialog this time
    fireEvent.click(screen.getByRole("radio", { name: /on-device|ollama/i }));
    await waitFor(() =>
      expect(screen.getByTestId("privacy-badge")).toHaveTextContent(/on-device/i),
    );
    fireEvent.click(screen.getByRole("radio", { name: /claude/i }));
    await waitFor(() =>
      expect(screen.getByTestId("privacy-badge")).toHaveTextContent(/cloud/i),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("models start unselected and choosing them calls setModels", async () => {
    await openSettingsFromUnlockedApp();
    const embedSelect = screen.getByLabelText(/memory model/i) as HTMLSelectElement;
    const chatSelect = screen.getByLabelText(/reflection model/i) as HTMLSelectElement;
    expect(embedSelect.value).toBe("");
    expect(chatSelect.value).toBe("");

    fireEvent.change(embedSelect, { target: { value: "nomic-embed-text:latest" } });
    await waitFor(() =>
      expect(fake.setModels).toHaveBeenCalledWith("nomic-embed-text:latest", null),
    );
    fireEvent.change(chatSelect, { target: { value: "qwen3:4b-instruct" } });
    await waitFor(() =>
      expect(fake.setModels).toHaveBeenCalledWith(null, "qwen3:4b-instruct"),
    );
  });

  /**
   * TC-38 (T-19): Given the settings pane; Then the generation-model picker is
   * labeled "Reflection model" (matching "Where your reflections are generated"),
   * no "chat" vocabulary remains, and a hint says it also writes moods and answers.
   */
  it("TC-38: settings uses one vocabulary — reflection model, not chat model", async () => {
    await openSettingsFromUnlockedApp();
    const pane = screen.getByTestId("settings-pane");
    expect(within(pane).getByLabelText(/reflection model/i)).toBeInTheDocument();
    expect(within(pane).queryByLabelText(/chat model/i)).not.toBeInTheDocument();
    expect(within(pane).queryByText(/chat/i)).not.toBeInTheDocument();
    expect(within(pane).getByText(/moods/i)).toHaveTextContent(/answers/i);
  });

  /**
   * TC-41 (T-20): no ML jargon in the pane — "Memory model" instead of
   * "Embedding model", no "embedding"/"dimension" copy, plain ready chips.
   */
  it("TC-41: pane speaks plain words — memory model, no embedding/dimension", async () => {
    await openSettingsFromUnlockedApp();
    const pane = screen.getByTestId("settings-pane");
    expect(within(pane).getByLabelText(/memory model/i)).toBeInTheDocument();
    expect(within(pane).queryByText(/embedding/i)).not.toBeInTheDocument();
    expect(within(pane).queryByText(/dimension/i)).not.toBeInTheDocument();

    // With models chosen, ready chips use the same plain vocabulary.
    const memSelect = within(pane).getByLabelText(/memory model/i);
    fireEvent.change(memSelect, { target: { value: "nomic-embed-text:latest" } });
    const reflSelect = within(pane).getByLabelText(/reflection model/i);
    fireEvent.change(reflSelect, { target: { value: "qwen3:4b-instruct" } });
    const chips = await screen.findByTestId("status-chips");
    await waitFor(() => {
      expect(chips).toHaveTextContent(/memory ready \(nomic-embed-text:latest\)/i);
      expect(chips).toHaveTextContent(/reflections ready \(qwen3:4b-instruct\)/i);
    });
    expect(chips).not.toHaveTextContent(/embeddings|768d|chat/i);
  });

  /**
   * TC-42 (T-20): provider cascade — the Reflection model picker only shows for
   * On-device; under Cloud it becomes a note naming the private-entries model.
   */
  it("TC-42: reflection picker cascades with the provider choice", async () => {
    await openSettingsFromUnlockedApp();
    const pane = screen.getByTestId("settings-pane");
    expect(within(pane).getByLabelText(/reflection model/i)).toBeInTheDocument();

    // Switch to Cloud (accept the one-time confirm).
    fireEvent.click(screen.getByRole("radio", { name: /claude/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /send my entries/i }));
    await waitFor(() =>
      expect(within(pane).queryByLabelText(/reflection model/i)).not.toBeInTheDocument(),
    );
    // No model chosen yet → the note warns instead of naming one.
    expect(within(pane).getByText(/private entries/i)).toHaveTextContent(/no on-device model/i);

    // Back to On-device → picker returns.
    fireEvent.click(screen.getByRole("radio", { name: /on-device|ollama/i }));
    await waitFor(() =>
      expect(within(pane).getByLabelText(/reflection model/i)).toBeInTheDocument(),
    );
  });

  /**
   * TC-45 (T-22, V2-4): a successful restore refreshes the entry list and
   * opens a restored entry — the pre-restore blank draft is gone.
   */
  it("TC-45: restore refreshes the list and opens a restored entry", async () => {
    await openSettingsFromUnlockedApp();
    fireEvent.click(screen.getByRole("button", { name: /restore backup/i }));
    await screen.findByText(/2 entries restored/i);
    fireEvent.click(screen.getByRole("button", { name: /close settings/i }));
    const list = await screen.findByTestId("entry-list");
    await waitFor(() => expect(list).toHaveTextContent(/riverside 10k/i));
  });

  it("TC-42b: under Cloud the note names the chosen on-device model", async () => {
    await openSettingsFromUnlockedApp();
    const pane = screen.getByTestId("settings-pane");
    fireEvent.change(within(pane).getByLabelText(/reflection model/i), {
      target: { value: "qwen3:4b-instruct" },
    });
    await waitFor(() => expect(fake.setModels).toHaveBeenCalledWith(null, "qwen3:4b-instruct"));
    fireEvent.click(screen.getByRole("radio", { name: /claude/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /send my entries/i }));
    await waitFor(() =>
      expect(within(pane).getByText(/private entries/i)).toHaveTextContent(/qwen3:4b-instruct/i),
    );
  });
});

describe("painted settings and dialog (paper-ui T-10)", () => {
  /** TC-21 (settings part): hairline sections, text-link buttons, painted radios. */
  it("TC-21: settings render hairline sections and text-link buttons with testids intact", async () => {
    await openSettingsFromUnlockedApp();
    const pane = screen.getByTestId("settings-pane");
    expect(pane.querySelectorAll("fieldset.settings-section")).toHaveLength(3);
    const data = pane.querySelector(".data-actions")!;
    const buttons = data.querySelectorAll("button");
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect(b).toHaveClass("text-link");
    for (const r of pane.querySelectorAll('input[type="radio"]')) expect(r).toHaveClass("painted-radio");
    expect(screen.getByTestId("status-chips")).toBeInTheDocument();
  });

  /** TC-19 (dialog part) + TC-21: painted frame, same copy, exactly two actions. */
  it("TC-19/21: cloud dialog keeps its copy and two actions inside a painted frame", async () => {
    await openSettingsFromUnlockedApp();
    fireEvent.click(screen.getByRole("radio", { name: /claude/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("painted-frame");
    expect(within(dialog).getByRole("heading")).toHaveTextContent("Send entries to Claude?");
    expect(dialog).toHaveTextContent(/never send to cloud/i);
    expect(dialog).toHaveTextContent(/mood/i);
    expect(dialog).toHaveTextContent(/On-device mode keeps everything on this computer/);
    const actions = within(dialog).getAllByRole("button");
    expect(actions.map((b) => b.textContent)).toEqual(["Cancel", "Send my entries to Claude"]);
  });
});
