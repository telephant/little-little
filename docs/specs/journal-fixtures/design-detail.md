# journal-fixtures — design detail

Reference only; not required reading for design approval.

## Source schema `jf-1` (journal-dataset.json)

```json
{
  "schema": "jf-1",
  "exported_at": "2026-11-05T00:00:00Z",
  "arcs": {
    "work": "stuck at current job -> applications -> interviews -> offer -> first weeks",
    "running": "couch -> first 10K",
    "family": "mother's health scare -> surgery -> recovery",
    "pottery": "beginner class -> first glazed bowl"
  },
  "probes": [
    { "id": "P-1", "query": "when did I decide to leave my job",
      "expect": ["jf-012", "jf-015"], "note": "work arc turning point" }
  ],
  "entries": [
    { "id": "jf-001", "created_at": "2026-05-04T20:15:00Z",
      "tags": ["work"], "no_cloud": false,
      "arc": "work", "edge": null, "distress": false,
      "body": "..." }
  ]
}
```

- `id`: `jf-NNN`, zero-padded, unique; stable forever once published.
- `arc`: arc key or null (misc). `edge`: null | "short" | "long" | "emoji" | "lang" | "sameday". `distress`: exactly one true.
- `tags`: what the app will see; arc entries carry their arc tag. `updated_at` is derived (= created_at).

## Output derivation

- **journal-backup.json** (`ExportFile` v1): `version:1`, `exported_at` from source, entries mapped to `ExportEntry` with `updated_at = created_at`, `mood_* = null`, sorted by (created_at, id), serde_json `to_string_pretty` + trailing newline.
- **journal60.json**: array of `{id, created_at, tags, no_cloud, body}` (the existing `Fixture` shape), same ordering/serializer.
- Test-only fields (`arc`, `edge`, `distress`, `probes`, `arcs`) appear in neither output.

## Generator / test module layout (src-tauri/src/testdata.rs, #[cfg(test)] except nothing — module itself test-only via #[cfg(test)] mod in lib.rs)

- `parse_source() -> Dataset` (serde structs mirroring jf-1)
- `render_backup(&Dataset) -> String`, `render_fixture(&Dataset) -> String`
- `#[test] validate_source` → AC-1, AC-5..AC-9 rules:
  - 55 ≤ n ≤ 65; span ≥ 170 days; max(created_at) ≤ 2026-11-05; ids unique
  - non-edge bodies 80–1200 chars; edge rules: short <40, long >2000, emoji contains non-ASCII emoji, lang contains CJK, ≥2 sameday pairs
  - ≥4 arcs with ≥5 entries each spanning ≥42 days; ≥5 no_cloud with ≥1 in an arc; exactly 1 distress and it is no_cloud
  - all probe expect-ids exist; ≥6 probes
- `#[test] outputs_in_sync` → regenerated strings == checked-in files (AC-4)
- `#[test] backup_restores_round_trip` → write temp file, `restore_json` into temp Storage, compare per-entry fields, moods null → mood_status pending (AC-2, AC-3, AC-9)
- `#[ignore] #[test] live_probe_quality` (OLLAMA_TEST=1) → load fixture entries, embed, `search::ranked` per probe, expected∩top5 ≠ ∅ for ≥5 of 6 (AC-10)
- `#[ignore] #[test] regen_fixtures` → writes both output files to disk (the only writer)

## Failure table (full)

| Failure | Cause | Effect | Response |
|---------|-------|--------|----------|
| sync test red | generated file edited by hand, or source edited without regen | CI red | run regen test |
| restore refuses | non-empty journal | user error during manual pass | wipe dev journal first (documented in verify.md) |
| probe test red | embedding model changed / probe too vague | live check fails | retune probe or expected set; bar 5/6 |
| schema v2 | app export format evolves | round-trip test fails to compile/parse | update generator + regen |
| unicode length rules | char vs byte counts | false validation failures | all length rules use char counts |

## Security / privacy

Dataset is fictional prose authored in-session; no real names, places tied to the user, or copied text. The distress entry is fiction crafted to trigger the persona's care path, marked no_cloud so it also exercises the carve-out.
