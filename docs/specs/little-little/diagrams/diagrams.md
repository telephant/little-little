# little-little — design diagrams

## Product flow

```
1  --> First launch: choose a passphrase
1b --> Pick your models in settings (nothing is pre-selected); AI features wait until you do
2  --> Write today's entry; it saves itself as you type
3  --> A moment after you stop, the side panel shows past entries that relate to what you wrote
4  --> Below them, a short caring reflection, citing the entries it drew on
5  --> Regenerate it, dismiss it, or just keep writing
6  --> Settings: switch between On-device (Ollama) and Cloud (Claude); first switch to Cloud asks you to confirm; the badge in the corner always shows which is active
7  --> Mark any entry "never send to cloud"; it stays out of anything sent to Claude
```

Check:
- Does the reflection appearing *after* save-settle (not live while typing) match the calm, non-intrusive feel?
- Is a corner badge enough of a privacy indicator, or should switching to Cloud require an extra confirmation?
- First entry ever: panel says "nothing to relate yet" — good enough for the empty state?

## Components

```mermaid
flowchart TB
  subgraph Frontend [React frontend]
    C1[C-1 Editor UI]
    C2[C-2 AI panel]
    C3[C-3 Shell: unlock, settings, indicator]
  end
  C4[C-4 Tauri IPC commands + events]
  subgraph Backend [Rust backend]
    C5[C-5 Storage: SQLCipher + rusqlite]
    C6[C-6 Memory engine: chunk, embed, retrieve]
    C8[C-8 Prompt and context layer]
    C7[C-7 Providers: OllamaEmbed, OllamaChat, ClaudeCli]
  end
  DB[(Encrypted SQLite + vec_chunks)]
  OL[Ollama localhost]
  CC[claude -p subprocess]
  C1 & C2 & C3 --- C4
  C4 --> C5 & C6
  C6 --> C5
  C6 --> C8 --> C7
  C5 --> DB
  C7 --> OL
  C7 --> CC
```

Check:
- All AI/DB state lives behind C-4; the frontend holds no journal data beyond what's displayed — acceptable?
- C-8 sits between memory engine and providers so personas can swap without touching retrieval — clear?

## Save → embed → reflect (primary sequence)

```mermaid
sequenceDiagram
  participant U as User
  participant ED as Editor (C-1)
  participant IPC as IPC (C-4)
  participant ST as Storage (C-5)
  participant ME as Memory engine (C-6)
  participant PR as Prompt layer (C-8)
  participant CP as Chat provider (C-7)
  U->>ED: types, then pauses
  ED->>IPC: save_entry (debounced)
  IPC->>ST: write body, embed_status=pending
  ST-->>ME: notify worker
  ME->>CP: embed chunks (OllamaEmbed)
  ME->>ST: vectors into vec_chunks, status=ok
  ED->>IPC: save-settle → get_ai_panel
  ME->>ST: retrieve top-K chunks (filters: not self, no-cloud if cloud)
  ME->>PR: entry + retrieved context
  PR->>CP: ChatRequest (reflection template)
  CP-->>IPC: reflection + source entry ids
  IPC-->>ED: ai_panel_ready → related memories + reflection
```

Check:
- Reflection waits for the new entry's own embedding only to build the query vector — is mean-of-chunks as the query acceptable for M1?
- If embedding is still running at save-settle, panel shows "thinking…" and fills when ready — OK?

## Data model

```mermaid
erDiagram
  ENTRIES ||--o{ ENTRY_TAGS : has
  ENTRIES ||--o{ CHUNKS : "split into"
  CHUNKS ||--|| VEC_CHUNKS : "embedded as"
  ENTRIES ||--o{ AI_RESPONSES : "reflected by"
  ENTRIES {
    text id PK
    text body
    int no_cloud
    text embed_status
  }
  CHUNKS {
    text id PK
    text entry_id FK
    int seq
    text text
  }
  VEC_CHUNKS {
    text chunk_id PK
    floatN embedding
  }
  AI_RESPONSES {
    text id PK
    text entry_id FK
    text kind
    text context_entry_ids
    text provider
    int dismissed
  }
```

Check:
- `context_entry_ids` as JSON on the response row is the whole "honest AI" audit trail — sufficient?
- Cascade deletes cover AC-8's delete path — any orphan risk in vec_chunks (no FK support in vec0 virtual tables)?

## Lifecycles

```mermaid
stateDiagram-v2
  state App {
    [*] --> FirstRun: no DB file
    [*] --> Locked: DB exists
    FirstRun --> Unlocked: set passphrase
    Locked --> Unlocked: correct passphrase
    Locked --> Locked: wrong passphrase
  }
  state EntryEmbedding {
    [*] --> pending: saved or edited
    pending --> ok: worker embeds
    pending --> failed: permanent error
    failed --> pending: retry / model installed
    ok --> pending: entry edited
  }
```

Check:
- `ok → pending` on every edit means frequent small edits re-embed the whole entry — fine at journal scale?
- `failed` is only for permanent errors (missing model); transient Ollama outages stay `pending` — clear enough for debugging?

## M2 additions (components)

```mermaid
flowchart TB
  subgraph Existing [M1 core]
    C5[C-5 Storage]
    C6[C-6 Memory engine]
    C7[C-7 Providers]
  end
  C9[C-9 Mood engine] -->|active provider; no-cloud stays local| C7
  C9 --> C5
  C6 -. same worker .- C9
  C10[C-10 Calendar view] --> C5
  C11[C-11 Search] --> C6
  C11 --> C7
  C12[C-12 Export / restore] --> C5
  C13[C-13 Onboarding + pull] --> OL[Ollama /api/pull]
  C14[C-14 Activity surface] --> C5
```

One worker loop handles embeddings then moods; search reuses retrieval; onboarding is a guided path over existing settings commands plus the pull manager.

Check:
- Mood engine uses the active provider, but no-cloud entries never reach ClaudeCli (local fallback/unset) — matches ADR-0004 as accepted?
- Calendar reads storage directly (no AI) — fast and offline, right?
- Is a per-call progress channel (pull) consistent enough with the otherwise pull-based IPC?

## Search sequence (M2)

```mermaid
sequenceDiagram
  participant U as User
  participant UI as Search UI (C-11)
  participant ME as Memory engine (C-6)
  participant CP as Chat provider (C-7)
  U->>UI: "anxious about work?"
  UI->>ME: search(query)
  ME-->>UI: ranked entries (instant, no LLM)
  UI->>CP: search_answer(query, top ids)
  CP-->>UI: 1-line answer + cited dates
```

Check:
- Results render before any model call — does the UI make the answer clearly optional/late?
- When the provider is cloud, the no-cloud entries were already filtered at KNN — acceptable that on-device search finds MORE than cloud-mode search?

## Mood lifecycle (M2)

```mermaid
stateDiagram-v2
  [*] --> unset: entry created
  unset --> ai: worker classifies (local model)
  unset --> manual: user picks
  ai --> manual: user overrides
  manual --> manual: edits never reset it
  ai --> ai: edit re-queues, AI may update
  ai --> failed_kept: classification error (mood kept unset/stale)
```

Check:
- `manual` as an absorbing state — exactly the AC-19 guarantee?
- AI re-classifying on edit (while source='ai') — desirable, or should the first AI mood stick?
