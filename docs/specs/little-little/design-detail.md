# Design detail — little-little

Reference only — not required reading for design approval. Overview in `design.md`.

## Schema (SQLite, SQLCipher-encrypted)

```sql
CREATE TABLE entries (
  id           TEXT PRIMARY KEY,          -- uuidv7
  body         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,             -- ISO-8601 UTC
  updated_at   TEXT NOT NULL,
  no_cloud     INTEGER NOT NULL DEFAULT 0,
  embed_status TEXT NOT NULL DEFAULT 'pending'  -- pending | ok | failed
);

CREATE TABLE entry_tags (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  PRIMARY KEY (entry_id, tag)
);

CREATE TABLE chunks (
  id       TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  seq      INTEGER NOT NULL,
  text     TEXT NOT NULL
);

-- vec0 virtual table; chunk_id mirrors chunks.id.
-- NOT created at migration time: created when the user first selects an embed
-- model (D-6); N = that model's dimension, probed with one test embed call and
-- stored in settings.embed_dim. Changing the embed model drops and recreates it
-- and marks all entries embed_status='pending' (full reindex).
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding FLOAT[N]
);

CREATE TABLE ai_responses (
  id                 TEXT PRIMARY KEY,
  entry_id           TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL,       -- 'reflection' in M1
  body               TEXT NOT NULL,
  context_entry_ids  TEXT NOT NULL,       -- JSON array of entry ids
  provider           TEXT NOT NULL,       -- 'ollama' | 'claude_cli'
  dismissed          INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: chat_provider ('ollama'|'claude_cli'), chat_model (nullable), embed_model (nullable),
--       embed_dim, cloud_confirmed ('1' once the user accepted the cloud dialog), schema_version
-- chat_model/embed_model start unset (D-6): embed worker idles and AI panel invites
-- selection until both are chosen (AC-16).
```

Pragmas on open: `PRAGMA key = ?` (first statement), `journal_mode=WAL`, `foreign_keys=ON`. Wrong key is detected by running `SELECT count(*) FROM sqlite_master` and catching NOTADB.

## Provider traits (Rust)

```rust
#[async_trait]
trait EmbeddingProvider {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, ProviderError>;
}

#[async_trait]
trait ChatProvider {
    fn id(&self) -> ProviderId;            // Ollama | ClaudeCli
    fn is_cloud(&self) -> bool;            // drives privacy indicator + no-cloud filter
    async fn available(&self) -> Availability;  // Ok | Unavailable(reason)
    async fn complete(&self, req: ChatRequest) -> Result<ChatResponse, ProviderError>;
}
```

`ChatRequest { system: String, user: String }` — context is already baked into `user` by the prompt layer. No tool use.

### OllamaEmbed / OllamaChat

- Base URL `http://localhost:11434`; `POST /api/embed` (`{model, input: [..]}`), `POST /api/chat` (`{model, messages, stream:false}`). [memory — confirm endpoint shapes in the spike task]
- Timeouts: embed 30s, chat 120s. `available()` = `GET /api/version` + model present in `/api/tags`.

### ClaudeCli (claude -p)

Invocation contract (AC-11):

```
cwd:   fresh mkdtemp dir, removed after the call
stdin: full prompt text (system + user concatenated by template)
argv:  claude -p --output-format json
       --disallowedTools <every tool>    # pure text generation; no file/net/shell tools
       --model <configured, default none => user's default>
env:   inherit minimally (PATH, HOME needed for auth); no entry text in env or argv
parse: JSON on stdout; `.result` field is the text; non-zero exit or parse failure => ProviderError
```

`available()` = `claude` binary runs (`claude --version` exit 0). Changed from the original "billed `-p ping`" during T-06: a version check is free and instant; auth problems surface on first `complete()` as a ProviderError with guidance. Minimum version pinned at 2.x (flags verified against 2.1.318). The invocation also passes `--max-turns 1` (belt-and-braces with the disallowed tools: one model turn, no agentic loop).

## Chunking (M1)

Split on blank lines (paragraphs); merge adjacent paragraphs until ~1000 chars; hard-split any paragraph > 1500 chars on sentence boundary. Entries shorter than 1000 chars = one chunk. Provisional — measure before tuning.

## Retrieval

```sql
SELECT c.entry_id, c.text, distance
FROM vec_chunks v JOIN chunks c ON c.id = v.chunk_id
JOIN entries e ON e.id = c.entry_id
WHERE v.embedding MATCH :query_vec AND k = :k_raw
  AND e.id != :current_entry
  AND (:cloud = 0 OR e.no_cloud = 0)
ORDER BY distance;
```

Query vector = embedding of the just-saved entry (mean of its chunk vectors). Dedupe to one best chunk per entry, take top-3 entries (provisional K). No date/mood/tag re-ranking in M1 (extension point for M3 alerts).

## Prompt layer

Templates live in Rust as const strings behind a `Persona` struct (`system_template`, `reflection_template`) — M1 ships one default persona; M3 swaps in presets/custom without touching logic. Reflection template requirements:

- Mentions each retrieved entry by date; output must reference only provided context.
- Distress guidance baked into system template: if the entry suggests serious distress, respond with warmth, no cheerfulness, and include a short support-resources line; never diagnose (AC-14).
- Output length target: 2–4 sentences.

## Background embed worker

- Spawned on unlock (tokio task). Triggers: startup scan + `entry_saved` notify channel. Idles (no polling, no errors) while `embed_model` is unset (AC-16).
- Loop: fetch oldest `pending` entry → chunk → embed → in one transaction: delete old chunks/vectors, insert new, set `ok`. On error: `failed` if permanent (model missing), stay `pending` with exponential backoff (max 60s) if Ollama unreachable.
- Single worker (no concurrency) — journal write rate makes parallelism pointless.

## Failure table (full)

| # | Failure | Detection | Response |
|---|---------|-----------|----------|
| 1 | Ollama unreachable | reqwest connect error | retry w/ backoff; panel fallback: "on-device model isn't running" |
| 2 | Embed model missing | 404 from /api/embed | `failed` + message with `ollama pull nomic-embed-text` |
| 3 | Chat model missing | 404 from /api/chat | panel fallback naming the pull command |
| 4 | claude missing/unauthenticated | PATH check / nonzero exit | provider Unavailable; settings shows guidance |
| 5 | claude JSON parse failure | serde error | ProviderError; panel offers regenerate |
| 6 | Wrong passphrase | NOTADB on probe | unlock screen error, retry (AC-3) |
| 7 | Crash mid-embed | status still pending at startup | startup scan re-runs job (idempotent txn) |
| 8 | DB migration failure | version mismatch/error | abort open with message; never partial-migrate (txn) |
| 9 | Temp dir cleanup failure | rm error | log + continue (dir is empty of secrets after read) — entry text was stdin, never on disk |

## Security notes

- Passphrase: frontend → `unlock` command → `PRAGMA key` → zeroize String. Never stored, never logged. No key stretching beyond SQLCipher's default KDF (PBKDF2-HMAC-SHA512, 256k iterations in SQLCipher 4) [memory].
- `no_cloud` enforcement is server-side (retrieval SQL) — the frontend flag is display only.
- Entry text reaches claude only via stdin; argv/env carry no user content (AC-11).
- No telemetry, no network except localhost Ollama and the claude subprocess.

## Extension points for backlog (not built in M1)

- `Persona` struct → M3 tone presets / M4 custom tones.
- Retrieval fn takes a `RetrievalQuery` struct → M2 semantic search reuses it with a text query; M3 alerts add date/mood/tag weighting.
- `ai_responses.kind` → M4 summaries, on-this-day.
- `ChatProvider` trait → M5 llama.cpp impl.

---

# M2 detail (added 2026-11-05)

## Migration v2

```sql
ALTER TABLE entries ADD COLUMN mood_level  INTEGER;  -- 1..5
ALTER TABLE entries ADD COLUMN mood_label  TEXT;     -- optional free emotion word
ALTER TABLE entries ADD COLUMN mood_source TEXT;     -- NULL | 'ai' | 'manual'
ALTER TABLE entries ADD COLUMN mood_status TEXT NOT NULL DEFAULT 'pending'; -- pending|ok|failed
```

Manual-wins invariant: AI writes mood only where `mood_source IS NULL OR mood_source='ai'`;
`set_mood` sets source='manual' and `mood_status='ok'`; edits re-queue mood
(`mood_status='pending'`) only when source != 'manual' (AC-19).

## Mood classification (C-9, ADR-0004)

Uses the ACTIVE chat provider (ADR-0004, user decision). `no_cloud` entries are never
sent to a cloud provider: local Ollama chat model if configured, else mood stays unset.
Ollama path uses a structured-output schema [verified live 2026-11-05: qwen3:4b-instruct
returned `{"level": 5, "label": "proud"}`]; the claude -p path constrains JSON by prompt
and tolerates parse failure (mood unset):

```
POST /api/chat {model, stream:false, format: {type:object, properties:{level:{type:integer,minimum:1,maximum:5}, label:{type:string}}, required:[level]}, messages:[system, user=entry text]}
```

Runs in the background worker directly after an entry's embedding pass. Any error →
`mood_status='failed'`, mood fields untouched, no retry storm (next edit re-queues).

## Calendar query (F-8)

```sql
-- per day in [start,end): prefer latest manual entry, else latest ai entry
SELECT date(created_at) d,
       coalesce(
         (SELECT mood_level FROM entries e2 WHERE date(e2.created_at)=d AND mood_source='manual' ORDER BY created_at DESC LIMIT 1),
         (SELECT mood_level FROM entries e3 WHERE date(e3.created_at)=d AND mood_source='ai'     ORDER BY created_at DESC LIMIT 1)
       ) level,
       count(*) n
FROM entries GROUP BY d HAVING d >= :start AND d < :end;
```

(Implemented as two passes in Rust if this gets unwieldy; dates are local-day strings derived from the ISO timestamps.)

## Search (F-9)

- `search(query)` → embed query (local) → `related_entries`-style KNN (no exclude-entry, k=8 provisional, cloud flag from active provider) → `[{entry_id, date, snippet, distance}]`. Must return without any chat call (NFR).
- `search_answer(query, entry_ids)` → prompt: "Answer the question in 1–2 sentences using ONLY these dated excerpts; cite dates" → active ChatProvider → `{answer, cited_dates}`. No-cloud text can never be in `entry_ids`' excerpts when provider is cloud because the KNN already filtered (AC-23).

## Export / restore (F-10)

- Markdown: `<dir>/YYYY-MM-DD-<id8>.md`, frontmatter `date/tags/mood_level/mood_label/no_cloud`, body verbatim (AC-24).
- JSON: `{version:1, exported_at, entries:[{id, body, created_at, updated_at, no_cloud, tags, mood_level, mood_label, mood_source}]}` (AC-25). No embeddings exported (recomputable, keeps file small).
- `restore_json`: refuses unless `entries` table is empty; inserts all in one transaction with `embed_status='pending'`, `mood_status` preserved for manual, 'pending' otherwise.
- Directory/file picking via `tauri-plugin-dialog` [memory — confirm plugin API in the task].

## Pull manager (C-13)

`pull_model(name, channel)` → `POST /api/pull {model, stream:true}` → NDJSON lines
`{status, digest?, total?, completed?}` [verified against ollama-rs/OllamaSharp client models 2026-11-05];
forward `{status, pct}` over a `tauri::ipc::Channel` [memory — confirm channel API in the task];
terminal line `status:"success"`. One pull at a time; progress also surfaces in `get_activity`.

## Activity (C-14)

`get_activity()` → `{embed_pending, embed_total, mood_pending, pulling: {model, pct, status}?}`
from cheap COUNT queries + pull state. As built (T-18): the frontend polls every 2s whenever the
journal is unlocked — the three COUNTs are negligible and this is simpler than busy-gated polling;
revisit only if it ever shows up in profiles. Chips in settings derive from `SettingsView` + activity.
