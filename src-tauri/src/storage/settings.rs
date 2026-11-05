//! Settings keys + model/provider selection (D-5/D-6).
//! `vec_chunks` is created here, when the user first picks an embed model;
//! changing the embed model rebuilds the index (drop, recreate, all pending).

use super::{Result, Storage, StorageError};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;

pub const PROVIDER_OLLAMA: &str = "ollama";
pub const PROVIDER_CLAUDE: &str = "claude_cli";

#[derive(Debug, Clone, Serialize)]
pub struct SettingsView {
    pub chat_provider: String,
    pub chat_model: Option<String>,
    pub embed_model: Option<String>,
    pub embed_dim: Option<i64>,
    pub cloud_confirmed: bool,
    /// Drives the privacy badge: true only for cloud providers (ADR-0003).
    pub is_cloud: bool,
}

impl Storage {
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        Ok(conn
            .query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
                r.get(0)
            })
            .optional()?)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value=?2",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn settings_view(&self) -> Result<SettingsView> {
        let chat_provider = self
            .get_setting("chat_provider")?
            .unwrap_or_else(|| PROVIDER_OLLAMA.to_string());
        Ok(SettingsView {
            is_cloud: chat_provider == PROVIDER_CLAUDE,
            chat_model: self.get_setting("chat_model")?,
            embed_model: self.get_setting("embed_model")?,
            embed_dim: self
                .get_setting("embed_dim")?
                .and_then(|v| v.parse().ok()),
            cloud_confirmed: self.get_setting("cloud_confirmed")?.as_deref() == Some("1"),
            chat_provider,
        })
    }

    /// Switch chat provider. Switching to a cloud provider requires the
    /// one-time confirmation (D-5): pass `confirm=true` from the dialog.
    pub fn set_provider(&self, provider: &str, confirm: bool) -> Result<SettingsView> {
        if provider != PROVIDER_OLLAMA && provider != PROVIDER_CLAUDE {
            return Err(StorageError::NotFound);
        }
        if provider == PROVIDER_CLAUDE {
            let confirmed = self.get_setting("cloud_confirmed")?.as_deref() == Some("1");
            if !confirmed && !confirm {
                // Frontend turns this into the confirm dialog.
                return Err(StorageError::CloudNotConfirmed);
            }
            self.set_setting("cloud_confirmed", "1")?;
        }
        self.set_setting("chat_provider", provider)?;
        self.settings_view()
    }

    pub fn set_chat_model(&self, model: &str) -> Result<()> {
        self.set_setting("chat_model", model)
    }

    /// Apply an embed model whose dimension has already been probed.
    /// First selection creates vec_chunks; a change rebuilds the index.
    pub fn apply_embed_model(&self, model: &str, dim: i64) -> Result<()> {
        let prev = self.get_setting("embed_model")?;
        if prev.as_deref() == Some(model) {
            return Ok(());
        }
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch("DROP TABLE IF EXISTS vec_chunks;")?;
        tx.execute_batch(&format!(
            "CREATE VIRTUAL TABLE vec_chunks USING vec0(chunk_id TEXT PRIMARY KEY, embedding FLOAT[{dim}]);"
        ))?;
        tx.execute("DELETE FROM chunks", [])?;
        tx.execute("UPDATE entries SET embed_status='pending'", [])?;
        for (k, v) in [("embed_model", model), ("embed_dim", &dim.to_string())] {
            tx.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value=?2",
                params![k, v],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn storage() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        (dir, s)
    }

    #[test]
    fn defaults_are_ollama_no_models_not_confirmed() {
        let (_d, s) = storage();
        let v = s.settings_view().unwrap();
        assert_eq!(v.chat_provider, "ollama");
        assert!(v.chat_model.is_none() && v.embed_model.is_none());
        assert!(!v.cloud_confirmed && !v.is_cloud);
    }

    /// TC-20 backend half: switching to claude without confirmation fails;
    /// with confirm it sticks and never asks again.
    #[test]
    fn cloud_switch_requires_one_time_confirmation() {
        let (_d, s) = storage();
        assert!(matches!(
            s.set_provider(PROVIDER_CLAUDE, false),
            Err(StorageError::CloudNotConfirmed)
        ));
        let v = s.set_provider(PROVIDER_CLAUDE, true).unwrap();
        assert!(v.is_cloud && v.cloud_confirmed);
        // Back and forth now works without confirm.
        assert!(!s.set_provider(PROVIDER_OLLAMA, false).unwrap().is_cloud);
        assert!(s.set_provider(PROVIDER_CLAUDE, false).unwrap().is_cloud);
    }

    /// TC-19 (storage half): Given embedded journal with model A (dim 8);
    /// When embed model changed to model B (dim 16);
    /// Then vec table recreated at dim 16, all entries pending.
    #[test]
    fn tc19_embed_model_change_rebuilds_index() {
        let (_d, s) = storage();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "hello world").unwrap();
        s.apply_embed_model("model-a", 8).unwrap();
        {
            let conn = s.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO chunks (id, entry_id, seq, text) VALUES ('c1', ?1, 0, 'hello world')",
                [&id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO vec_chunks (chunk_id, embedding) VALUES ('c1', ?1)",
                [format!("[{}]", vec!["0.1"; 8].join(","))],
            )
            .unwrap();
            conn.execute("UPDATE entries SET embed_status='ok'", []).unwrap();
        }
        s.apply_embed_model("model-b", 16).unwrap();
        let conn = s.conn.lock().unwrap();
        let vec_rows: i64 = conn
            .query_row("SELECT count(*) FROM vec_chunks", [], |r| r.get(0))
            .unwrap();
        let chunk_rows: i64 = conn
            .query_row("SELECT count(*) FROM chunks", [], |r| r.get(0))
            .unwrap();
        let status: String = conn
            .query_row("SELECT embed_status FROM entries WHERE id=?1", [&id], |r| r.get(0))
            .unwrap();
        assert_eq!((vec_rows, chunk_rows), (0, 0));
        assert_eq!(status, "pending");
        // New table accepts dim-16 vectors and rejects dim-8.
        assert!(conn
            .execute(
                "INSERT INTO vec_chunks (chunk_id, embedding) VALUES ('c2', ?1)",
                [format!("[{}]", vec!["0.1"; 16].join(","))],
            )
            .is_ok());
        assert!(conn
            .execute(
                "INSERT INTO vec_chunks (chunk_id, embedding) VALUES ('c3', ?1)",
                [format!("[{}]", vec!["0.1"; 8].join(","))],
            )
            .is_err());
    }
}
