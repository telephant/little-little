# ADR-0004: Mood classification uses the active chat provider, with a no-cloud carve-out

Status: Accepted (2026-11-05) — user chose option 2 over the recommended option 1

## Context

M2 assigns every entry a mood (level 1–5 + label, D-8) automatically in the background worker. The active chat provider may be local (Ollama) or cloud (claude -p). The recommendation was "always local" for privacy/cost; the user explicitly chose the active provider for consistency with the rest of the AI features.

## Options

1. Always the local Ollama chat model (recommended; rejected by user).
2. **Active chat provider** — consistent: whatever generates your reflections also reads your mood.
3. Dedicated tiny classifier model — extra download, deferred.

## Decision

Option 2, with one hard rule: **entries flagged `no_cloud` are never sent to a cloud provider for mood classification.** When the active provider is cloud, flagged entries are classified by the local Ollama chat model if one is configured, otherwise their mood stays unset (manual still works). This keeps AC-10's promise intact ("no AI feature sends flagged text to the cloud").

## Consequences

- With Claude active, every unflagged entry's text goes to Claude once per (re)classification, with per-entry API cost. The cloud-confirm dialog copy must mention background mood classification.
- Mood path needs provider-selection logic (active / local-fallback / skip) instead of one fixed provider.
- Structured JSON output must also be parsed from claude -p (prompt-constrained; no `format` parameter there) — slightly weaker guarantees than Ollama's schema enforcement; parse failures leave mood unset.
