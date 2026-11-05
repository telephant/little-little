//! Entry CRUD + tags + the no-cloud flag.

use super::{Result, Storage, StorageError};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Entry {
    pub id: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
    pub no_cloud: bool,
    pub embed_status: String,
    pub tags: Vec<String>,
    pub mood_level: Option<i64>,
    pub mood_label: Option<String>,
    pub mood_source: Option<String>, // 'ai' | 'manual'
}

#[derive(Debug, Clone, Serialize)]
pub struct EntrySummary {
    pub id: String,
    pub preview: String,
    pub created_at: String,
    pub updated_at: String,
    pub no_cloud: bool,
    pub tags: Vec<String>,
    pub mood_level: Option<i64>,
    pub mood_label: Option<String>,
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

impl Storage {
    pub fn create_entry(&self) -> Result<Entry> {
        let id = uuid::Uuid::now_v7().to_string();
        let ts = now();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO entries (id, body, created_at, updated_at) VALUES (?1, '', ?2, ?2)",
            params![id, ts],
        )?;
        Ok(Entry {
            id,
            body: String::new(),
            created_at: ts.clone(),
            updated_at: ts,
            no_cloud: false,
            embed_status: "pending".into(),
            tags: vec![],
            mood_level: None,
            mood_label: None,
            mood_source: None,
        })
    }

    /// Autosave target: updates body, bumps updated_at, re-queues embedding —
    /// and mood, unless the mood is manual (manual-wins invariant, AC-19).
    pub fn save_entry(&self, id: &str, body: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE entries SET body=?2, updated_at=?3, embed_status='pending',
                    mood_status = CASE WHEN mood_source='manual' THEN mood_status ELSE 'pending' END
             WHERE id=?1",
            params![id, body, now()],
        )?;
        if n == 0 {
            return Err(StorageError::NotFound);
        }
        Ok(())
    }

    /// Manual mood: permanent, never overwritten by AI (AC-19).
    pub fn set_mood(&self, id: &str, level: i64, label: Option<&str>) -> Result<()> {
        if !(1..=5).contains(&level) {
            return Err(StorageError::NotFound); // invalid level; command layer validates too
        }
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE entries SET mood_level=?2, mood_label=?3, mood_source='manual', mood_status='ok'
             WHERE id=?1",
            params![id, level, label],
        )?;
        if n == 0 {
            return Err(StorageError::NotFound);
        }
        Ok(())
    }

    /// AI mood write: respects the manual-wins SQL guard.
    #[allow(dead_code)] // consumed by the mood engine in T-12 (next task)
    pub fn set_mood_ai(&self, id: &str, level: i64, label: Option<&str>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE entries SET mood_level=?2, mood_label=?3, mood_source='ai', mood_status='ok'
             WHERE id=?1 AND (mood_source IS NULL OR mood_source='ai')",
            params![id, level, label],
        )?;
        Ok(())
    }

    pub fn get_entry(&self, id: &str) -> Result<Entry> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT id, body, created_at, updated_at, no_cloud, embed_status,
                        mood_level, mood_label, mood_source
                 FROM entries WHERE id=?1",
                [id],
                |r| {
                    Ok(Entry {
                        id: r.get(0)?,
                        body: r.get(1)?,
                        created_at: r.get(2)?,
                        updated_at: r.get(3)?,
                        no_cloud: r.get::<_, i64>(4)? != 0,
                        embed_status: r.get(5)?,
                        tags: vec![],
                        mood_level: r.get(6)?,
                        mood_label: r.get(7)?,
                        mood_source: r.get(8)?,
                    })
                },
            )
            .optional()?;
        let mut entry = row.ok_or(StorageError::NotFound)?;
        entry.tags = tags_for(&conn, id)?;
        Ok(entry)
    }

    /// Chronological browse, newest first.
    pub fn list_entries(&self) -> Result<Vec<EntrySummary>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, substr(body, 1, 120), created_at, updated_at, no_cloud, mood_level, mood_label
             FROM entries ORDER BY created_at DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(EntrySummary {
                    id: r.get(0)?,
                    preview: r.get(1)?,
                    created_at: r.get(2)?,
                    updated_at: r.get(3)?,
                    no_cloud: r.get::<_, i64>(4)? != 0,
                    tags: vec![],
                    mood_level: r.get(5)?,
                    mood_label: r.get(6)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut out = rows;
        for e in &mut out {
            e.tags = tags_for(&conn, &e.id)?;
        }
        Ok(out)
    }

    pub fn delete_entry(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        // vec0 virtual tables have no FK support: clean vectors explicitly,
        // before the CASCADE removes the chunks rows (AC-8 delete path).
        let vec_table_exists: i64 = tx.query_row(
            "SELECT count(*) FROM sqlite_master WHERE name='vec_chunks'",
            [],
            |r| r.get(0),
        )?;
        if vec_table_exists > 0 {
            tx.execute(
                "DELETE FROM vec_chunks WHERE chunk_id IN (SELECT id FROM chunks WHERE entry_id=?1)",
                [id],
            )?;
        }
        let n = tx.execute("DELETE FROM entries WHERE id=?1", [id])?;
        tx.commit()?;
        if n == 0 {
            return Err(StorageError::NotFound);
        }
        Ok(())
    }

    pub fn set_tags(&self, id: &str, tags: &[String]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let n: i64 = tx.query_row("SELECT count(*) FROM entries WHERE id=?1", [id], |r| {
            r.get(0)
        })?;
        if n == 0 {
            return Err(StorageError::NotFound);
        }
        tx.execute("DELETE FROM entry_tags WHERE entry_id=?1", [id])?;
        for tag in tags {
            tx.execute(
                "INSERT OR IGNORE INTO entry_tags (entry_id, tag) VALUES (?1, ?2)",
                params![id, tag],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn set_no_cloud(&self, id: &str, no_cloud: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE entries SET no_cloud=?2 WHERE id=?1",
            params![id, no_cloud as i64],
        )?;
        if n == 0 {
            return Err(StorageError::NotFound);
        }
        Ok(())
    }
}

fn tags_for(conn: &rusqlite::Connection, id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT tag FROM entry_tags WHERE entry_id=?1 ORDER BY tag")?;
    let tags = stmt
        .query_map([id], |r| r.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(tags)
}
