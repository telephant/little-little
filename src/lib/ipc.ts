// Typed IPC surface (C-4 frontend side). Tests replace this module with a fake.
import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  Activity,
  AvailableModels,
  DayMood,
  Entry,
  EntrySummary,
  PanelState,
  PullProgress,
  SearchAnswer,
  SearchOutput,
  SettingsView,
} from "./types";

export const ipc = {
  journalExists: () => invoke<boolean>("journal_exists"),
  setupPassphrase: (passphrase: string) => invoke<void>("setup_passphrase", { passphrase }),
  unlock: (passphrase: string) => invoke<void>("unlock", { passphrase }),
  createEntry: () => invoke<Entry>("create_entry"),
  saveEntry: (id: string, body: string) => invoke<void>("save_entry", { id, body }),
  listEntries: () => invoke<EntrySummary[]>("list_entries"),
  getEntry: (id: string) => invoke<Entry>("get_entry", { id }),
  deleteEntry: (id: string) => invoke<void>("delete_entry", { id }),
  setTags: (id: string, tags: string[]) => invoke<void>("set_tags", { id, tags }),
  setNoCloud: (id: string, noCloud: boolean) => invoke<void>("set_no_cloud", { id, noCloud }),
  setMood: (id: string, level: number, label: string | null) =>
    invoke<void>("set_mood", { id, level, label }),
  setMark: (id: string, mark: string) => invoke<void>("set_mark", { id, mark }),
  clearMark: (id: string) => invoke<void>("clear_mark", { id }),
  calendarMonth: (year: number, month: number) =>
    invoke<DayMood[]>("calendar_month", { year, month }),
  pullModel: (model: string, onProgress: (p: PullProgress) => void) => {
    const channel = new Channel<PullProgress>();
    channel.onmessage = onProgress;
    return invoke<void>("pull_model", { model, onProgress: channel });
  },
  getActivity: () => invoke<Activity>("get_activity"),
  exportMarkdown: (dir: string) => invoke<number>("export_markdown", { dir }),
  exportJson: (path: string) => invoke<number>("export_json", { path }),
  restoreJson: (path: string) => invoke<number>("restore_json", { path }),
  search: (query: string) => invoke<SearchOutput>("search", { query }),
  searchAnswer: (query: string, entryIds: string[]) =>
    invoke<SearchAnswer>("search_answer", { query, entryIds }),
  listAvailableModels: () => invoke<AvailableModels>("list_available_models"),
  getSettings: () => invoke<SettingsView>("get_settings"),
  setProvider: (provider: string, confirm: boolean) =>
    invoke<SettingsView>("set_provider", { provider, confirm }),
  setModels: (embedModel: string | null, chatModel: string | null) =>
    invoke<SettingsView>("set_models", { embedModel, chatModel }),
  /** `generate: false` never starts the model: a stored reflection or `not_requested` (opening an old entry). */
  getAiPanel: (entryId: string, generate: boolean) => invoke<PanelState>("get_ai_panel", { entryId, generate }),
  regenerateReflection: (entryId: string) =>
    invoke<PanelState>("regenerate_reflection", { entryId }),
  dismissResponse: (id: string) => invoke<void>("dismiss_response", { id }),
};
