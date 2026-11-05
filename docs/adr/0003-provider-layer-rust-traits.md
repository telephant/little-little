# ADR-0003: Provider layer as Rust traits; claude -p as a sandboxed subprocess

Status: Accepted (2026-11-05)

## Context

Spec D-3 wires two chat providers in M1 (Ollama, claude -p) behind one interface; the PRD demands pluggability (llama.cpp later) and strict claude -p rules (stdin, JSON, restricted tools, empty temp dir). The no-cloud filter (AC-10) must be enforceable server-side.

## Options

1. **Rust traits (`EmbeddingProvider`, `ChatProvider`) in the backend; frontend never talks to models** — enforcement of privacy rules in one place; providers are swappable structs.
2. Frontend-side providers (fetch from React to Ollama; Tauri shell API for claude) — less IPC, but privacy enforcement scattered across JS, and entry text passes through more layers.
3. Sidecar process per provider — isolation overkill for M1.

## Decision

Option 1. ClaudeCli impl honors the full invocation contract in design-detail.md (stdin-only content, `--output-format json`, all tools disallowed, fresh empty temp cwd).

## Consequences

- `is_cloud()` on the trait drives both the privacy indicator and the retrieval-time no-cloud filter — one source of truth.
- Chat is non-streaming in M1 (reflections are 2–4 sentences); streaming can be added to the trait later without breaking impls.
- claude -p availability depends on the user's Claude Code install and auth; the app only detects and guides, never manages credentials.
