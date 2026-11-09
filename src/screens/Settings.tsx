// Settings pane (T-05): provider + model selection. No model is ever
// pre-selected (D-6) — the UI may suggest, never choose.
import { useEffect, useState } from "react";
import { open as pickOpen, save as pickSave } from "@tauri-apps/plugin-dialog";
import { ipc } from "../lib/ipc";
import type { Activity, AvailableModels, SettingsView } from "../lib/types";
import { CloudConfirmDialog } from "../components/CloudConfirmDialog";
import { StatusChips } from "../components/StatusChips";
import { PaintedRadio } from "../components/PaintedRadio";

export function Settings(props: {
  settings: SettingsView;
  activity: Activity | null;
  onSettingsChange: (s: SettingsView) => void;
  onClose: () => void;
  /** Called after a successful restore so the shell can reload entries (V2-4). */
  onRestored: () => void;
}) {
  const { settings } = props;
  const [models, setModels] = useState<AvailableModels | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Esc leaves Settings — but not while the cloud confirm dialog is open (it owns the key then).
  const { onClose } = props;
  useEffect(() => {
    if (confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, onClose]);

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
        <button className="settings-close" onClick={props.onClose} aria-label="close settings" title="Close (Esc)">
          ✕
        </button>
      </div>

      <StatusChips settings={settings} activity={props.activity} />

      <fieldset className="settings-section">
        <legend>Where your reflections are generated</legend>
        <PaintedRadio
          name="provider"
          checked={settings.chat_provider === "ollama"}
          onChange={() => void pickProvider("ollama")}
        >
          On-device (Ollama){models && !models.ollama_running ? " — not running" : ""}
        </PaintedRadio>
        <PaintedRadio
          name="provider"
          checked={settings.chat_provider === "claude_cli"}
          onChange={() => void pickProvider("claude_cli")}
        >
          Cloud (Claude){models && !models.claude_available ? " — Claude Code not found" : ""}
        </PaintedRadio>
      </fieldset>

      <fieldset className="settings-section">
        <legend>On-device models (nothing is chosen for you)</legend>
        {models && !models.ollama_running && (
          <p className="warning">Start Ollama to list your installed models.</p>
        )}
        <label>
          Memory model
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
        <p className="hint">
          Indexes your entries on this device so related memories and search work —
          even when Cloud is selected. Changing it re-indexes every entry.
        </p>
        {settings.chat_provider === "ollama" ? (
          <>
            <label>
              Reflection model
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
            <p className="hint">
              Writes your reflections — and also moods and search answers — on this device.
            </p>
          </>
        ) : (
          <p className="hint">
            Reflections, moods and search answers are written by Claude. Private entries
            {settings.chat_model
              ? ` stay on this device with ${settings.chat_model}.`
              : " stay on this device — but no on-device model is chosen, so their moods will wait."}
          </p>
        )}
      </fieldset>

      <fieldset className="settings-section">
        <legend>Your data</legend>
        <p className="hint data-intro">
          Everything stays on this device unless you save a copy somewhere.
        </p>
        <div className="data-actions">
          <div className="data-row">
            <div className="data-row-text">
              <span className="data-row-title">Markdown copy</span>
              <span className="data-row-desc">One .md file per entry, saved into a folder you choose — readable anywhere.</span>
            </div>
            <button
              className="text-link"
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
          </div>
          <div className="data-row">
            <div className="data-row-text">
              <span className="data-row-title">Backup file</span>
              <span className="data-row-desc">A single JSON file with every entry, mood and mark — keep it somewhere safe.</span>
            </div>
            <button
              className="text-link"
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
          </div>
          <div className="data-divider" role="separator" />
          <div className="data-row data-row-restore">
            <div className="data-row-text">
              <span className="data-row-title">Restore</span>
              <span className="data-row-desc">Bring a backup back. Only works into an empty journal.</span>
            </div>
            <button
              className="text-link"
              onClick={() => {
                void (async () => {
                  const path = await pickOpen({ filters: [{ name: "Backup", extensions: ["json"] }] }).catch(() => null);
                  if (typeof path === "string") {
                    const n = await ipc.restoreJson(path).catch((e) => setError(String(e)));
                    if (typeof n === "number") {
                      setNotice(`${n} entries restored — re-indexing in the background.`);
                      props.onRestored();
                    }
                  }
                })();
              }}
            >
              Restore backup…
            </button>
          </div>
        </div>
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
