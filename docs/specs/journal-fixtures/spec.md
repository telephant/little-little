# journal-fixtures — curated test journal dataset

## 0. Review guide

**Summary:** One hand-curated, checked-in dataset of ~60 realistic journal entries over 6 months, from which two outputs are generated and provably kept in sync: a Little Little backup JSON (restored into an empty dev journal through Settings for interactive testing) and a cargo test fixture (for automated memory/search/mood tests). Content is engineered for testability: recurring story arcs for reflections, known-answer search probes, privacy-flagged and distress entries, edge cases.

Review order: §4 scope → §6 ACs → assumptions.

**Decisions**

| ID | Decision | Status |
|----|----------|--------|
| D-1 | Delivery: one source dataset, generator emits backup JSON + cargo fixture, sync asserted by a test | Decided: one source, both outputs (2026-11-05) |
| D-2 | Size: ~60 entries across ~6 months (3–4/week with believable gaps) | Decided (2026-11-05) |
| D-3 | Coverage: story arcs + ≥5 no_cloud entries + 1 distress entry + edge cases | Decided: all four (2026-11-05) |

Open risks: none blocking; search-probe assertions depend on embedding-model behavior, so live probes are tolerance-based (top-K membership, not exact rank).
Prerequisites the user owns: none (dev machine already has Ollama + models).

## 1. Problem

Testing M2 features (mood calendar, semantic search, reflections) against a near-empty or ad-hoc dev journal proves nothing: reflections have nothing to call back to, the calendar is sparse, and search quality can't be judged without knowing what the right answer is. We need a realistic, fixed dataset whose contents are known well enough that "did it work?" has an objective answer.

## 2. Goals

- G-1 A restore-ready journal that makes every M2 feature demonstrable in the real app — measured by AC-11's manual pass.
- G-2 Known-answer testing: for a set of probe queries, the expected entries are defined up front — measured by AC-10.
- G-3 Single source of truth: the backup file and cargo fixture can never drift — measured by AC-4.

## 3. Data / reality

- **[verified]** Restore format is `ExportFile` v1: `{version, exported_at, entries:[{id, body, created_at, updated_at, no_cloud, tags, mood_level, mood_label, mood_source}]}` (`src-tauri/src/export.rs`); restore is transactional and only into an empty journal; restored entries are re-embedded and mood-classified by the worker.
- **[verified]** Existing cargo fixture `src-tauri/tests/fixtures/entries.json`: 12 entries 2026-03..2026-11, loaded by `load_fixtures()`; existing tests assert against its specific content (e.g. the interview arc).
- **[verified]** Entry fields the app uses: body, created_at, tags, no_cloud; moods are produced by the worker.

## 4. Scope — walking skeleton (M1)

Thinnest end-to-end slice: curated dataset source file → generator → (a) backup JSON restorable in the app, (b) new cargo fixture file — with validation tests proving content rules and sync.

**In:** dataset source (one config file); ~60 entries / 6 months ending near today; 4+ story arcs; ≥5 no_cloud; 1 distress entry; edge cases; moods left null (live pipeline classifies); generator + validation tests; search-probe definitions with expected entry ids; a live (ignored) probe test; manual restore pass.
**Out:** touching the existing 12-entry `entries.json` or the tests that depend on it; randomized/parameterized generation; non-English full entries (snippets only); mood pre-labeling; any app code changes.

## 5. Users and key flows

User: the developer (and CI). Flows: (1) wipe dev journal → Settings → Restore backup → pick generated JSON → watch indexing/moods fill → exercise calendar/search/reflections; (2) cargo tests load the new fixture for storage/engine assertions; (3) live `OLLAMA_TEST=1` probe test scores search quality.

## 6. Acceptance criteria

```
AC-1  Source validates
  Given the dataset source file
  When  the validation test parses it
  Then  it has 55–65 entries, created_at spanning ≥170 days with no entry in the future,
        every id unique, every non-edge-case body 80–1200 chars
  Verify: auto

AC-2  Backup output conforms
  Given the generated backup JSON
  When  deserialized as ExportFile
  Then  version=1 and every entry's fields are present with moods null
  Verify: auto

AC-3  Backup restores
  Given an empty journal
  When  the generated backup is restored via the restore function
  Then  all entries exist with their dates, tags and no_cloud flags intact
  Verify: auto

AC-4  Outputs in sync
  Given the checked-in backup JSON and cargo fixture
  When  the sync test regenerates both from the source
  Then  the checked-in files are byte-identical to the regenerated ones
  Verify: auto

AC-5  Story arcs
  Given the dataset
  When  arcs are counted by their designated tag
  Then  ≥4 arcs each have ≥5 entries spread over ≥6 weeks
  Verify: auto

AC-6  Privacy coverage
  Given the dataset
  Then  ≥5 entries have no_cloud=true, at least one inside a story arc
  Verify: auto

AC-7  Distress entry present
  Given the dataset
  Then  exactly one entry is designated distress, it is no_cloud=true
  Verify: auto

AC-8  Edge cases present
  Given the dataset
  Then  it contains ≥1 body <40 chars, ≥1 body >2000 chars, ≥1 with emoji,
        ≥1 with a non-English snippet, and ≥2 entries on the same day
  Verify: auto

AC-9  Moods ship null
  Given both outputs
  Then  every mood_level/mood_label/mood_source is null
  Verify: auto

AC-10 Search probes defined and plausible
  Given ≥6 probe queries, each with expected entry ids from the dataset
  When  the live probe test embeds and searches (OLLAMA_TEST=1, ignored by default)
  Then  for ≥5 of 6 probes an expected id is in the top 5 results
  Verify: auto (live/ignored)

AC-11 Interactive pass
  Given a wiped dev journal and the running app
  When  the backup is restored and the worker finishes
  Then  the calendar shows ~6 months of moods, search answers cite sensible dates,
        and a reflection on a new arc-related entry calls back to an arc entry
  Verify: manual
```

## 7. Non-functional requirements

- Dataset content is original prose (no copied text), believable, varied in length and tone; names/places fictional.
- Deterministic generation: same source → identical outputs (stable ordering, no timestamps injected at generation time other than a fixed `exported_at`).

## 8. Assumptions

- Moods ship null so restore exercises the live classification pipeline (recommended and accepted in Q&A).
- Content is hand-curated by Claude in-session, not LLM-generated at build time — deterministic and reviewable.
- The existing `entries.json` and its tests stay untouched; the new fixture is a separate file (name decided in design).
- Source "config file" format (JSON vs YAML) and generator mechanics (Rust test vs script) are design-stage decisions.
- 2026-11-05 is "today"; the dataset ends within the week before it.

## Glossary

- **Story arc**: a recurring life thread (e.g. job search) spread across many entries, tagged consistently, so retrieval and reflections have real material.
- **Probe query**: a natural-language search with pre-agreed expected entries, used to score retrieval quality.
- **no_cloud**: the per-entry privacy flag; flagged text never reaches a cloud provider.
- **Distress entry**: an entry expressing serious hopelessness, used to verify the persona's care response (988 resource line).
- **ExportFile v1**: Little Little's backup JSON schema.
