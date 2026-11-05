//! Spike: prove SQLCipher (rusqlite bundled-sqlcipher-vendored-openssl) and
//! sqlite-vec (static link via sqlite3_auto_extension) work together.
//! Findings feed ADR-0001/0002; this is not production code.

use rusqlite::{ffi::sqlite3_auto_extension, Connection};
use std::path::Path;
use std::sync::Once;

static REGISTER_VEC: Once = Once::new();

/// Register sqlite-vec for every future connection in this process.
pub fn register_vec_extension() {
    REGISTER_VEC.call_once(|| unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    });
}

/// Open (or create) a keyed database. `PRAGMA key` must be the first statement.
pub fn open_keyed(path: &Path, passphrase: &str) -> rusqlite::Result<Connection> {
    register_vec_extension();
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "key", passphrase)?;
    // Probe: fails with NOTADB when the key is wrong.
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))?;
    Ok(conn)
}

fn main() {
    println!("run `cargo test` — this spike only exists for its tests");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded_db(dir: &tempfile::TempDir) -> std::path::PathBuf {
        let path = dir.path().join("journal.db");
        let conn = open_keyed(&path, "correct horse").unwrap();
        conn.execute_batch(
            "CREATE TABLE entries (id TEXT PRIMARY KEY, body TEXT NOT NULL);
             INSERT INTO entries VALUES ('e1', 'secret journal text');",
        )
        .unwrap();
        conn.execute_batch(
            "CREATE VIRTUAL TABLE vec_chunks USING vec0(chunk_id TEXT PRIMARY KEY, embedding FLOAT[4]);",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO vec_chunks (chunk_id, embedding) VALUES ('c1', '[0.1, 0.2, 0.3, 0.4]')",
            [],
        )
        .unwrap();
        path
    }

    #[test]
    fn vec_knn_query_works_inside_keyed_db() {
        let dir = tempfile::tempdir().unwrap();
        let path = seeded_db(&dir);
        let conn = open_keyed(&path, "correct horse").unwrap();
        let (id, dist): (String, f64) = conn
            .query_row(
                "SELECT chunk_id, distance FROM vec_chunks
                 WHERE embedding MATCH '[0.1, 0.2, 0.3, 0.4]' AND k = 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(id, "c1");
        assert!(dist.abs() < 1e-6, "identical vector should have distance 0, got {dist}");
    }

    #[test]
    fn reopen_with_correct_key_reads_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = seeded_db(&dir);
        let conn = open_keyed(&path, "correct horse").unwrap();
        let body: String = conn
            .query_row("SELECT body FROM entries WHERE id='e1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(body, "secret journal text");
    }

    /// TC-3 mechanics: wrong passphrase must fail the sqlite_master probe.
    #[test]
    fn wrong_key_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = seeded_db(&dir);
        assert!(open_keyed(&path, "wrong passphrase").is_err());
    }

    /// TC-2: Given a DB with one entry; When opened with stock SQLite (no key);
    /// Then open/read fails (NOTADB) — i.e. the file is encrypted at rest.
    #[test]
    fn stock_sqlite_cannot_read_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = seeded_db(&dir);
        // No PRAGMA key: same library, but unkeyed — must look like "not a database".
        let conn = Connection::open(&path).unwrap();
        let res = conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()));
        assert!(res.is_err(), "unkeyed open must not be able to read the file");
        // Belt and braces: the raw file must not contain the plaintext or the
        // cleartext SQLite magic header.
        let raw = std::fs::read(&path).unwrap();
        assert!(!raw.windows(19).any(|w| w == b"secret journal text"));
        assert!(!raw.starts_with(b"SQLite format 3\0"));
    }
}
