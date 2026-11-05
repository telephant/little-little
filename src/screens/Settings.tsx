// Settings pane (T-05): provider + model selection. No model is ever
// pre-selected (D-6) — the UI may suggest, never choose.
import { useEffect, useState } from "react";
import { open as pickOpen, save as pickSave } from "@tauri-apps/plugin-dialog";
import { ipc } from "../lib/ipc";
import type { Activity, AvailableModels, SettingsView } from "../lib/types";
import { CloudConfirmDialog } from "../components/CloudConfirmDialog";
import { StatusChips } from "../components/StatusChips";

export function Settings(props: {
  settings: SettingsView;
  activity: Activity | null;
  onSettingsChange: (s: SettingsView) => void;
  onClose: () => void;
}) {
  const { settings } = props;
  const [models, setModels] = useState<AvailableModels | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void ipc.listAvailableModels().then(setModels).catch(() => setModels(null));
  }, []);

  async function pickProvider(provider: "ollama" | "claude_cli", confirm = false) {
    setError(null);
    try {
      const next = await ipc.setProvider(provider, confirm);
      props.onSettingsChange(next);
      setConfirming(false);
    } catch (e) {
      if (String(e).includes("cloud-not-confirmed")) {
        setConfirming(true); // first switch to cloud → dialog (AC-17)
      } else {
        setError(String(e));
      }
    }
  }

  async function pickModel(kind: "embed" | "chat", model: string) {
    if (!model) return;
    setError(null);
    try {
      const next = await ipc.setModels(
        kind === "embed" ? model : null,
        kind === "chat" ? model : null,
      );
      props.onSettingsChange(next);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="settings" data-testid="settings-pane">
      <div className="settings-header">
        <h2>Settings</h2>
        <button onClick={props.onClose} aria-label="close settings">
          ✕
        </button>
      </div>

      <StatusChips settings={settings} activity={props.activity} />

      <fieldset>
        <legend>Where your reflections are generated</legend>
        <label>
          <input
            type="radio"
            name="provider"
            checked={settings.chat_provider === "ollama"}
            onChange={() => void pickProvider("ollama")}
          />
          On-device (Ollama){models && !models.ollama_running ? " — not running" : ""}
        </label>
        <label>
          <input
            type="radio"
            name="provider"
            checked={settings.chat_provider === "claude_cli"}
            onChange={() => void pickProvider("claude_cli")}
          />
          Cloud (Claude){models && !models.claude_available ? " — Claude Code not found" : ""}
        </label>
      </fieldset>

      <fieldset>
        <legend>Models (nothing is chosen for you)</legend>
        {models && !models.ollama_running && (
          <p className="warning">Start Ollama to list your installed models.</p>
        )}
        <label>
          Embedding model
          <select
            value={settings.embed_model ?? ""}
            onChange={(e) => void pickModel("embed", e.target.value)}
          >
            <option value="" disabled>
              choose… (we suggest nomic-embed-text)
            </option>
            {(models?.ollama_models ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chat model
          <select
            value={settings.chat_model ?? ""}
            onChange={(e) => void pickModel("chat", e.target.value)}
          >
            <option value="" disabled>
              choose…
            </option>
            {(models?.ollama_models ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        {settings.embed_model && settings.embed_dim && (
          <p className="hint">
            Index dimension {settings.embed_dim}. Changing the embedding model re-indexes
            every entry.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>Your data</legend>
        <div className="data-actions">
          <button
            onClick={() => {
              void (async () => {
                const dir = await pickOpen({ directory: true }).catch(() => null);
                if (typeof dir === "string") {
                  const n = await ipc.exportMarkdown(dir).catch((e) => setError(String(e)));
                  if (typeof n === "number") setNotice(`${n} entries exported as Markdown.`);
                }
              })();
            }}
          >
            Export Markdown…
          </button>
          <button
            onClick={() => {
              void (async () => {
                const path = await pickSave({ defaultPath: "little-little-backup.json" }).catch(() => null);
                if (path) {
                  const n = await ipc.exportJson(path).catch((e) => setError(String(e)));
                  if (typeof n === "number") setNotice(`Backup written (${n} entries).`);
                }
              })();
            }}
          >
            Back up (JSON)…
          </button>
          <button
            onClick={() => {
              void (async () => {
                const path = await pickOpen({ filters: [{ name: "Backup", extensions: ["json"] }] }).catch(() => null);
                if (typeof path === "string") {
                  const n = await ipc.restoreJson(path).catch((e) => setError(String(e)));
                  if (typeof n === "number") setNotice(`${n} entries restored — re-indexing in the background.`);
                }
              })();
            }}
          >
            Restore backup…
          </button>
        </div>
        <p className="hint">Restore only works into an empty journal.</p>
      </fieldset>

      {notice && <p className="hint">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {confirming && (
        <CloudConfirmDialog
          onAccept={() => void pickProvider("claude_cli", true)}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
