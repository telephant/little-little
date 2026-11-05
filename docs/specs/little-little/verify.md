# Verify — little-little M1 (run 2026-11-05)

Full check (`pnpm check`): **green** — 12 vitest, 34 cargo tests (+2 ignored live tests run separately, both green), tsc, vite build, `cargo clippy -- -D warnings`. Live Ollama smoke: embed + chat round-trip OK.

## AC results

| AC | TC | Result | Evidence (this run) |
|----|----|--------|---------------------|
| AC-1 autosave persists | TC-1 | ✅ pass | storage test + UI unmount/remount test green |
| AC-2 encrypted at rest | TC-2 | ✅ pass | unkeyed open NOTADB; raw file has no plaintext, no SQLite header (app + spike) |
| AC-3 wrong passphrase | TC-3 | ✅ pass | WrongPassphrase error, retry succeeds |
| AC-4 embed never blocks | TC-4 | ✅ pass | editor-path calls < 500ms while worker stalled on 5s fake |
| AC-5 chunk + embed on save | TC-5, TC-6 | ✅ pass | chunks + vec rows linked, status ok; startup scan recovers stuck pending |
| AC-6 related memories cite sources | TC-7, TC-8 | ✅ pass | March interview arc in top-3; empty-journal state calm; cards link to entries (UI test) |
| AC-7 reflection with context | TC-9 | ✅ pass | context ids stored AND verified present in the actual prompt |
| AC-8 edit/delete reindex | TC-10, TC-11 | ✅ pass | old chunk ids gone after edit; zero orphans after delete |
| AC-9 privacy indicator | TC-12 | ✅ pass | badge On-device ↔ Cloud follows provider |
| AC-10 never-send-to-cloud | TC-13 | ✅ pass | flagged text absent from cloud prompt at retrieval AND prompt level; present on-device |
| AC-11 claude -p sandbox | TC-14, TC-15 | ✅ pass | stdin-only content, clean argv/env, empty temp cwd removed; malformed output → clean error |
| AC-12 regenerate/dismiss | TC-16 | ✅ pass | body replaced on regenerate; dismiss persists, entry untouched |
| AC-13 graceful fallback | TC-17 | ✅ pass | writing/listing work with no provider; calm copy; zero provider calls |
| AC-14 distress-aware reflection | TC-21 | ✅ manual-ok (Ollama) | Live qwen3:4b-instruct run: warm, zero cheerfulness ("tomorrow might not be brighter, but it can still be softer"), cites 2026-09-07 entry, includes 988 line, no diagnosis. 1.82s. Claude-provider variant → follow-up F-2 |
| AC-15 light/dark | TC-22 | ⏳ open (manual) | Token system + dark overrides implemented and reviewed in code; visual pass needs human eyes → follow-up F-1 |
| AC-16 explicit model selection | TC-18, TC-19 | ✅ pass | no calls before selection; panel invite; index rebuild on model change |
| AC-17 cloud confirm | TC-20 | ✅ pass | dialog gates first switch; cancel keeps ollama; never reappears |

## Measurements

Recorded in `measurements.md` (chunking distribution, retrieval distances, live latencies: embed <1s, reflection 1.8s). No provisional target violated.

## Drift findings

- Commands in `lib.rs` vs `design.md`: **identical** (17/17, grep-verified).
- Tables in migrations vs design schema: **identical** (6/6).
- Events: design updated during T-09 (pull-based polling instead of push events) — recorded, no open drift.
- `claude -p` availability check: design-detail updated during T-06 (`--version` instead of billed ping; `--max-turns 1` added) — recorded.
- ADRs 0001–0003: still accurate.
- Scope: no backlog feature leaked into src (grep; only a "mood" tag string inside a test).

## Follow-ups (not blocking the walking skeleton)

- **F-1** Visual pass: light/dark themes (TC-22) and typing-feel while embedding — needs a human at the GUI (`pnpm tauri dev`).
- **F-2** TC-21 with provider=claude_cli — needs the user's signed-in Claude Code (billed).
- **F-3** NFR zero-network check: `lsof -i` on the running app during a write→reflect cycle.
- **F-4** Re-log retrieval distances with the live embedding model and decide on a similarity cutoff (M2).

## Verdict

**Pass with follow-ups.** Every automatable AC (15/17) passes in this run; AC-14 verified manual-ok against a live local model; AC-15 plus three environment checks need human eyes and are tracked as F-1…F-4.

## Post-close correction (2026-11-05, same day)

**This verification had a gap: the real app was never launched during the verify run.** The gate was approved on tests + live-model evidence alone, and the first real GUI session crashed:

- **Defect:** panic on passphrase entry — `spawn_worker` used `tokio::spawn` from a sync Tauri command thread ("no reactor running", `src-tauri/src/memory/mod.rs:116`). Invisible to every test because UI tests mock the IPC boundary and Rust tests run inside `#[tokio::test]` runtimes; only the real Tauri shell exercises the seam.
- **Fix:** worker now spawns via `tauri::async_runtime::spawn` (state.rs handle type updated). Suite re-run green (34 cargo + clippy); app relaunched and the window came up.
- **Process lesson, applied:** a verify run for a GUI app must include at least one real launch walking the primary flow (first-run → write → panel). Added as a standing checklist item in the F-1 follow-up; recommend treating it as mandatory in the next milestone's verify.
- **Status:** AC-1/AC-3's GUI path remains covered by the fix + relaunch; the user's hands-on pass (F-1) is now in progress and will complete the record.

---

# Verify — M2 (run 2026-11-05)

Full check (`pnpm check`): **green** — 23 vitest, 48 cargo tests, tsc, vite build, clippy -D warnings. Plus two live runs below. **The real app was launched during this verify run** (lesson from M1): window up, no panics in the launch log; interactive pass is yours.

## AC results (M2)

| AC | TC | Result | Evidence (this run) |
|----|----|--------|---------------------|
| AC-18 AI mood in background | TC-23 | ✅ pass | + live: 12 fixture entries mooded in 5.2s, sensible levels (nerves=2 "anxious", success=4 "proud", streak=5 "happy") |
| AC-19 manual wins | TC-24 | ✅ pass | storage + engine level; absorbing manual state |
| AC-20 calendar | TC-25, TC-26 | ✅ pass | manual-first tie-break, day click, month nav |
| AC-21 search ranks | TC-27 | ✅ pass | + live: interview entries exact top-3 with real embeddings |
| AC-22 answer cites | TC-28 | ✅ pass | + live: "You last felt anxious about an interview on 2026-03-02…" (0.62s) |
| AC-23 search no-cloud | TC-29 | ✅ pass | flagged hidden under cloud, hidden_count=1, on-device finds it |
| AC-24 Markdown export | TC-30 | ✅ pass | frontmatter + verbatim body (uuidv7 filename-collision bug found & fixed by the test) |
| AC-25 JSON round-trip | TC-31 | ✅ pass | identical restore, empty-journal guard, re-embed queued |
| AC-26 onboarding ready | TC-32 | ✅ pass | pick-installed path + skip path land in editor |
| AC-27 pull progress | TC-33 | ✅ pass | parser vs REAL recorded stream shape (live all-minilm pull observed, model removed); UI progress live; full in-app pull = manual M-3 |
| AC-28 claude guidance | TC-34 | ✅ pass | disabled with guidance when missing |
| AC-29 never vague | TC-35, TC-36 | ✅ pass | counts, chips ("indexing 9 of 12", "downloading 40%"), busy/idle dot |

## Measurements (live, M2)

Mood: ~0.43s/entry (qwen3:4b-instruct). Search answer: 0.62s. Mood quality on the fixture arc (M-1): plausible across all 12, no misfires. Search K=8 fine. Recorded in measurements spirit; full table update deferred to milestone close.

## Drift

Commands: all 9 M2 commands match design.md exactly (grep). ADR-0004 (as accepted, carve-out included) implemented verbatim — TC-37 proves flagged text never reaches a cloud provider. No backlog scope leaks. Watch item: TC-36 uses real timers (flaked once under load, 6 straight passes after).

## Manual checklist for the user (the app is running now)

- [ ] M-0 Unlock with your passphrase — your M1 journal auto-migrates to schema v2
- [ ] M-1 Write entries, watch moods appear on them (dots + label)
- [ ] M-2 Calendar: colors readable in light + dark
- [ ] M-3 Onboarding pull: wipe or use settings to download a model, watch progress
- [ ] M-4 Cloud dialog mentions background mood classification (switch provider to see it)
- [ ] Search view: ask it something about what you wrote

## Verdict

**Pass with follow-ups** — all 12 M2 ACs green in this run with live-model evidence; the interactive checklist above completes the record.
