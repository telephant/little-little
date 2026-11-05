# Design — little-little (M1 shipped + M2)

Read this file, then skim `diagrams/index.html` (rendered from `diagrams/diagrams.md`). `design-detail.md` is reference only. ADRs in `docs/adr/`. M1 components C-1…C-8 are built and verified; M2 adds C-9…C-14.

## Components

| ID | Component | Job | Notes |
|----|-----------|-----|-------|
| C-1 | Editor UI (React) | Entry editor, autosave debounce, tags, chronological entry list | No AI logic; talks only to C-4 |
| C-2 | AI panel (React) | Related memories, reflection, regenerate/dismiss, fallback states | Renders what C-6/C-8 produced; every item links to its source entry |
| C-3 | Shell UI (React) | First-run passphrase, unlock screen, settings pane (provider + model pickers), privacy indicator, cloud-switch confirm dialog, light/dark theme | Indicator derives from active chat provider; model lists come from Ollama `/api/tags`; no defaults (D-6) |
| C-4 | IPC layer (Tauri) | Typed commands + events between frontend and Rust | All state lives in Rust; frontend is a view |
| C-5 | Storage (Rust) | rusqlite + SQLCipher: schema, migrations, unlock, CRUD | Key derived by SQLCipher from passphrase; held in memory only |
| C-6 | Memory engine (Rust) | Chunker, background embed worker, sqlite-vec index, retrieval | Worker is crash-safe: `entries.embed_status` is the queue |
| C-7 | Provider layer (Rust) | `EmbeddingProvider` + `ChatProvider` traits; impls: OllamaEmbed, OllamaChat, ClaudeCli | ClaudeCli per PRD sandbox rules; see design-detail |
| C-8 | Prompt/context layer (Rust) | Prompt templates (incl. distress guidance), context assembly, no-cloud filter | Single default tone in M1; persona interface stubbed for M3 |
| C-9 | Mood engine (Rust) | JSON-constrained mood classification (level 1–5 + label) in the background worker; manual-wins rules | Uses the ACTIVE chat provider; `no_cloud` entries never go to cloud — local fallback or unset (ADR-0004); never blocks or overwrites manual |
| C-10 | Calendar view (React) | Month grid colored by day mood, manual-first; day click → entries; month nav | Colors from theme tokens per level |
| C-11 | Search (Rust + React) | Query embedding → ranked entries (instant), then AI answer with cited dates (async) | Reuses retrieval + no-cloud filter; results never wait on the answer |
| C-12 | Export / restore (Rust) | Markdown-per-entry with frontmatter; single JSON backup; transactional restore into empty journal | Restored entries re-queue for embedding/mood |
| C-13 | Onboarding + pull manager (React + Rust) | Guided first-run model setup; `/api/pull` with streamed progress (Tauri channel); Claude detection/guidance | Fully skippable; everything also in settings |
| C-14 | Activity/status surface (both) | Per-model status chips (ready/probing/downloading %/indexing i of n) + global busy indicator | Pull-based: `get_activity` polled only while busy (AC-29) |

## Key flows

- **F-1 Unlock / first-run** — set or enter passphrase → C-5 opens DB → app state Unlocked. (diagram: App state)
- **F-2 Write & autosave** — C-1 debounces → `save_entry` → C-5 writes, marks `embed_status=pending`. (sequence)
- **F-3 Embed pipeline** — C-6 worker picks pending entries → chunk → OllamaEmbed → vectors into vec index → `embed_status=ok`, event to UI. (sequence, state)
- **F-4 Reflect** — on save-settle: C-6 retrieves top-K chunks (excluding the entry itself; excluding no-cloud entries when provider is cloud) → C-8 builds prompt → C-7 chat → response stored + shown with source links. (sequence)
- **F-5 Provider & model selection** — settings → `set_provider` (switch to claude_cli gated by one-time confirm dialog, D-5) / `set_models`; indicator updates everywhere. First embed-model choice probes the model's dimension and creates the vec table; a later change rebuilds the index (all entries → pending). Until models are chosen, the embed worker idles and the AI panel invites selection (AC-16).
- **F-6 Edit / delete re-index** — edit: delete chunks+vectors in one transaction, mark pending; delete: remove entry, chunks, vectors, responses. 
- **F-7 Mood pipeline** — worker, after embedding an entry: if `mood_source != 'manual'` → classify via the active provider — except `no_cloud` entries under a cloud provider, which use the local model or stay unset (ADR-0004) → store level/label/source='ai'. Manual picker calls `set_mood` (source='manual', permanent — AC-19). Failures leave mood unset, never block (AC-18).
- **F-8 Calendar** — `calendar_month(y,m)` returns per-day {level, count}: latest manual-mood entry of the day wins, else latest AI-mooded entry. Day click → `list_entries` filtered by date (AC-20).
- **F-9 Search** — `search(query)`: embed query locally → KNN → ranked entries returned immediately; UI then calls `search_answer(query, top_ids)` → one-line answer citing dates via active provider, no-cloud filter applied when cloud (AC-21–23).
- **F-10 Export / restore** — `export_markdown(dir)`, `export_json(path)`; `restore_json(path)` only into an empty journal, one transaction, entries re-queued pending (AC-24–25).
- **F-11 Onboarding** — after passphrase (or models unset): detect Ollama + claude → pick installed or pull (progress streamed over a Tauri channel) → land in editor with AI ready (AC-26–28).

## Data contracts (summary — full schema in design-detail)

| Table | Purpose |
|-------|---------|
| `entries` | id, body, timestamps, `no_cloud`, `embed_status` (pending/ok/failed) |
| `entry_tags` | entry_id, tag |
| `chunks` | id, entry_id, seq, text |
| `vec_chunks` | vec0 virtual table: chunk_id → float[N] embedding; created when the embed model is first chosen, N probed from it |
| `ai_responses` | id, entry_id, kind=reflection, body, context_entry_ids (JSON), provider, dismissed |
| `settings` | key/value: active chat provider, model names |
| `entries` (M2, migration v2) | + `mood_level` (1–5), `mood_label`, `mood_source` (null/'ai'/'manual'), `mood_status` (pending/ok/failed) |

IPC commands: `setup_passphrase`, `unlock`, `create_entry`, `save_entry`, `list_entries`, `get_entry`, `delete_entry`, `set_tags`, `set_no_cloud`, `get_ai_panel`, `regenerate_reflection`, `dismiss_response`, `get_settings`, `set_provider`, `set_models`, `list_available_models`, `journal_exists`. M2 adds: `set_mood`, `calendar_month`, `search`, `search_answer`, `export_markdown`, `export_json`, `restore_json`, `pull_model` (progress via Tauri channel), `get_activity`. Events: none — M1 chose pull-based (get_ai_panel polls on `thinking`); M2 keeps that, with the one exception of the pull progress channel (a per-call stream, not a global event bus).

## Tricky parts

- **Crash-safe background embedding:** no in-memory queue; `embed_status=pending` *is* the queue. Worker scans on startup and on save events. Failure → `failed` + retry with backoff while Ollama is unreachable.
- **Re-embed on edit:** chunk+vector delete and `pending` mark happen in one SQLite transaction; worker re-embeds. Guarantees AC-8's "only current text indexed".
- **No-cloud filter placement:** applied in retrieval SQL (C-6), not in the prompt layer, so flagged text can never reach context assembly when the active chat provider is cloud. Embeddings are always local, so flagged entries still get indexed.
- **claude -p sandbox:** stdin only, `--output-format json`, all tools disallowed, cwd = fresh empty temp dir, deleted after. Full invocation contract in design-detail.
- **Key hygiene:** passphrase passed straight to SQLCipher `PRAGMA key`, zeroized after; never logged, never crosses IPC back to frontend.

## Top failure modes

| Failure | Behavior |
|---------|----------|
| Ollama down | Entries save normally; embed jobs stay pending with backoff; AI panel shows calm fallback (AC-13) |
| Embedding model not pulled | `failed` status + actionable message naming the `ollama pull` command |
| claude binary missing / not signed in | Provider reports unavailable; panel fallback, indicator stays accurate |
| Crash mid-write | Autosave + WAL mean at most the last debounce window is lost |
| Wrong passphrase | SQLCipher open fails cleanly; retry screen (AC-3) |

## Technology

Tauri 2.x · React 18 + TypeScript + Vite · rusqlite (`bundled-sqlcipher-vendored-openssl`) · sqlite-vec Rust crate 0.1.x (static link, `sqlite3_auto_extension`) [verified] · tokio (Tauri runtime) · reqwest (Ollama HTTP) · serde. No default models (D-6): user picks from installed Ollama models; `nomic-embed-text` and `qwen3:4b-instruct` are available on this machine for development [verified].

## AC coverage

| AC | Component / flow |
|----|------------------|
| AC-1 | C-1, C-5, F-2 |
| AC-2 | C-5 |
| AC-3 | C-5, F-1 |
| AC-4 | C-6, F-3 |
| AC-5 | C-6, F-3 |
| AC-6 | C-2, C-6, F-4 |
| AC-7 | C-2, C-7, C-8, F-4 |
| AC-8 | C-6, F-6 |
| AC-9 | C-3, F-5 |
| AC-10 | C-6, C-8, F-4 |
| AC-11 | C-7 |
| AC-12 | C-2, F-4 |
| AC-13 | C-2, C-7 |
| AC-14 | C-8 |
| AC-15 | C-3 |
| AC-16 | C-3, C-6 |
| AC-17 | C-3, F-5 |
| AC-18 | C-9, F-7 |
| AC-19 | C-9, F-7 |
| AC-20 | C-10, F-8 |
| AC-21 | C-11, F-9 |
| AC-22 | C-11, F-9 |
| AC-23 | C-11, F-9 |
| AC-24 | C-12, F-10 |
| AC-25 | C-12, F-10 |
| AC-26 | C-13, F-11 |
| AC-27 | C-13, F-11 |
| AC-28 | C-13, F-11 |
| AC-29 | C-14 |

## Questions to answer before approving this design

M1 questions all approved 2026-11-05 (queue-on-entries, save-settle reflection, no-cloud semantics + confirm dialog, tools disallowed, no default models).

M2 — all resolved 2026-11-05:

- [x] Mood provider — **changed by user**: ACTIVE provider, with the no-cloud carve-out (local fallback/unset); cloud-confirm copy must mention background moods (ADR-0004 Accepted)
- [x] Day color tie-break (latest manual, else latest AI) — approved
- [x] AI may re-classify on edit while source='ai'; manual absorbing — approved
- [x] Search: instant ranked results + independent async answer; cloud mode hides flagged entries with a "N hidden" note — approved
- [x] Restore into empty journal only; merge → backlog — approved
- [x] Onboarding curated shortlist, never auto-selected — approved
