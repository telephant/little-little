# settings-search-polish — verify (2026-11-09)

**Verdict: pass with follow-ups.** Everything automatable passes in this run. Two manual checks need the user in the real window (they require the journal passphrase, which I do not have).

## Runs (this session)
- `pnpm test`: 13 files, 205 tests passed. `tsc` clean. `vite build` OK.
- `cargo test`: 72 passed, 6 ignored (live-model tests). `cargo clippy -- -D warnings`: clean. No Rust file changed. (First `pnpm check` run could not reach the Rust half because `cargo` was not on that shell's PATH; re-run with `~/.cargo/bin` on PATH.)

## Results
| AC | TC | Result | Evidence |
|----|----|--------|----------|
| AC-1 | TC-1, TC-2 | pass | Settings.test.tsx; headless render shows a solid cobalt dot (scratchpad t01.png) |
| AC-2 | TC-3 | manual-ok | user confirmed in the real app, 2026-11-09 (dot no longer uses `:checked::after` or the SVG filter) |
| AC-3 | TC-4, TC-5 | pass | test + measured ✕ = 32×32 px (headless `settingsClose` rect); hover rule in CSS |
| AC-4 | TC-6, TC-7 | pass | Esc closes; ignored while the cloud dialog is open |
| AC-5 | TC-8 | pass | three `.data-row`s with title, description, one button |
| AC-6 | TC-9 | pass | Restore after `.data-divider`, text says "only works into an empty journal" |
| AC-7 | TC-10 | pass | intro + 3 examples; click runs the search |
| AC-8 | TC-11 | pass | Ask button disabled while empty; Enter/click submit |
| AC-9 | TC-12 | pass | `searching…` and no-match hint |
| AC-10 | TC-13 | pass | long local date, snippet, answer card before results |
| AC-11 | TC-14, TC-15, TC-16 | pass (DOM) / **visual in real window: journal seen by the user, other screens still open** | headless metrics at 900×600: side panel hidden on settings and search, shown on journal |

## Measurements (provisional)
| What | Result |
|------|--------|
| Window scroll at 900×600, settings | none (`scrollH` 600 = viewport); the pane itself scrolls inside, as before |
| Window scroll at 900×600, search | none |
| ✕ size | 32×32 px |

## Real-app launch
A `pnpm tauri dev` instance was already running (process 32451, vite on port 1420), so a second launch failed with "Port 1420 is already in use"; I left your instance alone. It serves the current source, so the changes should already be live in that window after a reload. I could not drive it: the journal is locked behind your passphrase and I will not create a second journal on your data.

## Drift and scope
- Spec/design/tests/tasks updated for the "Ask" button label (not "Search", which the nav already uses) and for hiding the column on the lock gate and onboarding.
- Scope: no Rust, IPC or schema change; nothing from `backlog.md` implemented.
- Dev-only: `shot.html` gained a `view=settings` option and two extra metrics (`settingsClose`, `sidePanelShown`).
- Not yet seen rendered: search results with real data (the screenshot stub returns none); covered by TC-13 only.

## Your hands-on pass (manual checklist)
- [x] Settings: click each provider radio; the dot moves (AC-2) — confirmed by the user 2026-11-09
- [ ] Settings: ✕ and Esc close it; "Your data" rows read clearly, Restore sits apart
- [ ] Search: examples, Ask button, a real question with results and an answer card
- [ ] No memories column on Search, Settings, Calendar, lock screen, onboarding; present on Journal (AC-11)

## Update 2026-11-09
The user confirmed the radio (AC-2) and the memories column on the Journal in the real app. Still to eyeball: no memories column on Search, Settings, Calendar, the lock screen and onboarding.
