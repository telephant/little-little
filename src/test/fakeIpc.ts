// In-memory fake of src/lib/ipc.ts for component tests.
// State lives at module level so it survives unmount/remount inside one test;
// call resetFake() in beforeEach.
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
} from "../lib/types";
import { vi } from "vitest";

let entries: Map<string, Entry> = new Map();
let hasJournal = false;
let unlocked = false;
let passphrase = "";
let counter = 0;
let settings: SettingsView = defaultSettings();

function defaultSettings(): SettingsView {
  return {
    chat_provider: "ollama",
    chat_model: null,
    embed_model: null,
    embed_dim: null,
    cloud_confirmed: false,
    is_cloud: false,
  };
}

let panelState: PanelState = { state: "nothing_to_relate" };
let searchOutput: SearchOutput = { results: [], hidden_count: 0 };
let searchAnswerImpl: () => Promise<SearchAnswer> = async () => ({
  answer: "fake answer",
  cited_dates: [],
});

/** Tests set what the backend panel pipeline would return. */
/** When true, a lookup that does not ask to generate answers `not_requested` (an entry with no stored reflection). */
let quietLookup = false;
export function setFakeQuietLookup(on: boolean) {
  quietLookup = on;
}
export function setFakePanelState(s: PanelState) {
  panelState = s;
}

export function setFakeSearch(out: SearchOutput, answer?: () => Promise<SearchAnswer>) {
  searchOutput = out;
  if (answer) searchAnswerImpl = answer;
}

let availableModels: AvailableModels = {
  ollama_running: true,
  ollama_models: ["nomic-embed-text:latest", "qwen3:4b-instruct"],
  claude_available: true,
};
let activity: Activity = { embed_pending: 0, embed_total: 0, mood_pending: 0, pulling: null };
let pullScript: PullProgress[] = [
  { status: "pulling manifest", pct: null, done: false },
  { status: "pulling layer", pct: 40, done: false },
  { status: "pulling layer", pct: 100, done: false },
  { status: "success", pct: null, done: true },
];

export function setFakeModels(m: AvailableModels) {
  availableModels = m;
}

/** Most suites start with models already chosen so onboarding doesn't trigger. */
let nextEntryMood: { level: number | null; label: string | null; source: "ai" | "manual" } | null = null;
/** The next createEntry() gets this mood (e.g. an AI guess). */
export function setFakeNextEntryMood(level: number | null, label: string | null, source: "ai" | "manual") {
  nextEntryMood = { level, label, source };
}

export function setFakeModelsChosen() {
  settings.embed_model = "nomic-embed-text:latest";
  settings.embed_dim = 768;
  settings.chat_model = "qwen3:4b-instruct";
}
export function setFakeActivity(a: Activity) {
  activity = a;
}
export function setFakePullScript(events: PullProgress[]) {
  pullScript = events;
}

export function resetFake() {
  entries = new Map();
  hasJournal = false;
  unlocked = false;
  passphrase = "";
  counter = 0;
  settings = defaultSettings();
  panelState = { state: "nothing_to_relate" };
  quietLookup = false;
  searchOutput = { results: [], hidden_count: 0 };
  searchAnswerImpl = async () => ({ answer: "fake answer", cited_dates: [] });
  availableModels = {
    ollama_running: true,
    ollama_models: ["nomic-embed-text:latest", "qwen3:4b-instruct"],
    claude_available: true,
  };
  activity = { embed_pending: 0, embed_total: 0, mood_pending: 0, pulling: null };
  pullScript = [
    { status: "pulling manifest", pct: null, done: false },
    { status: "pulling layer", pct: 40, done: false },
    { status: "pulling layer", pct: 100, done: false },
    { status: "success", pct: null, done: true },
  ];
  nextEntryMood = null;
  for (const f of Object.values(fake)) f.mockReset(); // restores the original implementation and drops one-off overrides (test isolation)
}

export const fake = {
  journalExists: vi.fn(async () => hasJournal),
  setupPassphrase: vi.fn(async (p: string) => {
    hasJournal = true;
    unlocked = true;
    passphrase = p;
  }),
  unlock: vi.fn(async (p: string) => {
    if (p !== passphrase) throw new Error("wrong passphrase or not a journal database");
    unlocked = true;
  }),
  createEntry: vi.fn(async (): Promise<Entry> => {
    const id = `e${++counter}`;
    const ts = new Date().toISOString();
    const e: Entry = {
      id,
      body: "",
      created_at: ts,
      updated_at: ts,
      no_cloud: false,
      embed_status: "pending",
      tags: [],
      mood_level: nextEntryMood?.level ?? null,
      mood_label: nextEntryMood?.label ?? null,
      mood_source: nextEntryMood?.source ?? null,
      mark: null,
    };
    nextEntryMood = null;
    entries.set(id, e);
    return { ...e };
  }),
  setMood: vi.fn(async (id: string, level: number, label: string | null) => {
    const e = entries.get(id);
    if (!e) throw new Error("not found");
    e.mood_level = level;
    e.mood_label = label;
    e.mood_source = "manual";
  }),
  setMark: vi.fn(async (id: string, mark: string) => {
    const e = entries.get(id);
    if (!e) throw new Error("not found");
    try {
      const v = JSON.parse(mark);
      if (v?.v !== 1 || !Array.isArray(v.strokes) || v.strokes.length < 1 || v.strokes.length > 8) throw new Error();
    } catch {
      throw new Error("invalid mark");
    }
    e.mark = mark; // a mark is not text: nothing else changes
  }),
  clearMark: vi.fn(async (id: string) => {
    const e = entries.get(id);
    if (!e) throw new Error("not found");
    e.mark = null;
  }),
  calendarMonth: vi.fn(async (year: number, month: number): Promise<DayMood[]> => {
    const prefix = `${year}-${String(month).padStart(2, "0")}-`;
    const byDay = new Map<string, DayMood>();
    for (const e of [...entries.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const day = e.created_at.slice(0, 10);
      if (!day.startsWith(prefix)) continue;
      const d: DayMood = byDay.get(day) ?? { date: day, level: null, count: 0, mark: null };
      d.count += 1;
      if (e.mood_level != null) d.level = e.mood_level; // fake: latest mood wins
      if (e.mark) d.mark = { mark: e.mark, level: e.mood_level }; // latest painted entry of the day
      byDay.set(day, d);
    }
    return [...byDay.values()];
  }),
  saveEntry: vi.fn(async (id: string, body: string) => {
    const e = entries.get(id);
    if (!e) throw new Error("not found");
    e.body = body;
    e.updated_at = new Date().toISOString();
  }),
  listEntries: vi.fn(async (): Promise<EntrySummary[]> => {
    if (!unlocked) throw new Error("journal is locked");
    return [...entries.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((e) => ({
        id: e.id,
        preview: e.body.slice(0, 120),
        created_at: e.created_at,
        updated_at: e.updated_at,
        no_cloud: e.no_cloud,
        tags: [...e.tags],
        mood_level: e.mood_level,
        mood_label: e.mood_label,
        mark: e.mark,
      }));
  }),
  getEntry: vi.fn(async (id: string): Promise<Entry> => {
    const e = entries.get(id);
    if (!e) throw new Error("not found");
    return { ...e, tags: [...e.tags] };
  }),
  deleteEntry: vi.fn(async (id: string) => {
    entries.delete(id);
  }),
  setTags: vi.fn(async (id: string, tags: string[]) => {
    const e = entries.get(id);
    if (!e) throw new Error("not found");
    e.tags = [...tags];
  }),
  setNoCloud: vi.fn(async (id: string, noCloud: boolean) => {
    const e = entries.get(id);
    if (!e) throw new Error("not found");
    e.no_cloud = noCloud;
  }),
  listAvailableModels: vi.fn(async (): Promise<AvailableModels> => structuredClone(availableModels)),
  pullModel: vi.fn(async (model: string, onProgress: (p: PullProgress) => void) => {
    for (const event of pullScript) {
      await Promise.resolve(); // yield like a real stream
      onProgress(event);
    }
    // After a successful pull, the model shows up as installed.
    if (pullScript.some((e) => e.done)) {
      availableModels.ollama_models = [...new Set([...availableModels.ollama_models, model])];
    }
  }),
  getActivity: vi.fn(async (): Promise<Activity> => structuredClone(activity)),
  getSettings: vi.fn(async (): Promise<SettingsView> => ({ ...settings })),
  setProvider: vi.fn(async (provider: string, confirm: boolean): Promise<SettingsView> => {
    if (provider === "claude_cli" && !settings.cloud_confirmed && !confirm) {
      throw new Error("cloud-not-confirmed");
    }
    if (provider === "claude_cli") settings.cloud_confirmed = true;
    settings.chat_provider = provider as SettingsView["chat_provider"];
    settings.is_cloud = provider === "claude_cli";
    return { ...settings };
  }),
  setModels: vi.fn(
    async (embedModel: string | null, chatModel: string | null): Promise<SettingsView> => {
      if (embedModel) {
        settings.embed_model = embedModel;
        settings.embed_dim = 768;
      }
      if (chatModel) settings.chat_model = chatModel;
      return { ...settings };
    },
  ),
  exportMarkdown: vi.fn(async () => entries.size),
  exportJson: vi.fn(async () => entries.size),
  restoreJson: vi.fn(async () => {
    // Mimic restore_json: blank drafts are discarded, then the guard applies.
    for (const [id, e] of [...entries]) {
      if (e.body === "" && e.tags.length === 0 && e.mood_level == null && !e.mark) entries.delete(id);
    }
    if (entries.size > 0) {
      throw new Error("restore requires an empty journal (merge is not supported yet)");
    }
    const rows = [
      { id: "jf-051", created_at: "2026-10-18T13:25:00Z", body: "RACE DAY. Riverside 10K: 58 minutes 41 seconds." },
      { id: "jf-002", created_at: "2026-05-09T21:40:00Z", body: "Decided. I am leaving Harlow & Price." },
    ];
    for (const r of rows) {
      entries.set(r.id, {
        ...r,
        updated_at: r.created_at,
        no_cloud: false,
        embed_status: "pending",
        tags: [],
        mood_level: null,
        mood_label: null,
        mood_source: null,
        mark: null,
      });
    }
    return rows.length;
  }),
  search: vi.fn(async (): Promise<SearchOutput> => structuredClone(searchOutput)),
  searchAnswer: vi.fn(async (): Promise<SearchAnswer> => searchAnswerImpl()),
  getAiPanel: vi.fn(async (_entryId: string, generate: boolean): Promise<PanelState> =>
    !generate && quietLookup ? { state: "not_requested" } : structuredClone(panelState),
  ),
  regenerateReflection: vi.fn(async (entryId: string): Promise<PanelState> => {
    if (panelState.state === "ready") {
      panelState = {
        ...panelState,
        reflection: {
          ...panelState.reflection,
          id: `${panelState.reflection.id}-regen`,
          body: "a freshly regenerated reflection",
          entry_id: entryId,
        },
      };
    }
    return structuredClone(panelState);
  }),
  dismissResponse: vi.fn(async (_id: string) => {}),
};
