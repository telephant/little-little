import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { ipc } from "./lib/ipc";
import type { Entry, EntrySummary, PanelState, SettingsView } from "./lib/types";
import { Gate } from "./screens/Gate";
import { Onboarding } from "./screens/Onboarding";
import { Settings } from "./screens/Settings";
import { Calendar } from "./screens/Calendar";
import { Search } from "./screens/Search";
import { AiPanel } from "./components/AiPanel";
import { useActivity } from "./hooks/useActivity";
import { Editor } from "./components/Editor";
import { EntryList } from "./components/EntryList";
import { PrivacyBadge } from "./components/PrivacyBadge";

type Phase = "loading" | "first-run" | "locked" | "unlocked";

/** While embedding is still running the panel reports "thinking" — poll gently. */
const THINKING_RETRY_MS = 1200;
const THINKING_MAX_TRIES = 25;

function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [active, setActive] = useState<Entry | null>(null);
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<"journal" | "calendar" | "search">("journal");
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const panelSeq = useRef(0);
  const { activity, busy } = useActivity(phase === "unlocked");

  const loadPanel = useCallback((entryId: string) => {
    const seq = ++panelSeq.current;
    let tries = 0;
    const attempt = async () => {
      if (seq !== panelSeq.current) return; // a newer entry took over
      const state = await ipc.getAiPanel(entryId).catch(() => null);
      if (seq !== panelSeq.current || !state) return;
      setPanel(state);
      if (state.state === "thinking" && tries++ < THINKING_MAX_TRIES) {
        setTimeout(() => void attempt(), THINKING_RETRY_MS);
      }
    };
    void attempt();
  }, []);

  useEffect(() => {
    void ipc.journalExists().then((exists) => setPhase(exists ? "locked" : "first-run"));
  }, []);

  const refreshList = useCallback(async () => {
    setEntries(await ipc.listEntries());
  }, []);

  async function openJournal(passphrase: string, firstRun: boolean) {
    if (firstRun) {
      await ipc.setupPassphrase(passphrase);
    } else {
      await ipc.unlock(passphrase);
    }
    setPhase("unlocked");
    const s = await ipc.getSettings();
    setSettings(s);
    // Guided setup until both models exist (AC-26); skippable.
    setOnboarding(!s.embed_model || !s.chat_model);
    const list = await ipc.listEntries();
    setEntries(list);
    // Open the most recent entry, or start a fresh one.
    if (list.length > 0) {
      setActive(await ipc.getEntry(list[0].id));
    } else {
      setActive(await ipc.createEntry());
    }
  }

  async function newEntry() {
    setActive(await ipc.createEntry());
    setPanel(null);
    panelSeq.current++;
    await refreshList();
  }

  async function openEntry(id: string) {
    const entry = await ipc.getEntry(id).catch(() => null);
    if (!entry) return; // e.g. the source entry was deleted meanwhile
    setActive(entry);
    setShowSettings(false);
    setView("journal");
    loadPanel(id);
  }

  return (
    <div className="shell">
      <main className="main-pane" data-testid="main-pane">
        {phase === "first-run" && (
          <Gate mode="first-run" onSubmit={(p) => openJournal(p, true)} />
        )}
        {phase === "locked" && <Gate mode="locked" onSubmit={(p) => openJournal(p, false)} />}
        {phase === "unlocked" && onboarding && settings && (
          <Onboarding
            settings={settings}
            onSettingsChange={setSettings}
            onDone={() => setOnboarding(false)}
          />
        )}
        {phase === "unlocked" && !onboarding && showSettings && settings && (
          <Settings
            settings={settings}
            activity={activity}
            onSettingsChange={setSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
        {phase === "unlocked" && !onboarding && !showSettings && (
          <nav className="view-nav">
            <button className={view === "journal" ? "active" : ""} onClick={() => setView("journal")}>
              Journal
            </button>
            <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>
              Calendar
            </button>
            <button className={view === "search" ? "active" : ""} onClick={() => setView("search")}>
              Search
            </button>
          </nav>
        )}
        {phase === "unlocked" && !onboarding && !showSettings && view === "calendar" && (
          <Calendar onOpenEntry={(id) => void openEntry(id)} />
        )}
        {phase === "unlocked" && !onboarding && !showSettings && view === "search" && (
          <Search onOpenEntry={(id) => void openEntry(id)} />
        )}
        {phase === "unlocked" && !onboarding && !showSettings && view === "journal" && active && (
          <div className="workspace">
            <EntryList
              entries={entries}
              activeId={active.id}
              onOpen={(id) => void openEntry(id)}
              onNew={() => void newEntry()}
            />
            <Editor
              entry={active}
              onSaved={() => {
                void refreshList();
                loadPanel(active.id); // save-settle → related memories + reflection (F-4)
              }}
            />
          </div>
        )}
      </main>
      <aside className="side-panel" data-testid="side-panel">
        {phase === "unlocked" && !onboarding && (
          <button className="settings-button" onClick={() => setShowSettings((v) => !v)}>
            Settings
          </button>
        )}
        {phase === "unlocked" ? (
          <AiPanel
            state={panel}
            onOpenEntry={(id) => void openEntry(id)}
            onRegenerate={() => {
              if (active) {
                void ipc.regenerateReflection(active.id).then(setPanel);
              }
            }}
            onDismiss={(responseId) => {
              void ipc.dismissResponse(responseId).then(() => setPanel(null));
            }}
            onOpenSettings={() => setShowSettings(true)}
          />
        ) : (
          <p className="placeholder">Your memories will appear here.</p>
        )}
      </aside>
      <div
        className={`activity-dot ${busy ? "busy" : ""}`}
        data-testid="activity-dot"
        title={busy ? "working in the background" : "idle"}
      />
      <PrivacyBadge isCloud={settings ? settings.is_cloud : null} />
    </div>
  );
}

export default App;
