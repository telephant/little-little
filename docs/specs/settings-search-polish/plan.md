# settings-search-polish — plan

## Plan validation
Run 2026-11-09 with grep over the docs:

| Check | Result |
|-------|--------|
| Every AC has ≥1 TC (AC-1…11) | pass |
| Every AC is implemented by ≥1 task | pass |
| Every automated TC appears in exactly one task with full Given/When/Then | pass |
| Manual TCs (TC-3, TC-5, TC-16) belong to /spec-verify, not to a task | by design |
| Names consistent (`is-checked`, `no-side`, `settings-close`, `.data-row`, `.data-divider`) | pass |
| No Proposed ADR; none needed | pass |
| Backlog items leaked into scope | none |
| Existing tests affected: Settings TC-21, Calendar `view-calendar` | handled in T-03/T-04 (classes kept) |
| Open questions / unchecked checklist items | none |

Findings: none open. Go.

## Order (walking skeleton)
1. **T-01 radio (spike)** — de-risks the one unverified claim (radio state in the real window).
2. T-02 ✕/Esc → T-03 data rows (Settings page complete)
3. T-04 side panel rule
4. T-05 → T-06 Search page

Milestone markers: after T-03 Settings done (AC-1…6); after T-04 AC-11; after T-06 AC-7…10. Then /spec-verify including a real-app launch (AC-2, TC-3/5/16).

Effort: ~1 session total; each task small.

Definition of Done: tests first; `pnpm test` + `pnpm exec tsc` green per task, full `pnpm check` before verify; docs updated; no secrets.

## Task status
- [x] T-01 painted radio (2026-11-09) — TC-1/TC-2 green, full `pnpm test` 194 green, `tsc` clean, headless screenshot shows a clear solid dot. Real-app check (TC-3) is left for /spec-verify.
- [x] T-02 ✕ and Esc (2026-11-09) — TC-4/6/7 green, full `pnpm test` 197 green, `tsc` clean; ✕ is 32px (size measurement TC-5 left for /spec-verify)
- [x] T-03 Your data rows (2026-11-09) — TC-8/9 green, old TC-21/TC-45 still green, full `pnpm test` 199 green, `tsc` clean; button labels unchanged
- [x] T-04 side panel only on Journal (2026-11-09) — TC-14/15 green, Calendar `view-calendar` tests unchanged and green, full `pnpm test` 201 green, `tsc` clean; the aside stays in the DOM and is hidden by CSS (`.no-side`). Visual check TC-16 left for /spec-verify
- [x] T-05 Search states (2026-11-09) — TC-10/11/12 green, full `pnpm test` 204 green, `tsc` clean. The submit button is labelled "Ask" (not "Search") so it does not clash with the nav's Search button
- [x] T-06 Search results (2026-11-09) — TC-13 green, full `pnpm test` 205 green, `tsc` and `vite build` clean. Answer card was already above the results; dates now long-form in local time
