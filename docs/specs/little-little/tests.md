# Tests — little-little (M1)

## Test data and fakes

- **Fixture journal** `src-tauri/tests/fixtures/entries.json`: ~12 hand-written entries over fake dates — an "interview anxiety → it went well" arc, a recurring gym topic, one distress-flavored entry, one `no_cloud` entry, one >1500-char entry (chunking edge). No real personal data exists yet (greenfield), so fixtures are hand-made.
- **FakeEmbeddingProvider** (Rust): deterministic vectors from token hashing — same text → same vector, shared words → nearby vectors. Lets retrieval tests assert ordering without Ollama.
- **FakeChatProvider** (Rust): canned reflection echoing the context entry ids it received — lets tests assert what context was actually sent (AC-10, AC-7).
- **Claude CLI fake**: a shell stub on PATH that records argv/env/cwd/stdin to a file and prints valid JSON — asserts the invocation contract without calling the real CLI.
- DBs in tests: temp-dir SQLCipher files (not in-memory; AC-2/AC-3 need the real file).
- Live-Ollama tests (`#[ignore]`-tagged) run only when `OLLAMA_TEST=1`: one embed + one chat smoke test.

## Test cases

| TC | AC | Level | Given / When / Then |
|----|----|-------|---------------------|
| TC-1 | AC-1 | integration | Given unlocked app with typed text pending debounce; When process restarts and DB reopened with passphrase; Then entry body equals typed text |
| TC-2 | AC-2 | integration | Given DB with one entry; When opened with stock SQLite (no key); Then open/read fails (NOTADB) |
| TC-3 | AC-3 | integration | Given existing DB; When unlock with wrong passphrase; Then error returned, no tables readable, retry possible |
| TC-4 | AC-4 | integration | Given embed worker stalled on a slow fake; When save_entry and list_entries called; Then both return without waiting on the worker |
| TC-5 | AC-5 | integration | Given models selected, fake embedder; When entry saved and worker runs; Then chunks rows + vec_chunks rows exist linked to entry, embed_status=ok |
| TC-6 | AC-5 | integration | Given entry stuck pending (crash simulation: status pending, no vectors); When app restarts (startup scan); Then worker re-embeds it to ok |
| TC-7 | AC-6 | integration | Given fixture journal embedded; When new interview-themed entry saved and panel requested; Then top-K related entries include the March interview entry, each with source entry id |
| TC-8 | AC-6 | integration | Given empty journal; When first entry saved and panel requested; Then panel state = "nothing to relate yet", no provider error |
| TC-9 | AC-7 | integration | Given fake chat provider; When reflection generated; Then response stored in ai_responses with non-empty context_entry_ids, and those ids were in the prompt context |
| TC-10 | AC-8 | integration | Given embedded entry; When body edited and worker runs; Then vec_chunks contains vectors only for new chunk ids; old chunk ids gone |
| TC-11 | AC-8 | integration | Given embedded entry with a reflection; When entry deleted; Then its chunks, vec_chunks rows and ai_responses rows are gone (no orphans) |
| TC-12 | AC-9 | component | Given settings open, provider=ollama; When switched to claude_cli (confirm accepted); Then indicator shows "Cloud" in shell layout; switch back shows "On-device" |
| TC-13 | AC-10 | integration | Given fixture journal with one no_cloud entry matching the new entry's topic; When provider=claude_cli and panel requested; Then retrieval results and the fake-CLI stdin contain no text from the flagged entry; same query with provider=ollama does include it |
| TC-14 | AC-11 | unit | Given ClaudeCli provider with entry text; When command is built and run against the CLI stub; Then stdin carries the text, argv/env carry none of it, argv has -p --output-format json and disallows all tools, cwd is an empty fresh temp dir, removed after |
| TC-15 | AC-11 | unit | Given CLI stub printing malformed JSON / exiting nonzero; When complete() called; Then ProviderError (no panic), panel can offer regenerate |
| TC-16 | AC-12 | component | Given displayed reflection; When regenerate clicked; Then new provider call made and body replaced; When dismiss clicked; Then panel closes, ai_responses.dismissed=1, entry unchanged |
| TC-17 | AC-13 | integration | Given no models selected and both providers unavailable; When entry written, saved, listed, reopened; Then all succeed; panel state = fallback message, zero provider calls attempted |
| TC-18 | AC-16 | integration | Given fresh journal, no models chosen; When entry saved; Then no embed/chat call occurs, panel invites selection; When models chosen; Then pending entries embed and reflection proceeds |
| TC-19 | AC-16 | integration | Given embedded journal with model A (dim 8 fake); When embed model changed to model B (dim 16 fake); Then vec table recreated at dim 16, all entries pending, worker re-embeds |
| TC-20 | AC-17 | component | Given provider=ollama, cloud never confirmed; When claude_cli selected; Then confirm dialog shown; on cancel provider stays ollama; on accept it switches and dialog never reappears |
| TC-21 | AC-14 | manual | Given a distress-flavored fixture entry; When reflection generated (live model); Then tone is caring, no cheerfulness, support-resources line present |
| TC-22 | AC-15 | manual | Given OS light then dark theme; When app opened in each; Then matching theme, readable contrast in editor, panel, settings |

### Manual checklist (run at /spec-verify)

- [ ] TC-21 distress reflection (run with both providers)
- [ ] TC-22 light/dark
- [ ] NFR privacy: with provider=ollama, `lsof -i` on the app process shows connections only to localhost:11434 during a full write→reflect cycle
- [ ] NFR feel: typing latency imperceptible while an embed is running

## Measurements (provisional targets — measure, don't assert)

| What | Provisional | How |
|------|-------------|-----|
| Chunk size | ~1000 chars, hard-split >1500 | log chunk counts/sizes over fixture journal |
| Related memories K | 3 entries | eyeball relevance on fixture journal, adjust |
| Similarity cutoff | none in M1 | record distances in TC-7, decide if a floor is needed |
| Autosave debounce | ~1s | feel test during manual pass |
| Embed latency / entry | — | timing log around worker with live Ollama |
| Reflection latency | — | timing log TC-21 runs, both providers |

---

# M2 test cases (added 2026-11-05)

Fixtures: same journal (12 entries) + FakeChatProvider extended to return canned mood JSON; a recorded NDJSON pull-stream fixture for the download tests.

| TC | AC | Level | Given / When / Then |
|----|----|-------|---------------------|
| TC-23 | AC-18 | integration | Given models selected and a clearly positive saved entry, fake chat returning `{"level":5,"label":"proud"}`; When the worker runs; Then entry has mood_level 5, label "proud", mood_source 'ai', mood_status ok |
| TC-24 | AC-19 | integration | Given an entry with AI mood; When user set_mood(level 2) and the entry is edited and reprocessed; Then level stays 2, source stays 'manual' |
| TC-25 | AC-20 | integration | Given entries with manual and AI moods across several days; When calendar_month queried; Then each day reports manual-first latest level and entry count |
| TC-26 | AC-20 | component | Given calendar data; When calendar opened; Then mooded days are colored, clicking a day lists its entries, prev/next month navigates |
| TC-27 | AC-21 | integration | Given fixture journal embedded; When search("anxious about work"); Then interview/work entries rank above gym/family; results carry date + snippet |
| TC-28 | AC-22 | integration | Given top search results and a fake chat provider; When search_answer runs; Then a 1–2 sentence answer with cited dates returns, and the prompt contained only those excerpts |
| TC-29 | AC-23 | integration | Given a no-cloud entry matching the query; When provider=cloud and search runs; Then flagged entry absent from results and from the answer prompt; on-device search includes it |
| TC-30 | AC-24 | integration | Given journal with entries, tags, moods; When export_markdown(dir); Then one .md per entry with date/tags/mood frontmatter and verbatim body |
| TC-31 | AC-25 | integration | Given export_json of a journal; When restore_json into a fresh journal; Then entries, tags, moods, no_cloud identical and embed_status pending; restore into non-empty journal refuses |
| TC-32 | AC-26 | component | Given fresh journal, no models; When onboarding completed by picking installed models; Then app lands in editor, AI invite gone, no settings visit needed |
| TC-33 | AC-27 | integration+component | Given a mocked /api/pull NDJSON stream; When pull_model runs; Then progress percentages update live until success and the model becomes selectable (real pull = manual M-3) |
| TC-34 | AC-28 | component | Given claude not on PATH; When onboarding/settings shows the cloud option; Then it is disabled with install/sign-in guidance |
| TC-35 | AC-29 | integration | Given pending embed/mood work and an active pull; When get_activity queried; Then counts and pull percentage reflect reality, zeroing when done |
| TC-36 | AC-29 | component | Given activity/settings states (probing, downloading 40%, indexing 3 of 12, ready); When settings renders; Then matching status chips show and the global indicator reflects busy/idle |
| TC-37 | AC-18/AC-10 | integration | Given provider=cloud (fake) and one flagged + one unflagged pending entry; When mood pass runs; Then unflagged classified via cloud fake, flagged via local fake (or unset if none) — flagged text never reaches the cloud fake (ADR-0004) |

### Manual checklist additions (M2)

- [ ] M-1 Mood quality eyeball: AI moods over the fixture arc look sane (live model)
- [ ] M-2 Calendar visual: colors readable in light + dark
- [ ] M-3 One real `ollama pull` of a small model through onboarding, progress sane
- [ ] M-4 Cloud-confirm dialog copy now mentions background mood classification

### Measurements additions

| What | Provisional | How |
|------|-------------|-----|
| Search K | 8 | eyeball result quality on fixture journal |
| Answer length | 1–2 sentences | inspect TC-28 outputs + live runs |
| Mood accuracy | — | M-1 manual eyeball, note misfires |
| Calendar render | <100ms @ 1k entries | timed test with generated entries (log only) |
