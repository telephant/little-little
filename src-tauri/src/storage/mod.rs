//! Storage layer (C-5): SQLCipher-encrypted SQLite via rusqlite,
//! sqlite-vec registered as a static auto-extension (ADR-0001/0002).

mod calendar;
mod entries;
mod migrations;
mod responses;
mod settings;

pub use calendar::DayMood;
pub use entries::{Entry, EntrySummary};
pub use responses::AiResponse;
pub use settings::SettingsView;

use rusqlite::{ffi::sqlite3_auto_extension, Connection};
use std::path::Path;
use std::sync::{Mutex, Once};

static REGISTER_VEC: Once = Once::new();

#[allow(clippy::missing_transmute_annotations)]
fn register_vec_extension() {
    REGISTER_VEC.call_once(|| unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    });
}

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("wrong passphrase or not a journal database")]
    WrongPassphrase,
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("not found")]
    NotFound,
    /// Switching to a cloud provider before the one-time confirmation (D-5).
    #[error("cloud-not-confirmed")]
    CloudNotConfirmed,
}

pub type Result<T> = std::result::Result<T, StorageError>;

/// One open, keyed journal database. `conn` is a Mutex so the embed worker
/// and IPC commands can share it (journal write rates make contention moot).
pub struct Storage {
    pub(crate) conn: Mutex<Connection>,
}

impl Storage {
    /// Open (or create) the database at `path` keyed with `passphrase`.
    /// Fails with `WrongPassphrase` when the key does not match an existing file.
    pub fn open(path: &Path, passphrase: &str) -> Result<Storage> {
        register_vec_extension();
        let conn = Connection::open(path)?;
        // PRAGMA key must be the first statement on the connection.
        conn.pragma_update(None, "key", passphrase)?;
        // Probe: NOTADB here means wrong key (or not a SQLCipher db).
        if conn
            .query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))
            .is_err()
        {
            return Err(StorageError::WrongPassphrase);
        }
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrations::run(&conn)?;
        Ok(Storage {
            conn: Mutex::new(conn),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("journal.db");
        (dir, path)
    }

    /// TC-1 (storage level): Given unlocked app with typed text pending debounce;
    /// When process restarts and DB reopened with passphrase;
    /// Then entry body equals typed text.
    #[test]
    fn tc1_autosaved_entry_persists_across_reopen() {
        let (_dir, path) = tmp();
        let id;
        {
            let s = Storage::open(&path, "pass").unwrap();
            id = s.create_entry().unwrap().id;
            s.save_entry(&id, "today I planted basil").unwrap();
            // Storage dropped here = process exit.
        }
        let s = Storage::open(&path, "pass").unwrap();
        let entry = s.get_entry(&id).unwrap();
        assert_eq!(entry.body, "today I planted basil");
    }

    /// TC-2: Given DB with one entry; When opened with stock SQLite (no key);
    /// Then open/read fails (NOTADB) and the raw file leaks nothing.
    #[test]
    fn tc2_file_is_encrypted_at_rest() {
        let (_dir, path) = tmp();
        {
            let s = Storage::open(&path, "pass").unwrap();
            let id = s.create_entry().unwrap().id;
            s.save_entry(&id, "very secret text").unwrap();
        }
        let conn = Connection::open(&path).unwrap(); // no key
        assert!(conn
            .query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))
            .is_err());
        let raw = std::fs::read(&path).unwrap();
        assert!(!raw.windows(16).any(|w| w == b"very secret text"));
        assert!(!raw.starts_with(b"SQLite format 3\0"));
    }

    /// TC-3: Given existing DB; When unlock with wrong passphrase;
    /// Then error returned, no tables readable, retry with correct passphrase succeeds.
    #[test]
    fn tc3_wrong_passphrase_rejected_then_retry_succeeds() {
        let (_dir, path) = tmp();
        {
            Storage::open(&path, "right").unwrap();
        }
        assert!(matches!(
            Storage::open(&path, "wrong"),
            Err(StorageError::WrongPassphrase)
        ));
        // Retry with the correct passphrase on the same file.
        let s = Storage::open(&path, "right").unwrap();
        assert!(s.list_entries().unwrap().is_empty());
    }

    /// T-11: a v1 (M1) journal migrates cleanly to v2 with data intact.
    #[test]
    fn v1_journal_migrates_to_v2() {
        let (_dir, path) = tmp();
        {
            // Build a genuine v1 database by hand.
            register_vec_extension();
            let conn = Connection::open(&path).unwrap();
            conn.pragma_update(None, "key", "pass").unwrap();
            conn.execute_batch(super::migrations::MIGRATION_V1).unwrap();
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('schema_version', '1')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO entries (id, body, created_at, updated_at) VALUES ('e1','old text','t','t')",
                [],
            )
            .unwrap();
        }
        let s = Storage::open(&path, "pass").unwrap();
        let e = s.get_entry("e1").unwrap();
        assert_eq!(e.body, "old text");
        assert_eq!((e.mood_level, e.mood_source), (None, None));
        let v = s.get_setting("schema_version").unwrap().unwrap();
        assert_eq!(v, "2");
    }

    /// TC-24 (storage half): Given an entry with AI mood; When set_mood(2) then
    /// the entry is edited; Then level stays 2, source 'manual', no mood re-queue.
    #[test]
    fn tc24_manual_mood_survives_edits() {
        let (_dir, path) = tmp();
        let s = Storage::open(&path, "p").unwrap();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "first").unwrap();
        s.set_mood_ai(&id, 4, Some("hopeful")).unwrap();
        s.set_mood(&id, 2, None).unwrap();
        s.save_entry(&id, "edited text").unwrap();
        let e = s.get_entry(&id).unwrap();
        assert_eq!(e.mood_level, Some(2));
        assert_eq!(e.mood_source.as_deref(), Some("manual"));
        let conn = s.conn.lock().unwrap();
        let status: String = conn
            .query_row("SELECT mood_status FROM entries WHERE id=?1", [&id], |r| r.get(0))
            .unwrap();
        assert_eq!(status, "ok", "manual mood must not re-queue on edit");
        // And the AI guard can no longer overwrite it.
        drop(conn);
        s.set_mood_ai(&id, 5, None).unwrap();
        assert_eq!(s.get_entry(&id).unwrap().mood_level, Some(2));
    }

    #[test]
    fn crud_tags_and_no_cloud_roundtrip() {
        let (_dir, path) = tmp();
        let s = Storage::open(&path, "p").unwrap();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "body").unwrap();
        s.set_tags(&id, &["garden".into(), "mood".into()]).unwrap();
        s.set_no_cloud(&id, true).unwrap();
        let e = s.get_entry(&id).unwrap();
        assert_eq!(e.tags, vec!["garden", "mood"]);
        assert!(e.no_cloud);
        assert_eq!(e.embed_status, "pending");
        s.delete_entry(&id).unwrap();
        assert!(matches!(s.get_entry(&id), Err(StorageError::NotFound)));
        assert!(s.list_entries().unwrap().is_empty());
    }
}
