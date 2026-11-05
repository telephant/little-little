// T-05: settings pane, privacy indicator (TC-12) and cloud confirm (TC-20).
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fake, resetFake } from "./test/fakeIpc";

vi.mock("./lib/ipc", () => import("./test/fakeIpc").then((m) => ({ ipc: m.fake })));

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
    const embedSelect = screen.getByLabelText(/embedding model/i) as HTMLSelectElement;
    const chatSelect = screen.getByLabelText(/chat model/i) as HTMLSelectElement;
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
});
