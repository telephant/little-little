# Little Little

Write a little every day, and see how far you've come.

A private, local-first desktop journal (Tauri 2 + React + Rust). Entries are
stored in a SQLCipher-encrypted SQLite file, embedded on-device into sqlite-vec,
and gently reflected back: after you write, the side panel shows related past
entries and a short reflection — via Ollama (on-device) or Claude Code's
`claude -p` (cloud, explicit opt-in, one-time confirmation).

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
then open Settings and pick your embedding + chat models — nothing is selected
for you. Write an entry, pause, and watch the panel.

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
