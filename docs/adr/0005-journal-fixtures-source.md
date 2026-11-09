# ADR-0005: Test journal dataset — single JSON source, Rust test-gated generator

Status: Accepted 2026-11-05

## Context

journal-fixtures needs ~60 curated entries delivered as both a restorable backup (`ExportFile` v1) and a cargo fixture, provably in sync (spec G-3/AC-4), deterministic, with test-only metadata (arcs, probes, edge/distress designators) that must not leak into outputs.

## Options

1. **One JSON source in `src-tauri/tests/fixtures/`, generator + validation as cargo tests (regen behind `#[ignore]`)** — no new deps, same serde the app uses, sync asserted on every `cargo test`.
2. YAML/TOML source + Python script — nicer multiline prose, but adds a toolchain outside cargo, a second serializer to keep byte-stable, and nothing enforces sync in CI by default.
3. No source file: hand-maintain the two outputs — drift is guaranteed; test-only metadata has nowhere to live.
4. Generate at build time (no checked-in outputs) — outputs not reviewable/diffable; restore file not simply downloadable from the repo.

## Decision

Option 1. Files: source `journal-dataset.json` (schema `jf-1`), outputs `journal-backup.json` + `journal60.json`, all under `src-tauri/tests/fixtures/`; generator/tests in a `#[cfg(test)]` module. Dates are fixed (May–Nov 2026), accepted to age rather than lose determinism.

## Consequences

- Sync can never silently drift (`outputs_in_sync` runs in every `cargo test`); regen is one command.
- Editing prose inside JSON strings is mildly unpleasant (escaped newlines) — accepted for zero new tooling.
- When `ExportFile` goes v2, the generator is the single place to update, and the round-trip test catches it.
- The checked-in backup JSON is directly usable: anyone can restore it into a fresh dev journal from the repo.
