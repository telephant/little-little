# journal-fixtures — design

Read with `diagrams/index.html` open. Detail reference: `design-detail.md` (not required for approval).

## Components

| ID | Component | Job | Notes |
|----|-----------|-----|-------|
| C-1 | Dataset source `src-tauri/tests/fixtures/journal-dataset.json` | Single source of truth: ~60 curated entries + arc definitions + probe queries, schema `jf-1` | Hand-curated prose; test-only fields (arc, edge, distress) live here and never reach outputs |
| C-2 | Generator (Rust, in `src-tauri/src/testdata.rs`, test-gated) | Deterministically derive the two outputs from C-1 | Run via `cargo test regen_fixtures -- --ignored`; stable order (created_at, id), fixed `exported_at` |
| C-3 | Backup output `src-tauri/tests/fixtures/journal-backup.json` | `ExportFile` v1 the user restores via Settings → Restore backup | Moods null → restore queues embed + mood work [verified: export.rs restore preserves id/dates/tags/no_cloud] |
| C-4 | Cargo fixture `src-tauri/tests/fixtures/journal60.json` | Same shape as existing `entries.json` rows, for `load_fixtures`-style loading in Rust tests | Existing `entries.json` and its tests stay untouched |
| C-5 | Validation + sync tests (same module as C-2) | Assert content rules (AC-1, 5–9) against C-1 and byte-equality of C-3/C-4 with regenerated output (AC-4) | Run in every `cargo test` |
| C-6 | Restore round-trip test | Generate → `restore_json` into temp Storage → assert fields intact (AC-2, AC-3) | Reuses existing export module |
| C-7 | Live probe test (`#[ignore]`, `OLLAMA_TEST=1`) | Load C-4 into temp storage, embed for real, run ranked search per probe, assert expected id in top-5 for ≥5/6 (AC-10) | Tolerance-based; embedding-model dependent |

## Key flows

- **Regen**: edit C-1 → run regen test → C-3/C-4 rewritten → sync test green again (diagram: Sequence).
- **Interactive use**: wipe dev journal → onboard → Restore backup → worker embeds + classifies ~60 entries → calendar/search/reflections exercised (diagram: Product flow).
- **CI**: `cargo test` runs C-5 + C-6 always; C-7 only with `OLLAMA_TEST=1 -- --ignored`.

## Dataset content plan (the curation is the real work)

Span 2026-05-04 → 2026-11-03 (~183 days), 58–62 entries, 3–4/wk with believable gaps.

| Arc tag | Thread | ~Entries | Notes |
|---------|--------|----------|-------|
| `work` | stuck at current job → applications → interviews → offer → first weeks | 12 | reuses interview-anxiety motif distinct from old fixture's Northwind |
| `running` | couch → first 10K race | 9 | measurable progress for callbacks |
| `family` | mother's health scare → surgery → recovery | 8 | contains ≥2 no_cloud; the single distress entry is this arc's low point (no_cloud) |
| `pottery` | beginner class → first glazed bowl | 7 | light counterweight arc |
| (untagged / misc) | weather, cooking, friends, films | ~20 | includes edge cases: <40 chars, >2000 chars, emoji, a 中文 snippet, 2 same-day pairs |

Probes (≥6) are written against this content, e.g. "when did I decide to leave my job" → expected `jf-0xx` ids.

## Tricky parts

- **Sync without flapping**: byte-identity requires one serializer (serde_json pretty, 2-space), fixed `exported_at: "2026-11-05T00:00:00Z"`, and ordering by (created_at, id); the sync test regenerates in memory and compares strings.
- **Probe stability**: top-5 membership with a 5-of-6 pass bar, not rank equality; probes target distinctive vocabulary.
- **No production code paths touched**: generator + tests are `#[cfg(test)]`-gated; the shipped app binary is unchanged.

## Failure modes

| # | Failure | Detection | Handling |
|---|---------|-----------|----------|
| 1 | Hand-edit of a generated file | sync test fails | regen or fix source |
| 2 | ExportFile schema evolves (v2) | C-6 compile/test fails | regen after updating generator |
| 3 | Probe flakes on model change | C-7 fails | re-tune probes; bar is 5/6 |
| 4 | Future-dated entries after time passes | none (dates are fixed 2026) | accepted: dataset is period-correct, not relative [assumption] |

## Technology

Rust + serde/serde_json (already in-tree), no new dependencies. No external services except Ollama for the ignored live test.

## AC coverage

| AC | Component/flow |
|----|----------------|
| AC-1 | C-5 |
| AC-2 | C-6 |
| AC-3 | C-6 |
| AC-4 | C-5 |
| AC-5 | C-5 (arc rules vs C-1) |
| AC-6 | C-5 |
| AC-7 | C-5 |
| AC-8 | C-5 |
| AC-9 | C-5 + C-6 |
| AC-10 | C-7 |
| AC-11 | manual flow (Product flow diagram) |

## Questions to answer before approving this design

- [x] `src-tauri/tests/fixtures/` home for all three files — accepted via ADR-0005 (2026-11-05)
- [x] Generator as an `#[ignore]`d cargo test — accepted via ADR-0005 (2026-11-05)
- [x] Fixed dates that age, for determinism — accepted via ADR-0005 (2026-11-05)
- [x] Arc themes (work / running / family-with-distress / pottery + misc) — confirmed by user (2026-11-05)
