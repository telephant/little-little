//! ai_responses CRUD: the stored, auditable trail of every AI output ("honest AI").

use super::{Result, Storage, StorageError};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AiResponse {
    pub id: String,
    pub entry_id: String,
    pub kind: String,
    pub body: String,
    pub context_entry_ids: Vec<String>,
    pub provider: String,
    pub dismissed: bool,
    pub created_at: String,
}

impl Storage {
    pub fn insert_reflection(
        &self,
        entry_id: &str,
        body: &str,
        context_entry_ids: &[String],
        provider: &str,
    ) -> Result<AiResponse> {
        let resp = AiResponse {
            id: uuid::Uuid::now_v7().to_string(),
            entry_id: entry_id.to_string(),
            kind: "reflection".into(),
            body: body.to_string(),
            context_entry_ids: context_entry_ids.to_vec(),
            provider: provider.to_string(),
            dismissed: false,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO ai_responses (id, entry_id, kind, body, context_entry_ids, provider, dismissed, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
            params![
                resp.id,
                resp.entry_id,
                resp.kind,
                resp.body,
                serde_json::to_string(&resp.context_entry_ids).unwrap(),
                resp.provider,
                resp.created_at
            ],
        )?;
        Ok(resp)
    }

    /// Latest non-dismissed reflection for an entry, if any.
    pub fn latest_reflection(&self, entry_id: &str) -> Result<Option<AiResponse>> {
        let conn = self.conn.lock().unwrap();
        Ok(conn
            .query_row(
                "SELECT id, entry_id, kind, body, context_entry_ids, provider, dismissed, created_at
                 FROM ai_responses
                 WHERE entry_id=?1 AND kind='reflection' AND dismissed=0
                 ORDER BY created_at DESC LIMIT 1",
                [entry_id],
                |r| {
                    Ok(AiResponse {
                        id: r.get(0)?,
                        entry_id: r.get(1)?,
                        kind: r.get(2)?,
                        body: r.get(3)?,
                        context_entry_ids: serde_json::from_str(&r.get::<_, String>(4)?)
                            .unwrap_or_default(),
                        provider: r.get(5)?,
                        dismissed: r.get::<_, i64>(6)? != 0,
                        created_at: r.get(7)?,
                    })
                },
            )
            .optional()?)
    }

    pub fn dismiss_response(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute("UPDATE ai_responses SET dismissed=1 WHERE id=?1", [id])?;
        if n == 0 {
            return Err(StorageError::NotFound);
        }
        Ok(())
    }
}
