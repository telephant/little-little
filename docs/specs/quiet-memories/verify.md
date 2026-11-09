# quiet-memories — verify (2026-11-09)

**Verdict: pass with follow-ups.** Everything automatable passes in this run. One manual check (TC-12) needs you in the real window: it needs the Rust side restarted and your journal passphrase.

## Runs (this session)
- `pnpm check` (exit 0): 15 test files, 215 tests passed; `tsc` clean; `vite build` OK; `cargo test` 75 passed, 6 ignored (live-model tests); `cargo clippy -- -D warnings` clean.
- Timing-sensitive tests: `QuietReflection.test.tsx` looped 5× with no failure.

## Results
| AC | TC | Result | Evidence |
|----|----|--------|----------|
| AC-1 | TC-1 | pass | QR-5: saved, `getAiPanel` not called |
| AC-2 | TC-2 | pass (auto) / manual open | QR-1, QR-5 (asks once, `generate = true`); real wait is TC-12 |
| AC-3 | TC-3 | pass | QR-2 |
| AC-4 | TC-4 | pass | QR-3 (incl. unspaced Chinese counted by characters), QR-6 |
| AC-5 | TC-5 | pass (auto) / manual open | Rust `lookup_without_generate_never_calls_the_model`, QR-7 |
| AC-6 | TC-6 | pass | Rust `lookup_without_generate_shows_a_stored_reflection` |
| AC-7 | TC-7 | pass (auto) / manual open | QR-7 |
| AC-8 | TC-8 | pass | MS-1; Rust `ready_panel_groups_neighbours_earlier_and_later`; headless render (scratchpad `mem.png`) shows Earlier / Later groups |
| AC-9 | TC-9 | pass | MS-2 |
| AC-10 | TC-10 | pass | Rust `ready_panel_groups_*` (≤3 per side, nearest in time first) |
| AC-12 | TC-13 | pass | QR-8: unlocking loads the latest page's panel (bug found by the user: the right side was empty on arrival) |
| AC-11 | TC-11 | pass | Rust `tc7_related_memories_cite_sources`, `tc9_reflection_context_is_honest` |

## Measurements (provisional, not pass/fail)
Not measurable without real use: the 30 s wait, the 200-character minimum and the pool of 12 / 3 per side are guesses. Listed in `tests.md` for you to judge.

## Drift and scope
- Names in code match `design.md` / `design-detail.md` (`useReflectIdle`, `reflectTiming`, `generate`, `not_requested`, `earlier`, `later`, `NEIGHBOUR_POOL`, `NEIGHBOURS_PER_SIDE`). No drift found.
- Scope: nothing from `backlog.md` implemented; no schema or dependency change.
- Dev-only helper changes alongside: `shot-stub.js` returns earlier/later memories, `shot.html` and `scripts/shot-metrics.sh` gained a `memories` option.
- Not committed yet.

## Real-app check (not done by me)
Your running `pnpm tauri dev` serves the new frontend, but the `get_ai_panel(entry_id, generate)` change is Rust, so that instance must be restarted first. I cannot drive it (journal locked behind your passphrase).

## Your hands-on pass (TC-12)
- [ ] Restart `pnpm tauri dev`
- [ ] New page, ~40 words, stop: nothing for ~30 s, then memories and a reflection
- [ ] Keep typing past the wait: nothing arrives mid-thought
- [ ] Open an older page: stored reflection or a quiet "Look back"; the activity dot stays idle
- [ ] "N memories" shows Earlier and Later
