//! Activity surface (C-14, AC-29): cheap counts + the current pull, so the UI
//! can show honest status chips and a global busy indicator. Pull-based.

use crate::storage::Storage;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PullInfo {
    pub model: String,
    pub pct: f64,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct Activity {
    pub embed_pending: i64,
    pub embed_total: i64,
    pub mood_pending: i64,
    pub pulling: Option<PullInfo>,
}

pub fn counts(storage: &Storage) -> Result<(i64, i64, i64), String> {
    let conn = storage.conn.lock().unwrap();
    conn.query_row(
        "SELECT
           (SELECT count(*) FROM entries WHERE embed_status='pending'),
           (SELECT count(*) FROM entries),
           (SELECT count(*) FROM entries WHERE mood_status='pending'
              AND (mood_source IS NULL OR mood_source='ai'))",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// TC-35 (counts half): pending embed/mood work is reported and zeroes out.
    #[test]
    fn tc35_counts_reflect_pending_work() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        let a = s.create_entry().unwrap().id;
        s.save_entry(&a, "one").unwrap();
        let b = s.create_entry().unwrap().id;
        s.save_entry(&b, "two").unwrap();
        s.set_mood(&b, 3, None).unwrap(); // manual → not mood-pending

        let (embed, total, mood) = counts(&s).unwrap();
        assert_eq!((embed, total, mood), (2, 2, 1));

        // Drain: mark done manually.
        {
            let conn = s.conn.lock().unwrap();
            conn.execute("UPDATE entries SET embed_status='ok', mood_status='ok'", [])
                .unwrap();
        }
        let (embed, _, mood) = counts(&s).unwrap();
        assert_eq!((embed, mood), (0, 0));
    }
}
