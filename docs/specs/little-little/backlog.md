# Backlog — Little Little

One-liners for later milestones. M1 (walking skeleton) lives in spec.md.

## M1.1 — Verification follow-ups (from verify.md, accepted 2026-11-05)

- M1.1 F-1 Visual pass: light/dark themes + typing feel while embedding (`pnpm tauri dev`) — P1
- M1.1 F-2 TC-21 distress reflection with provider=claude_cli (needs signed-in Claude Code) — P1
- M1.1 F-3 NFR zero-network check: `lsof -i` during a write→reflect cycle — P2
- M1.1 F-4 Re-log retrieval distances with the live embedding model; decide similarity cutoff — P2

## M2 — Make it a real daily app (IN PROGRESS — promoted to spec.md 2026-11-05)

Promoted: onboarding & model setup, calendar + mood, semantic search, export/backup, settings-UX clarity. Not promoted (moved to M3):

- M3 App lock: passphrase re-lock + system biometrics — why: completes the on-device privacy story — P2
- M3 Quick entry via global shortcut and tray icon — why: "open, write, done" friction cut — P2

## M3 — Care over time

- M3 Writing reminders at a user-chosen time — why: habit formation — P1
- M3 Contextual alerts: new entry surfaces matching past ones, with links and threshold/frequency controls — why: core "it remembers" moment — P1
- M3 Tone presets (Warm friend / Calm coach / Concise) via persona-prompt layer — why: decouples voice from logic — P2
- M3 Mood timeline: weekly/monthly trends — why: builds on M2 mood data — P2
- M3 Writing prompts ("What made you smile today?") — why: blank-page help — P3
- M3 Filter model dropdowns by kind (embedding vs generation) so a wrong pick is impossible — why: V2-2 verify pass found both dropdowns list every installed Ollama model — P2

## M4 — Deeper memory

- M4 Weekly and monthly AI summaries — why: progress reflection at a higher level — P1
- M4 "On this day" resurfacing — why: cheap delight from existing data — P2
- M4 Follow-up reminders on open topics (events, worries, goals) — why: flagship care feature, needs mature retrieval — P2
- M4 Recurring-pattern alerts for repeated themes/moods — why: long-horizon insight — P2
- M4 Custom user-written tones — why: extends M3 presets — P3
- M4 Photo attachments — why: richer entries; storage/encryption questions — P3

## M5 — Distribution & beyond

- M5 Code-signed builds for macOS and Windows — why: required for public release — P1
- M5 Bundled llama.cpp provider option — why: zero external dependency for end users — P2
- M5 Public open-source repo hygiene (license, docs, verifiable privacy) — why: PRD's trust promise — P2
- M5 Sync between devices — why: PRD "Later"; hard with E2E encryption — P3
- M5 Mobile companion app — why: PRD "Later" — P3
