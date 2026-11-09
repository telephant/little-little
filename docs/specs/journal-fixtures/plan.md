# journal-fixtures — plan

## Plan validation (2026-11-05)

| Check | Result |
|-------|--------|
| AC → test coverage | PASS — AC-1..11 each covered by exactly one TC (TC-1..11); no orphan tests |
| AC → design coverage | PASS — design.md AC coverage table maps all 11 |
| AC → task coverage | PASS — every AC named by ≥1 task below |
| Cross-doc names | PASS — file names (journal-dataset/backup/journal60), module `testdata`, ids `jf-NNN`/`P-n` identical across spec/design/detail/diagrams/tests/tasks |
| Proposed ADRs treated as decided | PASS — ADR-0005 is Accepted |
| Untagged claims / invented numbers | PASS — ~30 s restore-to-ready is in Measurements as provisional, not an AC |
| Backlog leaks | PASS — no parameterized generation, language variants, or auto-restore in tasks |
| Open questions | none — design checklist all ticked, arc themes user-confirmed |

Verdict: **GO** — gates.plan approved.

## Tasks

Spike-in-front rationale: the one unverified load-bearing claim is byte-stable regeneration + ExportFile round-trip; T-01 proves that chain on a seed subset before the big curation effort in T-02.

| # | Task | Implements | Phase |
|---|------|-----------|-------|
| T-01 ✅ 2026-11-05 | Mechanics spike: source schema, generator, sync + round-trip tests on a 6-entry seed | AC-2, AC-3, AC-4, AC-9 (TC-6..9 green) | A |
| T-02 ✅ 2026-11-05 | Curate the full dataset: 57 entries, 4 arcs, privacy/distress/edge coverage, 7 probes; regen | AC-1, AC-5..AC-8 (TC-1..5 green) | B |
| T-03 ✅ 2026-11-05 | Live probe test + probe tuning (no tuning needed: 7/7 hit) | AC-10 (TC-10 green under OLLAMA_TEST=1) | C |
| T-04 ✅ 2026-11-05 | Manual pass prep: verify.md checklist wiring, measurements capture | AC-11 (manual) | C |

Milestones: **A done** → chain proven end-to-end on seed data. **B done** → the real dataset exists and validates. **C done** → quality proven live; ready for /spec-verify.

Rough effort: A ≈ 0.5 day; B ≈ 1 day (curation is the work); C ≈ 0.5 day.

## Definition of Done (every task)

Tests first (red for the right reason), `pnpm check` green (includes cargo tests), docs/status updated, no secrets, generated files only ever written by the regen test.
