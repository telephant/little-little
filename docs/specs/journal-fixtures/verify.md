# journal-fixtures — verify

Automated ACs: **AC-1..AC-10 all passing** (TC-1..TC-9 in every `pnpm check`; TC-10 live:
`OLLAMA_TEST=1 cargo test --lib live_probe_quality -- --ignored --nocapture` — ran 2026-11-05,
**7/7 probes hit top-5** against nomic-embed-text, bar was 5-of-6).

Remaining: **AC-11, the interactive pass** — yours to run.

## Before you start — wipe the DEV journal only

The backup restores only into an empty journal, so the dev journal must go first.

- Data dir: `~/Library/Application Support/com.telephant.little-little/`
- Delete **only** `journal.db`, `journal.db-shm`, `journal.db-wal`.
- **Do NOT touch `journal.my-real-one.db*`** — that is your real journal, parked.

```sh
cd ~/Library/"Application Support"/com.telephant.little-little
rm journal.db journal.db-shm journal.db-wal
```

Backup file to restore: `src-tauri/tests/fixtures/journal-backup.json` (57 entries,
2026-05-04 → 2026-11-03, moods ship null so the live pipeline classifies them).

## Manual checklist (AC-11)

Run `pnpm tauri dev`, then:

- [ ] **M-1** Onboard fresh (pick models), Settings → Restore backup → `journal-backup.json` → notice says **"57 entries restored"** and the entry list fills (newest open).
- [ ] **M-2** Status chips show indexing, then moods fill; calendar shows ~6 months with a believable color spread (work-stress dips, race-day highs).
- [ ] **M-3** Search three probes — "when did I decide to leave my job", "how did my first 10K race go", "my first pottery bowl out of the kiln" — instant results look right and the AI answer cites sensible dates.
- [ ] **M-4** Write a new work-themed entry (job, team, manager) → its reflection calls back to a work-arc entry by date.
- [ ] **M-5** Switch provider to Cloud → search "when was mum's surgery" → the two no_cloud entries are hidden and the hidden-count notice explains it; the distress entry (jf-028) never leaves the device.

When all five pass, say so and `/spec-verify journal-fixtures` closes the milestone
(status.yaml AC-11 → passing, gate `verify` → approved).

## Measurements

| What | Target | Observed |
|------|--------|----------|
| Embed 57 entries (live, dev machine) | — | **2.7 s** (TC-10 run, 2026-11-05) |
| Restore-to-ready (embed + moods, stopwatch to idle chips) | ~30 s [assumption] | _pending — record during M-2_ |
| Probe quality | ≥5/6 | **7/7** |
