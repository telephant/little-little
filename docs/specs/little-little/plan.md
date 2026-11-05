# Plan — little-little (M1)

## Plan validation (run 2026-11-05 — all via grep, not by eye)

| Check | Result |
|-------|--------|
| AC → test coverage | PASS — every AC-1…17 has ≥1 TC; no orphan TCs |
| AC → design coverage | PASS — design.md AC table covers all 17 |
| AC → task coverage | PASS — every AC named by ≥1 task; every TC-1…22 copied into ≥1 task file |
| Proposed-ADR leakage | PASS — all three ADRs Accepted 2026-11-05; no doc cites a Proposed one |
| Cross-doc names | PASS — commands, settings keys, panel states, table names match design-detail |
| Invented numbers | PASS — chunk size, K, debounce, timeouts all marked provisional in tests.md Measurements |
| Backlog scope leak | PASS — two grep hits were false positives ("exported" fakes in T-06; "tone presets" in T-08 Out-of-scope) |
| Open questions | none — design checklist fully resolved at /spec-design review |

Verdict: **GO** — gates.plan approved. Known accepted risk: sqlite-vec is pre-1.0; T-01 spike runs first to prove the SQLCipher+vec build before any app code.

## Task order (walking skeleton)

Spike first: T-01 proves the one unverified load-bearing claim — that `bundled-sqlcipher-vendored-openssl` + the sqlite-vec crate compile and work together on macOS. Everything sits on that DB; if it fails, ADR-0001/0002 reopen before any app code exists.

| # | Task | Implements | Phase |
|---|------|-----------|-------|
| T-01 ✅ 2026-11-05 | Spike: SQLCipher + sqlite-vec proof | AC-2 (mechanics) | A |
| T-02 ✅ 2026-11-05 | Scaffold Tauri app + check commands | AC-15 (base) | A |
| T-03 ✅ 2026-11-05 | Storage layer: schema, unlock, entries CRUD | AC-1, AC-2, AC-3 | A |
| T-04 ✅ 2026-11-05 | Shell + editor UI: unlock, list, autosave, tags | AC-1 | A |
| T-05 ✅ 2026-11-05 | Settings: model & provider selection, indicator, cloud confirm | AC-9, AC-16 (gate), AC-17 | B |
| T-06 ✅ 2026-11-05 | Providers: OllamaEmbed, OllamaChat, ClaudeCli | AC-11, AC-13 (detect) | B |
| T-07 ✅ 2026-11-05 | Memory engine: chunker, embed worker, retrieval | AC-4, AC-5, AC-8, AC-16 (behavior) | C |
| T-08 ✅ 2026-11-05 | Prompt layer + reflection pipeline | AC-7, AC-10, AC-14 (prompt) | C |
| T-09 ✅ 2026-11-05 | AI panel UI: memories, reflection, regenerate/dismiss, fallbacks | AC-6, AC-7, AC-12, AC-13 | C |
| T-10 ✅ 2026-11-05 | Hardening + manual pass prep | AC-14, AC-15, NFR checks | D |

All tasks done 2026-11-05. Full check green: 12 vitest + 34 cargo tests (+1 live-Ollama smoke), tsc, vite build, clippy -D warnings. Measurements recorded in measurements.md. Manual ACs (14, 15) and NFR checks remain for /spec-verify.

---

# M2 plan (added 2026-11-05)

## Plan validation (M2 — run 2026-11-05, grep-based)

| Check | Result |
|-------|--------|
| AC-18…29 → test coverage | PASS — every M2 AC has ≥1 TC (TC-23…37); no orphan TCs |
| AC → design coverage | PASS — design.md AC table maps 18–29 to C-9…C-14 / F-7…F-11 |
| AC → task coverage | PASS — every M2 AC named by ≥1 task T-11…T-18; every TC copied into a task |
| ADR status | PASS — ADR-0004 Accepted (user decision recorded); no doc cites a Proposed ADR |
| Scope | PASS — app lock, quick entry, merge-restore, mood trends stay out (backlog) |
| Open questions | none — design checklist fully resolved |

Verdict: **GO**. Known risk, contained: Tauri `ipc::Channel` + /api/pull NDJSON are [memory] — T-17 starts with that spike before any onboarding UI builds on it.

## Task order (M2)

| # | Task | Implements | Phase |
|---|------|-----------|-------|
| T-11 ✅ 2026-11-05 | Migration v2 + mood storage + set_mood | AC-19 (storage) | E |
| T-12 ✅ 2026-11-05 | Mood engine in worker (provider rule, carve-out) | AC-18, AC-19, TC-37 | E |
| T-13 ✅ 2026-11-05 | Calendar: backend query + view | AC-20 | F |
| T-14 ✅ 2026-11-05 | Search backend: ranked + answer + filter | AC-21, AC-22, AC-23 | F |
| T-15 ✅ 2026-11-05 | Search UI: instant results, async answer, hidden-count note | AC-21/22 (UI) | F |
| T-16 ✅ 2026-11-05 | Export Markdown/JSON + restore | AC-24, AC-25 | G |
| T-17 ✅ 2026-11-05 | Pull manager (spike channel+NDJSON first) + get_activity | AC-27, AC-29 (backend) | H |
| T-18 ✅ 2026-11-05 | Onboarding flow + status chips + dialog copy | AC-26, AC-28, AC-29 (UI) | H |
| T-19 ✅ 2026-11-05 | Verify-pass fix: "Reflection model" copy replaces "chat" in Settings/Onboarding/chips (V2-1, TC-38..40) | AC-29 (clarity) | H |
| T-20 ✅ 2026-11-05 | Verify-pass fix: plain words ("Memory model", no dimension jargon) + provider cascade hides reflection picker under Cloud (V2-2, TC-41..43) | AC-29 (clarity) | H |

M2 tasks all done 2026-11-05. Full check green: 23 vitest + 48 cargo tests, tsc, vite build, clippy. Watch item: TC-36 polls real timers (2s interval, 5–6s waitFor) — flaked once under load, then passed 6 straight full runs.

Milestones: **E done** → every entry quietly gets a mood, manual wins. **F done** → calendar + search live. **G done** → data leaves and returns intact. **H done** → fresh machine reaches "ready" guided, nothing vague.

Rough effort: E ≈ 1–2 days, F ≈ 2–3 days, G ≈ 1 day, H ≈ 2–3 days.

Definition of Done: unchanged from M1 (tests first, `pnpm check` green, docs/status updated, no secrets).

Milestones: **A done** → encrypted journal you can write in (AC-1/2/3 green). **B done** → providers selectable and sandbox-proven (AC-9/11/17). **C done** → full loop: save → embed → related memories + reflection (AC-4–8, 10, 12, 13, 16). **D done** → manual ACs checked, ready for /spec-verify.

Rough effort: A ≈ 2–3 days (includes Rust/Tauri setup), B ≈ 2 days, C ≈ 3–4 days, D ≈ 1 day.

## Definition of Done (every task)

1. Tests named in the task written first and turned green.
2. Project check green: `cd src-tauri && cargo test && cargo clippy -- -D warnings` and `pnpm test && pnpm build`.
3. Docs/ADRs updated if the task changed a contract; `status.yaml` ACs flipped.
4. No secrets, no telemetry, no network calls outside localhost/claude subprocess.

Out of this milestone: everything in `backlog.md` (calendar, mood, search, summaries, alerts, personas, export, app lock, tray, signing).
