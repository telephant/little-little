// Onboarding (C-13, F-11): guided model setup after the passphrase. Curated
// suggestions, never auto-selected (D-6). Fully skippable (AC-26).
import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type { AvailableModels, PullProgress, SettingsView } from "../lib/types";

const SUGGESTED_EMBED = "nomic-embed-text";
const SUGGESTED_CHAT = "qwen3:4b-instruct";

export function Onboarding(props: {
  settings: SettingsView;
  onSettingsChange: (s: SettingsView) => void;
  onDone: () => void;
}) {
  const { settings } = props;
  const [models, setModels] = useState<AvailableModels | null>(null);
  const [pull, setPull] = useState<{ model: string; progress: PullProgress | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshModels = () =>
    ipc.listAvailableModels().then(setModels).catch(() => setModels(null));

  useEffect(() => {
    void refreshModels();
  }, []);

  async function pick(kind: "embed" | "chat", model: string) {
    if (!model) return;
    setError(null);
    try {
      const next = await ipc.setModels(kind === "embed" ? model : null, kind === "chat" ? model : null);
      props.onSettingsChange(next);
    } catch (e) {
      setError(String(e));
    }
  }

  async function download(model: string) {
    setError(null);
    setPull({ model, progress: null });
    try {
      await ipc.pullModel(model, (p) => setPull({ model, progress: p }));
      await refreshModels(); // now selectable — still the user's choice (D-6)
    } catch (e) {
      setError(String(e));
    } finally {
      setPull(null);
    }
  }

  const installed = models?.ollama_models ?? [];
  const hasSuggestedEmbed = installed.some((m) => m.startsWith(SUGGESTED_EMBED));
  const hasSuggestedChat = installed.some((m) => m.startsWith(SUGGESTED_CHAT));
  const ready = !!settings.embed_model && !!settings.chat_model;

  return (
    <div className="onboarding" data-testid="onboarding">
      <h1>Set up your companion</h1>
      <p className="hint">
        Little Little runs its AI on your computer. Pick (or download) two small models —
        nothing is chosen for you, and everything also lives in Settings.
      </p>

      {models && !models.ollama_running && (
        <p className="warning">Ollama isn't running — start it to list or download models.</p>
      )}

      <section>
        <h2>1 · Memory (embeddings)</h2>
        <label>
          Embedding model
          <select value={settings.embed_model ?? ""} onChange={(e) => void pick("embed", e.target.value)}>
            <option value="" disabled>choose…</option>
            {installed.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        {!hasSuggestedEmbed && (
          <button disabled={!!pull} onClick={() => void download(SUGGESTED_EMBED)}>
            Download {SUGGESTED_EMBED} (recommended, ~0.3 GB)
          </button>
        )}
      </section>

      <section>
        <h2>2 · Voice (chat)</h2>
        <label>
          Chat model
          <select value={settings.chat_model ?? ""} onChange={(e) => void pick("chat", e.target.value)}>
            <option value="" disabled>choose…</option>
            {installed.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        {!hasSuggestedChat && (
          <button disabled={!!pull} onClick={() => void download(SUGGESTED_CHAT)}>
            Download {SUGGESTED_CHAT} (recommended, ~2.5 GB)
          </button>
        )}
        <p className="hint">
          {models?.claude_available
            ? "Prefer the cloud? You can switch to Claude later in Settings."
            : "Claude Code not found — install and sign in to enable the cloud option later."}
        </p>
      </section>

      {pull && (
        <div className="pull-progress" data-testid="pull-progress">
          <p>
            {pull.model}: {pull.progress?.status ?? "starting…"}
            {pull.progress?.pct != null && ` — ${Math.round(pull.progress.pct)}%`}
          </p>
          <progress max={100} value={pull.progress?.pct ?? 0} />
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="onboarding-actions">
        <button className="secondary" onClick={props.onDone}>
          Skip for now
        </button>
        {ready && (
          <button className="primary" onClick={props.onDone}>
            Start writing
          </button>
        )}
      </div>
    </div>
  );
}
