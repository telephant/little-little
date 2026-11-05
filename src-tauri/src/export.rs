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
    let existing: i64 = conn
        .query_row("SELECT count(*) FROM entries", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err("restore requires an empty journal (merge is not supported yet)".into());
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for e in &file.entries {
        let mood_status = if e.mood_source.as_deref() == Some("manual") {
            "ok"
        } else {
            "pending"
        };
        tx.execute(
            "INSERT INTO entries (id, body, created_at, updated_at, no_cloud, embed_status,
                                  mood_level, mood_label, mood_source, mood_status)
             VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, ?8, ?9)",
            rusqlite::params![
                e.id, e.body, e.created_at, e.updated_at, e.no_cloud as i64,
                e.mood_level, e.mood_label, e.mood_source, mood_status
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
}
