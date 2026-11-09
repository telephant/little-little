//! Schema migrations. All-or-nothing: each migration runs in one transaction.
//! `vec_chunks` is NOT created here — it is created when the user first picks
//! an embed model (D-6), with the dimension probed from that model.

use rusqlite::Connection;

const MIGRATIONS: &[&str] = &[
    // v1 — initial schema (design-detail.md §Schema)
    "
    CREATE TABLE entries (
      id           TEXT PRIMARY KEY,
      body         TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      no_cloud     INTEGER NOT NULL DEFAULT 0,
      embed_status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE entry_tags (
      entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      tag      TEXT NOT NULL,
      PRIMARY KEY (entry_id, tag)
    );
    CREATE TABLE chunks (
      id       TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      seq      INTEGER NOT NULL,
      text     TEXT NOT NULL
    );
    CREATE TABLE ai_responses (
      id                 TEXT PRIMARY KEY,
      entry_id           TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      kind               TEXT NOT NULL,
      body               TEXT NOT NULL,
      context_entry_ids  TEXT NOT NULL,
      provider           TEXT NOT NULL,
      dismissed          INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT NOT NULL
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    ",
    // v2 — M2 mood fields (design-detail §Migration v2). Never edit v1 above.
    "
    ALTER TABLE entries ADD COLUMN mood_level  INTEGER;
    ALTER TABLE entries ADD COLUMN mood_label  TEXT;
    ALTER TABLE entries ADD COLUMN mood_source TEXT;
    ALTER TABLE entries ADD COLUMN mood_status TEXT NOT NULL DEFAULT 'pending';
    ",
    // v3 — painted marks (paint-marks ADR-0006): numbers-only JSON strokes, null = no painted mark.
    "
    ALTER TABLE entries ADD COLUMN mark TEXT;
    ",
];

#[cfg(test)]
pub(crate) const MIGRATION_V1: &str = MIGRATIONS[0];
#[cfg(test)]
pub(crate) const MIGRATION_V2: &str = MIGRATIONS[1];

pub fn run(conn: &Connection) -> rusqlite::Result<()> {
    let version: i64 = conn
        .query_row(
            "SELECT value FROM settings WHERE key='schema_version'",
            [],
            |r| r.get::<_, String>(0),
        )
        .map(|v| v.parse().unwrap_or(0))
        .unwrap_or(0);

    for (i, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO settings (key, value) VALUES ('schema_version', ?1)
             ON CONFLICT(key) DO UPDATE SET value=?1",
            [(i + 1).to_string()],
        )?;
        tx.commit()?;
    }
    Ok(())
}
