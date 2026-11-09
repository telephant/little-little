//! journal-fixtures (C-1..C-6, ADR-0005): parse the curated dataset source,
//! deterministically render the two outputs, and keep them provably in sync.
//! Test-only module — the app binary never includes it.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::export::{ExportEntry, ExportFile};

const SOURCE: &str = include_str!("../tests/fixtures/journal-dataset.json");
const BACKUP_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/journal-backup.json"
);
const FIXTURE_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/journal60.json"
);

#[derive(Deserialize)]
struct Dataset {
    schema: String,
    exported_at: String,
    arcs: BTreeMap<String, String>,
    probes: Vec<Probe>,
    entries: Vec<SourceEntry>,
}

#[derive(Deserialize)]
#[allow(dead_code)] // query/note are consumed by the live probe test (T-03)
struct Probe {
    id: String,
    query: String,
    expect: Vec<String>,
    note: Option<String>,
}

#[derive(Deserialize)]
struct SourceEntry {
    id: String,
    created_at: String,
    tags: Vec<String>,
    no_cloud: bool,
    arc: Option<String>,
    edge: Option<String>,
    distress: bool,
    body: String,
}

/// Cargo-fixture row: same shape as tests/fixtures/entries.json rows.
#[derive(Serialize)]
struct FixtureRow<'a> {
    id: &'a str,
    created_at: &'a str,
    tags: &'a [String],
    no_cloud: bool,
    body: &'a str,
}

fn parse_source() -> Dataset {
    let mut d: Dataset = serde_json::from_str(SOURCE).expect("journal-dataset.json parses");
    // One ordering everywhere (ADR-0005: deterministic outputs).
    d.entries.sort_by(|a, b| {
        (a.created_at.as_str(), a.id.as_str()).cmp(&(b.created_at.as_str(), b.id.as_str()))
    });
    d
}

fn render_backup(d: &Dataset) -> String {
    let file = ExportFile {
        version: 1,
        exported_at: d.exported_at.clone(),
        entries: d
            .entries
            .iter()
            .map(|e| ExportEntry {
                id: e.id.clone(),
                body: e.body.clone(),
                created_at: e.created_at.clone(),
                updated_at: e.created_at.clone(),
                no_cloud: e.no_cloud,
                tags: e.tags.clone(),
                mood_level: None,
                mood_label: None,
                mood_source: None,
                mark: None,
            })
            .collect(),
    };
    let mut s = serde_json::to_string_pretty(&file).expect("backup serializes");
    s.push('\n');
    s
}

fn render_fixture(d: &Dataset) -> String {
    let rows: Vec<FixtureRow> = d
        .entries
        .iter()
        .map(|e| FixtureRow {
            id: &e.id,
            created_at: &e.created_at,
            tags: &e.tags,
            no_cloud: e.no_cloud,
            body: &e.body,
        })
        .collect();
    let mut s = serde_json::to_string_pretty(&rows).expect("fixture serializes");
    s.push('\n');
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Storage;

    /// Structural source rules that must hold from the seed onward.
    /// Full-size content rules (TC-1..TC-5) are enabled by T-02.
    #[test]
    fn source_is_structurally_valid() {
        let d = parse_source();
        assert_eq!(d.schema, "jf-1");
        assert!(!d.arcs.is_empty());
        let ids: std::collections::BTreeSet<&str> =
            d.entries.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids.len(), d.entries.len(), "entry ids unique");
        for e in &d.entries {
            assert!(
                e.id.len() == 6 && e.id.starts_with("jf-"),
                "id shape jf-NNN: {}",
                e.id
            );
            assert!(e.created_at.ends_with('Z') && e.created_at.len() == 20);
            assert!(e.created_at.as_str() <= "2026-11-05T00:00:00Z", "not future");
            if let Some(arc) = &e.arc {
                assert!(d.arcs.contains_key(arc), "arc {arc} declared");
                assert!(e.tags.contains(arc), "arc entries carry the arc tag");
            }
            if e.distress {
                assert!(e.no_cloud, "distress entry must be no_cloud");
            }
            let _ = &e.edge; // shape-checked by serde
        }
        for p in &d.probes {
            for want in &p.expect {
                assert!(ids.contains(want.as_str()), "{} expects real id {want}", p.id);
            }
        }
    }

    /// Days-from-civil (Hinnant) so span checks need no date dependency.
    fn day_number(date: &str) -> i64 {
        let y: i64 = date[0..4].parse().unwrap();
        let m: i64 = date[5..7].parse().unwrap();
        let d: i64 = date[8..10].parse().unwrap();
        let y = if m <= 2 { y - 1 } else { y };
        let era = y.div_euclid(400);
        let yoe = y - era * 400;
        let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146097 + doe
    }

    /// TC-1 (AC-1): full-size source rules.
    #[test]
    fn tc1_source_validates_full_size() {
        let d = parse_source();
        assert!(
            (55..=65).contains(&d.entries.len()),
            "55–65 entries, got {}",
            d.entries.len()
        );
        let first = day_number(&d.entries.first().unwrap().created_at);
        let last = day_number(&d.entries.last().unwrap().created_at);
        assert!(last - first >= 170, "span ≥170 days, got {}", last - first);
        assert!(d.probes.len() >= 6, "≥6 probes, got {}", d.probes.len());
        for e in &d.entries {
            if e.edge.is_none() {
                let n = e.body.chars().count();
                assert!(
                    (80..=1200).contains(&n),
                    "{}: non-edge body 80–1200 chars, got {n}",
                    e.id
                );
            }
        }
    }

    /// TC-2 (AC-5): ≥4 arcs, each ≥5 entries spanning ≥42 days.
    #[test]
    fn tc2_story_arcs() {
        let d = parse_source();
        let mut by_arc: BTreeMap<&str, Vec<&SourceEntry>> = BTreeMap::new();
        for e in &d.entries {
            if let Some(a) = &e.arc {
                by_arc.entry(a).or_default().push(e);
            }
        }
        assert!(by_arc.len() >= 4, "≥4 arcs, got {}", by_arc.len());
        for (arc, entries) in &by_arc {
            assert!(entries.len() >= 5, "arc {arc}: ≥5 entries, got {}", entries.len());
            let span = day_number(&entries.last().unwrap().created_at)
                - day_number(&entries.first().unwrap().created_at);
            assert!(span >= 42, "arc {arc}: span ≥42 days, got {span}");
        }
    }

    /// TC-3 (AC-6): privacy coverage.
    #[test]
    fn tc3_privacy_coverage() {
        let d = parse_source();
        let flagged: Vec<&SourceEntry> = d.entries.iter().filter(|e| e.no_cloud).collect();
        assert!(flagged.len() >= 5, "≥5 no_cloud, got {}", flagged.len());
        assert!(flagged.iter().any(|e| e.arc.is_some()), "≥1 no_cloud inside an arc");
    }

    /// TC-4 (AC-7): exactly one distress entry, and it is no_cloud.
    #[test]
    fn tc4_distress_entry() {
        let d = parse_source();
        let distress: Vec<&SourceEntry> = d.entries.iter().filter(|e| e.distress).collect();
        assert_eq!(distress.len(), 1, "exactly one distress entry");
        assert!(distress[0].no_cloud);
    }

    /// TC-5 (AC-8): edge cases present.
    #[test]
    fn tc5_edge_cases() {
        let d = parse_source();
        assert!(
            d.entries.iter().any(|e| e.body.chars().count() < 40),
            "≥1 short body"
        );
        assert!(
            d.entries.iter().any(|e| e.body.chars().count() > 2000),
            "≥1 long body"
        );
        assert!(
            d.entries
                .iter()
                .any(|e| e.body.chars().any(|c| c as u32 >= 0x1F300)),
            "≥1 emoji body"
        );
        assert!(
            d.entries
                .iter()
                .any(|e| e.body.chars().any(|c| (0x4E00..=0x9FFF).contains(&(c as u32)))),
            "≥1 CJK snippet"
        );
        let mut days: BTreeMap<&str, usize> = BTreeMap::new();
        for e in &d.entries {
            *days.entry(&e.created_at[0..10]).or_default() += 1;
        }
        assert!(
            days.values().any(|&n| n >= 2),
            "≥2 entries sharing a calendar day"
        );
    }

    /// TC-6 (AC-9): moods ship null in the backup; the fixture shape has none.
    #[test]
    fn tc6_moods_ship_null() {
        let d = parse_source();
        let backup: ExportFile = serde_json::from_str(&render_backup(&d)).unwrap();
        for e in &backup.entries {
            assert!(e.mood_level.is_none() && e.mood_label.is_none() && e.mood_source.is_none());
        }
        assert!(!render_fixture(&d).contains("mood"));
    }

    /// TC-7 (AC-2): rendered backup conforms to ExportFile v1.
    #[test]
    fn tc7_backup_conforms_to_export_v1() {
        let d = parse_source();
        let backup: ExportFile = serde_json::from_str(&render_backup(&d)).unwrap();
        assert_eq!(backup.version, 1);
        assert_eq!(backup.entries.len(), d.entries.len());
        for e in &backup.entries {
            assert!(!e.id.is_empty() && !e.body.is_empty());
            assert_eq!(e.updated_at, e.created_at);
        }
    }

    /// TC-8 (AC-3): the backup restores into an empty journal intact,
    /// with moods queued for the worker (mood_status = pending).
    #[test]
    fn tc8_backup_restores_round_trip() {
        let d = parse_source();
        let dir = tempfile::tempdir().unwrap();
        let backup_path = dir.path().join("backup.json");
        std::fs::write(&backup_path, render_backup(&d)).unwrap();

        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        let n = crate::export::restore_json(&s, &backup_path).unwrap();
        assert_eq!(n, d.entries.len());

        for src in &d.entries {
            let e = s.get_entry(&src.id).unwrap();
            assert_eq!(e.body, src.body);
            assert_eq!(e.created_at, src.created_at);
            assert_eq!(e.no_cloud, src.no_cloud);
            let mut tags = src.tags.clone();
            tags.sort();
            let mut got = e.tags.clone();
            got.sort();
            assert_eq!(got, tags);
            assert!(e.mood_level.is_none());
        }
        let conn = s.conn.lock().unwrap();
        let pending: i64 = conn
            .query_row(
                "SELECT count(*) FROM entries WHERE mood_status='pending'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pending as usize, d.entries.len());
    }

    /// TC-9 (AC-4): checked-in outputs are byte-identical to regeneration.
    #[test]
    fn tc9_outputs_in_sync() {
        let d = parse_source();
        let on_disk_backup = std::fs::read_to_string(BACKUP_PATH)
            .expect("journal-backup.json exists — run: cargo test regen_fixtures -- --ignored");
        let on_disk_fixture = std::fs::read_to_string(FIXTURE_PATH)
            .expect("journal60.json exists — run: cargo test regen_fixtures -- --ignored");
        assert_eq!(on_disk_backup, render_backup(&d), "backup drifted — regen");
        assert_eq!(on_disk_fixture, render_fixture(&d), "fixture drifted — regen");
        // Determinism: rendering twice is identical.
        assert_eq!(render_backup(&d), render_backup(&d));
    }

    /// TC-10 (AC-10, C-7): live probe quality — for each curated probe query,
    /// an expected entry id ranks in the top 5 with real embeddings; at most
    /// one probe may miss (the design's 5-of-6 bar).
    /// Run: OLLAMA_TEST=1 cargo test --lib live_probe_quality -- --ignored --nocapture
    #[tokio::test]
    #[ignore = "live: needs Ollama with nomic-embed-text"]
    async fn live_probe_quality() {
        if std::env::var("OLLAMA_TEST").as_deref() != Ok("1") {
            return;
        }
        use crate::memory::{process_pending, search::search_entries};
        use crate::providers::ollama;

        let d = parse_source();
        let dir = tempfile::tempdir().unwrap();
        let backup_path = dir.path().join("backup.json");
        std::fs::write(&backup_path, render_backup(&d)).unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        let dim = ollama::probe_dim(ollama::BASE_URL, "nomic-embed-text:latest")
            .await
            .unwrap();
        s.apply_embed_model("nomic-embed-text:latest", dim).unwrap();
        crate::export::restore_json(&s, &backup_path).unwrap();

        let embedder = ollama::OllamaEmbed {
            base_url: ollama::BASE_URL.into(),
            model: "nomic-embed-text:latest".into(),
        };
        let t0 = std::time::Instant::now();
        process_pending(&s, &embedder).await.unwrap();
        println!(
            "MEASURE embed: {} entries in {:?}",
            d.entries.len(),
            t0.elapsed()
        );

        let mut hits = 0usize;
        for p in &d.probes {
            let out = search_entries(&s, &embedder, &p.query, false).await.unwrap();
            let top5: Vec<&str> = out
                .results
                .iter()
                .take(5)
                .map(|r| r.entry_id.as_str())
                .collect();
            let hit = p.expect.iter().any(|want| top5.contains(&want.as_str()));
            println!(
                "PROBE {} {} top5={:?} want={:?} ({})",
                p.id,
                if hit { "HIT " } else { "MISS" },
                top5,
                p.expect,
                p.note.as_deref().unwrap_or("")
            );
            if hit {
                hits += 1;
            }
        }
        assert!(d.probes.len() >= 6, "≥6 probes, got {}", d.probes.len());
        assert!(
            hits + 1 >= d.probes.len(),
            "at most one probe may miss: {hits}/{} hit",
            d.probes.len()
        );
    }

    /// The only writer of the generated files (ADR-0005).
    #[test]
    #[ignore = "writes tests/fixtures/journal-backup.json and journal60.json"]
    fn regen_fixtures() {
        let d = parse_source();
        std::fs::write(BACKUP_PATH, render_backup(&d)).unwrap();
        std::fs::write(FIXTURE_PATH, render_fixture(&d)).unwrap();
    }
}
