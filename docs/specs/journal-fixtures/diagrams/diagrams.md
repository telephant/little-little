# journal-fixtures — design diagrams

## Product flow

```
1  --> developer wipes the dev journal (fresh passphrase)
2  --> onboarding: pick memory + reflection models
3  --> Settings -> Restore backup... -> journal-backup.json
4  --> "60 entries restored — re-indexing in the background"
5  --> chips: indexing n of 60, then moods fill the calendar
6  --> calendar shows 6 believable months; search "when did I decide to leave my job" cites the right dates
7  --> a new entry about work gets a reflection calling back to the arc
```

Check:
- Does step 3 need anything beyond the existing Restore button (it must not)?
- Is "restore only into an empty journal" acceptable friction for repeated test runs?
- Will 60 entries index + classify fast enough to be usable right after restore (~0.43s/entry mood → ~30s)?

## Components

```mermaid
flowchart LR
    SRC[C-1 journal-dataset.json\nsource: entries+arcs+probes]
    GEN[C-2 generator\ncargo test regen_fixtures]
    BAK[C-3 journal-backup.json\nExportFile v1]
    FIX[C-4 journal60.json\ncargo fixture]
    VAL[C-5 validate + sync tests]
    RT[C-6 restore round-trip test]
    LIVE[C-7 live probe test\nOLLAMA_TEST=1]
    APP[Little Little app\nSettings -> Restore]

    SRC --> GEN --> BAK & FIX
    SRC --> VAL
    BAK --> VAL
    FIX --> VAL
    BAK --> RT
    BAK --> APP
    FIX --> LIVE
```

Check:
- Is every file consumed by at least one test (nothing write-only)?
- Should C-7 read C-4 or C-1? (C-4: it tests what tests use.)

## Regen and sync sequence

```mermaid
sequenceDiagram
    actor Dev
    participant SRC as journal-dataset.json
    participant GEN as regen_fixtures (ignored test)
    participant OUT as journal-backup.json / journal60.json
    participant SYNC as outputs_in_sync (always-on test)

    Dev->>SRC: edit entries/probes
    Dev->>GEN: cargo test regen_fixtures -- --ignored
    GEN->>SRC: parse + validate
    GEN->>OUT: write both outputs (deterministic)
    Dev->>SYNC: cargo test
    SYNC->>SRC: regenerate in memory
    SYNC->>OUT: byte-compare
    SYNC-->>Dev: green (or red if drift)
```

Check:
- Can any path write the outputs other than the regen test?
- Is byte-identity achievable (one serializer, fixed exported_at, stable sort)?

## Source data model

```mermaid
erDiagram
    DATASET ||--o{ ENTRY : contains
    DATASET ||--o{ PROBE : defines
    DATASET ||--o{ ARC : names
    ARC ||--o{ ENTRY : "threads (via arc key)"
    PROBE }o--o{ ENTRY : "expects (ids)"

    DATASET { string schema "jf-1" string exported_at }
    ENTRY { string id "jf-NNN" string created_at string-array tags bool no_cloud string arc "nullable" string edge "nullable" bool distress string body }
    PROBE { string id "P-n" string query string-array expect }
    ARC { string key string summary }
```

Check:
- Are the test-only fields (arc, edge, distress) clearly separated from what reaches the outputs?
- Do probes referencing entry ids survive regeneration (ids are stable by rule)?
