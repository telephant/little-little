//! Export / restore (C-12, F-10). Markdown for humans, JSON for backup.
//! Restore is transactional and only into an empty journal (design review 2026-11-05).

use crate::storage::Storage;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize)]
pub struct ExportFile {
    pub version: u32,
    pub exported_at: String,
    pub entries: Vec<ExportEntry>,
}

#[derive(Serialize, Deserialize)]
pub struct ExportEntry {
    pub id: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
    pub no_cloud: bool,
    pub tags: Vec<String>,
    pub mood_level: Option<i64>,
    pub mood_label: Option<String>,
    pub mood_source: Option<String>,
    /// Painted mark (ADR-0006). Optional so old backups still restore; ignored by older apps.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mark: Option<String>,
}

fn collect(storage: &Storage) -> Result<Vec<ExportEntry>, String> {
    let summaries = storage.list_entries().map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(summaries.len());
    for s in summaries {
        let e = storage.get_entry(&s.id).map_err(|e| e.to_string())?;
        out.push(ExportEntry {
            id: e.id,
            body: e.body,
            created_at: e.created_at,
            updated_at: e.updated_at,
            no_cloud: e.no_cloud,
            tags: e.tags,
            mood_level: e.mood_level,
            mood_label: e.mood_label,
            mood_source: e.mood_source,
            mark: e.mark,
        });
    }
    Ok(out)
}

/// One `YYYY-MM-DD-<id8>.md` per entry, YAML frontmatter + verbatim body (AC-24).
pub fn export_markdown(storage: &Storage, dir: &Path) -> Result<usize, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let entries = collect(storage)?;
    for e in &entries {
        let date: String = e.created_at.chars().take(10).collect();
        // uuidv7 starts with a timestamp (collides within one ms) — use the random tail.
        let id8: String = {
            let hex: Vec<char> = e.id.chars().filter(|c| *c != '-').collect();
            hex[hex.len().saturating_sub(8)..].iter().collect()
        };
        let name = format!("{date}-{id8}.md");
        let tags = if e.tags.is_empty() {
            "[]".to_string()
        } else {
            format!("[{}]", e.tags.join(", "))
        };
        let mut fm = format!("---\ndate: {}\ntags: {}\nno_cloud: {}\n", e.created_at, tags, e.no_cloud);
        if let Some(level) = e.mood_level {
            fm.push_str(&format!("mood_level: {level}\n"));
        }
        if let Some(label) = &e.mood_label {
            fm.push_str(&format!("mood_label: {label}\n"));
        }
        fm.push_str("---\n\n");
        std::fs::write(dir.join(name), format!("{fm}{}\n", e.body)).map_err(|e| e.to_string())?;
    }
    Ok(entries.len())
}

/// Single JSON backup (AC-25). No embeddings — they are recomputable.
pub fn export_json(storage: &Storage, path: &Path) -> Result<usize, String> {
    let entries = collect(storage)?;
    let file = ExportFile {
        version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        entries,
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(file.entries.len())
}

/// Restore a JSON backup into an EMPTY journal, one transaction. Restored
/// entries re-queue for embedding; manual moods keep status ok (AC-25).
pub fn restore_json(storage: &Storage, path: &Path) -> Result<usize, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let file: ExportFile = serde_json::from_str(&raw).map_err(|e| format!("not a Little Little backup: {e}"))?;
    if file.version != 1 {
        return Err(format!("unsupported backup version {}", file.version));
    }
    let conn = storage.conn.lock().unwrap();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    // The editor auto-creates a blank draft on unlock (V2-3), so a fresh
    // journal is never literally empty: untouched blank drafts count as
    // emptiness and are discarded before the guard below.
    let vec_table_exists: i64 = tx
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE name='vec_chunks'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if vec_table_exists > 0 {
        tx.execute(
            "DELETE FROM vec_chunks WHERE chunk_id IN (SELECT id FROM chunks WHERE entry_id IN (
                SELECT id FROM entries WHERE body='' AND mood_level IS NULL AND mark IS NULL
                  AND id NOT IN (SELECT entry_id FROM entry_tags)))",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute(
        "DELETE FROM entries WHERE body='' AND mood_level IS NULL AND mark IS NULL
           AND id NOT IN (SELECT entry_id FROM entry_tags)",
        [],
    )
    .map_err(|e| e.to_string())?;
    let existing: i64 = tx
        .query_row("SELECT count(*) FROM entries", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err("restore requires an empty journal (merge is not supported yet)".into());
    }
    for e in &file.entries {
        // An invalid mark never blocks a restore: drop it and keep the entry (spec D-7).
        let mark = e.mark.as_deref().filter(|m| crate::storage::mark::validate_mark(m).is_ok());
        let mood_status = if e.mood_source.as_deref() == Some("manual") {
            "ok"
        } else {
            "pending"
        };
        tx.execute(
            "INSERT INTO entries (id, body, created_at, updated_at, no_cloud, embed_status,
                                  mood_level, mood_label, mood_source, mood_status, mark)
             VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                e.id, e.body, e.created_at, e.updated_at, e.no_cloud as i64,
                e.mood_level, e.mood_label, e.mood_source, mood_status, mark
            ],
        )
        .map_err(|e| e.to_string())?;
        for tag in &e.tags {
            tx.execute(
                "INSERT OR IGNORE INTO entry_tags (entry_id, tag) VALUES (?1, ?2)",
                rusqlite::params![e.id, tag],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(file.entries.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded() -> (tempfile::TempDir, Storage, String) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "a day with --- tricky\n\nfrontmatter-like lines").unwrap();
        s.set_tags(&id, &["garden".into()]).unwrap();
        s.set_mood(&id, 4, Some("content")).unwrap();
        let id2 = s.create_entry().unwrap().id;
        s.save_entry(&id2, "flagged entry").unwrap();
        s.set_no_cloud(&id2, true).unwrap();
        (dir, s, id)
    }

    /// TC-30: one .md per entry with correct frontmatter and verbatim body.
    #[test]
    fn tc30_markdown_export_readable_outside() {
        let (dir, s, _id) = seeded();
        let out = dir.path().join("md");
        let n = export_markdown(&s, &out).unwrap();
        assert_eq!(n, 2);
        let files: Vec<_> = std::fs::read_dir(&out).unwrap().map(|f| f.unwrap().path()).collect();
        assert_eq!(files.len(), 2);
        let all: String = files.iter().map(|f| std::fs::read_to_string(f).unwrap()).collect();
        assert!(all.contains("mood_level: 4"));
        assert!(all.contains("mood_label: content"));
        assert!(all.contains("tags: [garden]"));
        assert!(all.contains("no_cloud: true"));
        // Verbatim body survives, even with frontmatter-like content.
        assert!(all.contains("a day with --- tricky\n\nfrontmatter-like lines"));
    }

    /// TC-44 (V2-3): the editor auto-creates a blank draft on unlock, so a
    /// fresh journal is never literally empty — restore must treat untouched
    /// blank drafts as emptiness, discard them, and proceed. Real content
    /// still refuses.
    #[test]
    fn tc44_restore_tolerates_blank_auto_draft() {
        let (src_dir, src, _id) = seeded();
        let backup = src_dir.path().join("backup.json");
        assert_eq!(export_json(&src, &backup).unwrap(), 2);

        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        let draft = s.create_entry().unwrap(); // what App.tsx does on unlock

        let n = restore_json(&s, &backup).unwrap();
        assert_eq!(n, 2);
        assert!(s.get_entry(&draft.id).is_err(), "blank draft was discarded");

        // With real content present, restore still refuses.
        let err = restore_json(&s, &backup).unwrap_err();
        assert!(err.contains("empty journal"), "got: {err}");
    }

    /// TC-31: JSON backup round-trips into a fresh journal; non-empty refuses.
    #[test]
    fn tc31_json_roundtrip_and_empty_guard() {
        let (dir, s, id) = seeded();
        let backup = dir.path().join("backup.json");
        assert_eq!(export_json(&s, &backup).unwrap(), 2);

        // Non-empty journal refuses.
        assert!(restore_json(&s, &backup).is_err());

        // Fresh journal restores identically.
        let dir2 = tempfile::tempdir().unwrap();
        let s2 = Storage::open(&dir2.path().join("j2.db"), "other-pass").unwrap();
        assert_eq!(restore_json(&s2, &backup).unwrap(), 2);
        let orig = s.get_entry(&id).unwrap();
        let rest = s2.get_entry(&id).unwrap();
        assert_eq!(orig.body, rest.body);
        assert_eq!(orig.tags, rest.tags);
        assert_eq!(orig.mood_level, rest.mood_level);
        assert_eq!(orig.mood_source, rest.mood_source);
        assert_eq!(rest.embed_status, "pending", "restored entries must re-embed");
        // Flagged entry keeps its flag.
        let flagged = s2.list_entries().unwrap().into_iter().find(|e| e.no_cloud);
        assert!(flagged.is_some());
        // Manual mood kept status ok (no reclassification).
        let conn = s2.conn.lock().unwrap();
        let st: String = conn
            .query_row("SELECT mood_status FROM entries WHERE id=?1", [&id], |r| r.get(0))
            .unwrap();
        assert_eq!(st, "ok");
    }

    /// paint-marks TC-15: Given an empty-body entry with no mood but a painted mark;
    /// When restore runs its blank-draft cleanup; Then the painted entry is NOT treated as a blank
    /// draft (restore refuses), and once the mark is cleared the very same entry is one (restore succeeds).
    #[test]
    fn pm_tc15_painted_empty_entry_is_not_a_blank_draft() {
        let (src_dir, src, _id) = seeded();
        let backup = src_dir.path().join("backup.json");
        export_json(&src, &backup).unwrap();

        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        let painted = s.create_entry().unwrap().id;
        s.set_mark(&painted, crate::storage::mark::VALID).unwrap();

        let err = restore_json(&s, &backup).unwrap_err();
        assert!(err.contains("empty journal"), "got: {err}");
        assert!(s.get_entry(&painted).is_ok(), "painted entry must survive");

        s.clear_mark(&painted).unwrap();
        assert_eq!(restore_json(&s, &backup).unwrap(), 2);
        assert!(s.get_entry(&painted).is_err(), "with no mark it is a blank draft and is discarded");
    }

    fn marked_pair() -> (tempfile::TempDir, Storage, String, String) {
        let (dir, s, id) = seeded();
        let id2 = s.list_entries().unwrap().into_iter().find(|e| e.id != id).unwrap().id;
        s.set_mark(&id, crate::storage::mark::VALID).unwrap();
        s.set_mark(&id2, r#"{"v":1,"strokes":[[5,5,400,400]]}"#).unwrap();
        (dir, s, id, id2)
    }

    /// paint-marks TC-14: Given entries with painted marks, an old backup without the field, and a backup
    /// with one invalid mark; When backed up and restored; Then marks round-trip exactly, the old file
    /// restores with no marks, and the damaged one restores everything with that single mark dropped.
    #[test]
    fn pm_tc14_backup_restore_keeps_marks() {
        let (dir, s, id, id2) = marked_pair();
        let backup = dir.path().join("backup.json");
        assert_eq!(export_json(&s, &backup).unwrap(), 2);

        // exact round trip
        let d1 = tempfile::tempdir().unwrap();
        let s1 = Storage::open(&d1.path().join("j.db"), "p").unwrap();
        assert_eq!(restore_json(&s1, &backup).unwrap(), 2);
        for i in [&id, &id2] {
            assert_eq!(s1.get_entry(i).unwrap().mark, s.get_entry(i).unwrap().mark);
            assert!(s1.get_entry(i).unwrap().mark.is_some());
        }

        // old backup file: no `mark` key anywhere
        let mut v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&backup).unwrap()).unwrap();
        for e in v["entries"].as_array_mut().unwrap() {
            e.as_object_mut().unwrap().remove("mark");
        }
        let old = dir.path().join("old.json");
        std::fs::write(&old, serde_json::to_string(&v).unwrap()).unwrap();
        let d2 = tempfile::tempdir().unwrap();
        let s2 = Storage::open(&d2.path().join("j.db"), "p").unwrap();
        assert_eq!(restore_json(&s2, &old).unwrap(), 2);
        assert!(s2.list_entries().unwrap().iter().all(|e| e.mark.is_none()));

        // damaged: one invalid mark is dropped, the other kept, nothing else lost
        let mut v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&backup).unwrap()).unwrap();
        let first = v["entries"][0]["id"].as_str().unwrap().to_string();
        v["entries"][0]["mark"] = serde_json::json!("not a mark");
        let bad = dir.path().join("bad.json");
        std::fs::write(&bad, serde_json::to_string(&v).unwrap()).unwrap();
        let d3 = tempfile::tempdir().unwrap();
        let s3 = Storage::open(&d3.path().join("j.db"), "p").unwrap();
        assert_eq!(restore_json(&s3, &bad).unwrap(), 2);
        let other = if first == id { &id2 } else { &id };
        assert_eq!(s3.get_entry(&first).unwrap().mark, None);
        assert!(s3.get_entry(&first).unwrap().body.len() > 3, "body of the damaged-mark entry restored");
        assert!(s3.get_entry(other).unwrap().mark.is_some());
    }

    /// paint-marks TC-16: Given two identical entries, one with a painted mark; When export_markdown runs;
    /// Then the files are identical apart from the date line and contain no mark data.
    #[test]
    fn pm_tc16_markdown_export_ignores_marks() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        let plain = s.create_entry().unwrap().id;
        s.save_entry(&plain, "same words").unwrap();
        let painted = s.create_entry().unwrap().id;
        s.save_entry(&painted, "same words").unwrap();
        s.set_mark(&painted, crate::storage::mark::VALID).unwrap();

        let out = dir.path().join("md");
        assert_eq!(export_markdown(&s, &out).unwrap(), 2);
        let body_of = |id: &str| -> String {
            // files are named by the random TAIL of the uuid (export_markdown), not its timestamp head
            let hex: String = id.chars().filter(|c| *c != '-').collect();
            let tail = &hex[hex.len() - 8..];
            let f = std::fs::read_dir(&out)
                .unwrap()
                .map(|f| f.unwrap().path())
                .find(|p| p.to_string_lossy().contains(tail))
                .unwrap();
            std::fs::read_to_string(f)
                .unwrap()
                .lines()
                .filter(|l| !l.starts_with("date:"))
                .collect::<Vec<_>>()
                .join("\n")
        };
        assert_eq!(body_of(&plain), body_of(&painted));
        assert!(!body_of(&painted).contains("strokes") && !body_of(&painted).contains("mark"));
    }
}
