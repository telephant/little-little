# Little Little

Write a little every day, and see how far you've come.

A private, local-first desktop journal (Tauri 2 + React + Rust). Entries are
stored in a SQLCipher-encrypted SQLite file, embedded on-device into sqlite-vec,
and gently reflected back: after you write, the side panel shows related past
entries and a short reflection — via Ollama (on-device) or Claude Code's
`claude -p` (cloud, explicit opt-in, one-time confirmation).

Beyond writing (M2): every entry quietly gets an AI **mood** (manual always
wins) feeding a mood-colored **calendar**; **semantic search** answers plain
questions ("when did I last feel anxious about work?") with instant results and
a one-line cited answer; **export/backup** to Markdown or JSON with restore;
guided **onboarding** downloads models with live progress; status chips keep
model state honest. Entries flagged "never send to cloud" stay out of every
cloud call — reflections, search answers and background mood reading alike.

## Run (dev)

Prerequisites: Rust (rustup), Node + pnpm, and [Ollama](https://ollama.com) running
with at least one embedding model and one chat model pulled, e.g.:

```bash
ollama pull nomic-embed-text
ollama pull qwen3:4b-instruct
```

Then:

```bash
pnpm install
pnpm tauri dev
```

First launch: choose a passphrase (**there is no recovery if you lose it**),
then onboarding guides you through picking (or downloading) your embedding +
chat models — nothing is ever selected for you. Write an entry, pause, and
watch the panel; try the Calendar and Search views after a few entries.

## Checks

```bash
pnpm check   # vitest + tsc + vite build + cargo test + clippy
```

Manual checklist (themes, distress tone, zero-network) lives in
`docs/specs/little-little/tests.md`; measured numbers in
`docs/specs/little-little/measurements.md`.

## Docs

Spec-driven: see `docs/specs/little-little/` (spec → design → plan → tasks) and
`docs/adr/` for the three load-bearing decisions (SQLCipher via rusqlite,
sqlite-vec statically linked, provider layer as Rust traits with a sandboxed
`claude -p`).
