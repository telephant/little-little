# quiet-memories — plan

## Plan validation
Run 2026-11-09 with grep:

| Check | Result |
|-------|--------|
| Every AC (1–11) has ≥1 TC | pass |
| Every AC has ≥1 task | pass |
| Every automated TC appears in a task with its Given/When/Then | pass |
| Names consistent (`generate`, `not_requested`, `earlier`, `later`, `reflectTiming`) | pass |
| Proposed ADRs | none, none needed |
| Backlog items leaked into scope | none |
| Open questions / unchecked checklist items | none (manual TC-12 belongs to verify) |

Note: all tasks were built before this plan existed. /spec-implement therefore confirms each task's tests are green rather than writing them first. Go.

## Order
1. T-02 backend `generate` flag (de-risks the privacy claim: no model call without a request) — spike
2. T-01 idle hook and wiring
3. T-03 Look back
4. T-04 Earlier / Later

## Task status
- [x] T-01 idle-gated asking (2026-11-09) — QR-1…QR-6 green (QuietReflection looped 5× with no failures)
- [x] T-02 `generate` flag / `not_requested` (2026-11-09) — Rust `lookup_without_generate_*`, `tc7`, `tc9` green
- [x] T-03 Look back (2026-11-09) — QR-7 green
- [x] T-04 Earlier / Later (2026-11-09) — MS-1, MS-2 and Rust `ready_panel_groups_*` green
Built before the plan existed; confirmed by running each task's named tests in this session (26 frontend, 12 Rust). Manual TC-12 is left to /spec-verify.

Definition of Done: tests green, `pnpm check` green, docs updated, no secrets.
