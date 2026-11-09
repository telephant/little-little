# journal-fixtures — verify

Verified 2026-11-09. **Verdict: pass.** AC-1..AC-10 automated (re-run this session); AC-11 confirmed by the user in the real app.

## Run (this session)

`pnpm check`: exit 0 (191 frontend tests, 72 Rust tests, clippy clean; the 10 `testdata` tests run in every check). Live probe re-run:
`OLLAMA_TEST=1 cargo test --lib live_probe_quality -- --ignored --nocapture` against `nomic-embed-text:latest` — **7/7 probes hit the top 5** (bar was 5 of 6); all 57 entries embedded in **0.6 s**.

## Results

| AC | Test | Result | Evidence |
|----|------|--------|----------|
| AC-1 source validates | TC-1 `tc1_source_validates_full_size` (+ `source_is_structurally_valid`) | pass | cargo test |
| AC-2 backup output conforms | TC-7 `tc7_backup_conforms_to_export_v1` | pass | cargo test |
| AC-3 backup restores | TC-8 `tc8_backup_restores_round_trip` | pass | cargo test |
| AC-4 outputs in sync | TC-9 `tc9_outputs_in_sync` | pass | cargo test (still byte-identical after the `mark` field was added: it is skipped when empty) |
| AC-5 story arcs | TC-2 `tc2_story_arcs` | pass | cargo test |
| AC-6 privacy coverage | TC-3 `tc3_privacy_coverage` | pass | cargo test |
| AC-7 distress entry present | TC-4 `tc4_distress_entry` | pass | cargo test |
| AC-8 edge cases present | TC-5 `tc5_edge_cases` | pass | cargo test |
| AC-9 moods ship null | TC-6 `tc6_moods_ship_null` | pass | cargo test |
| AC-10 search probes plausible | TC-10 `live_probe_quality` (live, ignored) | pass | 7/7 hit top-5 this session |
| AC-11 interactive pass | TC-11 (M-1..M-5) | **manual-ok** | the user confirmed all five steps worked in the real app (2026-11-09) |

## Measurements

| What | Target | Observed |
|------|--------|----------|
| Embed 57 entries (live, dev machine) | n/a | **0.6 s** (2026-11-09); 2.7 s on 2026-11-05 |
| Restore-to-ready (stopwatch to idle chips) | ~30 s [assumption] | not timed during the user's pass; no complaint reported |
| Probe quality | >= 5/6 | **7/7** |

## Drift check

Names and paths match: `src-tauri/tests/fixtures/journal-backup.json`, `journal-dataset.json`, `journal60.json`, the `testdata` module, Settings "Restore backup". The backup format gained an optional `mark` field (paint-marks) that is skipped when empty, so the fixture files are unchanged and still verified by TC-9. ADR-0005 (fixtures source) is still accurate. No README claim to fix.

## Scope

Nothing beyond the spec was built. Backlog items (parameterised generator, non-English variant, auto-restore flag, expanded probe suite) are untouched.

## Findings

None open.
