// Mirrors the Rust types in src-tauri/src/storage/entries.rs.
export interface Entry {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  no_cloud: boolean;
  embed_status: string;
  tags: string[];
  mood_level: number | null;
  mood_label: string | null;
  mood_source: "ai" | "manual" | null;
  /** Painted mark: numbers-only JSON strokes (see src/lib/mark.ts); null = use the default mood mark. */
  mark: string | null;
}

export interface SettingsView {
  chat_provider: "ollama" | "claude_cli";
  chat_model: string | null;
  embed_model: string | null;
  embed_dim: number | null;
  cloud_confirmed: boolean;
  is_cloud: boolean;
}

export interface AvailableModels {
  ollama_running: boolean;
  ollama_models: string[];
  claude_available: boolean;
}

// Mirrors prompt::PanelState (serde tag = "state", snake_case).
export interface RelatedEntry {
  entry_id: string;
  snippet: string;
  distance: number;
  created_at: string;
}

export interface AiResponse {
  id: string;
  entry_id: string;
  kind: string;
  body: string;
  context_entry_ids: string[];
  provider: string;
  dismissed: boolean;
  created_at: string;
}

export type PanelState =
  | { state: "models_not_chosen" }
  | { state: "thinking" }
  | { state: "nothing_to_relate" }
  | { state: "provider_unavailable"; reason: string }
  | { state: "ready"; related: RelatedEntry[]; reflection: AiResponse };

export interface PullProgress {
  status: string;
  pct: number | null;
  done: boolean;
}

export interface PullInfo {
  model: string;
  pct: number;
  status: string;
}

export interface Activity {
  embed_pending: number;
  embed_total: number;
  mood_pending: number;
  pulling: PullInfo | null;
}

export interface SearchResult {
  entry_id: string;
  snippet: string;
  created_at: string;
  distance: number;
}

export interface SearchOutput {
  results: SearchResult[];
  hidden_count: number;
}

export interface SearchAnswer {
  answer: string;
  cited_dates: string[];
}

export interface DayMood {
  date: string; // local YYYY-MM-DD
  level: number | null;
  count: number;
  /** The day's latest painted mark with its own entry's mood level; null = show the mood mark. */
  mark: { mark: string; level: number | null } | null;
}

export interface EntrySummary {
  id: string;
  preview: string;
  created_at: string;
  updated_at: string;
  no_cloud: boolean;
  tags: string[];
  mood_level: number | null;
  mood_label: string | null;
  mark: string | null;
}
