// DEV ONLY (window-polish C-8): a stub of the Tauri backend so the real app can run in a plain browser and be
// measured/screenshotted in headless Chrome. Served by `vite dev` at /shot.html; never part of the production
// build (`vite build` only builds index.html).
const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth() + 1;
const pad = (n) => String(n).padStart(2, "0");
const iso = (d, h) => new Date(Date.UTC(Y, M - 1, d, h, 0, 0)).toISOString();

// A painted mark (two strokes, one coloured) like the ones the canvas saves.
const MARK = JSON.stringify({
  v: 1,
  strokes: [[60, 60, 240, 420, 420, 80], [100, 300, 380, 300]],
  colors: [0, 4],
});

const entries = [];
let n = 0;
const add = (day, hour, level, painted, body) => {
  entries.push({
    id: `demo-${++n}`,
    body,
    created_at: iso(day, hour),
    updated_at: iso(day, hour),
    no_cloud: false,
    embed_status: "ok",
    tags: [],
    mood_level: level,
    mood_label: null,
    mood_source: level ? "manual" : null,
    mark: painted ? MARK : null,
  });
};
const days = [1, 2, 3, 4, 6, 8, 9, 11, 12, 15, 16, 18, 19, 22, 23, 25, 27, 28, 30];
days.forEach((d, i) => add(d, 9, (i % 5) + 1, i % 4 === 0, `Entry for day ${d}. ` + "A few words about the day. ".repeat(3)));
for (let k = 0; k < 10; k++) add(5, 7 + k, (k % 5) + 1, k === 9, `Busy day, note ${k + 1}. ` + "More words. ".repeat(4)); // a long day list
entries.sort((a, b) => b.created_at.localeCompare(a.created_at));

const summary = (e) => ({
  id: e.id, preview: e.body.slice(0, 120), created_at: e.created_at, updated_at: e.updated_at,
  no_cloud: false, tags: [], mood_level: e.mood_level, mood_label: null, mark: e.mark,
});

function calendarMonth(year, month) {
  const byDay = new Map();
  for (const e of [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const d = new Date(e.created_at);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month) continue;
    const key = `${year}-${pad(month)}-${pad(d.getUTCDate())}`;
    const day = byDay.get(key) ?? { date: key, level: null, count: 0, mark: null };
    day.count += 1;
    if (e.mood_level) day.level = e.mood_level;
    if (e.mark) day.mark = { mark: e.mark, level: e.mood_level };
    byDay.set(key, day);
  }
  return [...byDay.values()];
}

const handlers = {
  journal_exists: () => true,
  unlock: () => null,
  setup_passphrase: () => null,
  list_entries: () => entries.map(summary),
  get_entry: ({ id }) => ({ ...entries.find((e) => e.id === id), embed_status: "ok" }),
  create_entry: () => ({ ...entries[0] }),
  calendar_month: ({ year, month }) => calendarMonth(year, month),
  get_settings: () => ({ chat_provider: "ollama", chat_model: "demo-chat", embed_model: "demo-embed", embed_dim: 512, cloud_confirmed: false, is_cloud: false }),
  get_activity: () => ({ embed_pending: 0, embed_total: 0, mood_pending: 0, pulling: null }),
  get_ai_panel: () => ({
    state: "ready",
    related: [],
    reflection: { id: "r1", entry_id: "demo-1", kind: "reflection", body: "You wrote about this before, and the worry softened by the weekend.", context_entry_ids: [], provider: "ollama", dismissed: false, created_at: iso(5, 10) },
    earlier: [
      { entry_id: "demo-3", snippet: "The interview went so much better than I feared. I walked home the long way.", distance: 0.3, created_at: iso(3, 21) },
      { entry_id: "demo-2", snippet: "Big interview on Thursday. Stomach in knots all evening.", distance: 0.4, created_at: iso(2, 19) },
    ],
    later: [
      { entry_id: "demo-9", snippet: "Looking back, that interview opened a door I did not expect.", distance: 0.5, created_at: iso(20, 9) },
    ],
  }),
  list_available_models: () => ({ ollama_running: true, ollama_models: ["demo-chat", "demo-embed"], claude_available: false }),
  search: () => ({ results: [], hidden_count: 0 }),
};

window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => (handlers[cmd] ? handlers[cmd](args ?? {}) : null),
  transformCallback: () => 0,
  convertFileSrc: (p) => p,
};
