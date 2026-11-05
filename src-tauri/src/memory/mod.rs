//! Memory engine (C-6): background embedding + retrieval.
//! The queue is `entries.embed_status` — no in-memory state to lose (design §Tricky parts).

pub mod chunker;
pub mod mood;
pub mod retrieval;
pub mod search;

use crate::providers::{EmbeddingProvider, ProviderError};
use crate::storage::Storage;
use rusqlite::params;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Notify;

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("transient: {0}")]
    Transient(String),
    #[error("storage: {0}")]
    Storage(#[from] crate::storage::StorageError),
}

/// Embed every pending entry once. Returns how many entries were embedded.
/// - No embed model selected (D-6/AC-16): does nothing, calls nothing.
/// - Transient provider failure (Ollama down): Err(Transient), entries stay pending.
/// - Permanent failure (model missing): entry marked `failed`, processing continues.
pub async fn process_pending<E: EmbeddingProvider>(
    storage: &Storage,
    embedder: &E,
) -> Result<usize, EngineError> {
    if storage.get_setting("embed_model")?.is_none() {
        return Ok(0);
    }
    let mut processed = 0;
    loop {
        let next: Option<(String, String)> = {
            let conn = storage.conn.lock().unwrap();
            conn.query_row(
                "SELECT id, body FROM entries WHERE embed_status='pending'
                 ORDER BY updated_at ASC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(crate::storage::StorageError::from(other)),
            })?
        };
        let Some((entry_id, body)) = next else {
            return Ok(processed);
        };

        let chunks = chunker::chunk(&body);
        let vectors = if chunks.is_empty() {
            vec![]
        } else {
            match embedder.embed(&chunks).await {
                Ok(v) => v,
                Err(ProviderError::Unreachable(m)) => return Err(EngineError::Transient(m)),
                Err(e) => {
                    mark_status(storage, &entry_id, "failed")?;
                    log::warn!("embedding entry {entry_id} failed permanently: {e}");
                    continue;
                }
            }
        };

        // One transaction: replace chunks + vectors, flip status (AC-8 guarantee).
        {
            let conn = storage.conn.lock().unwrap();
            let tx = conn.unchecked_transaction().map_err(crate::storage::StorageError::from)?;
            tx.execute(
                "DELETE FROM vec_chunks WHERE chunk_id IN (SELECT id FROM chunks WHERE entry_id=?1)",
                [&entry_id],
            )
            .map_err(crate::storage::StorageError::from)?;
            tx.execute("DELETE FROM chunks WHERE entry_id=?1", [&entry_id])
                .map_err(crate::storage::StorageError::from)?;
            for (seq, (text, vec)) in chunks.iter().zip(vectors.iter()).enumerate() {
                let chunk_id = uuid::Uuid::now_v7().to_string();
                tx.execute(
                    "INSERT INTO chunks (id, entry_id, seq, text) VALUES (?1, ?2, ?3, ?4)",
                    params![chunk_id, entry_id, seq as i64, text],
                )
                .map_err(crate::storage::StorageError::from)?;
                tx.execute(
                    "INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?1, ?2)",
                    params![chunk_id, serde_json::to_string(vec).unwrap()],
                )
                .map_err(crate::storage::StorageError::from)?;
            }
            tx.execute(
                "UPDATE entries SET embed_status='ok' WHERE id=?1",
                [&entry_id],
            )
            .map_err(crate::storage::StorageError::from)?;
            tx.commit().map_err(crate::storage::StorageError::from)?;
        }
        processed += 1;
    }
}

fn mark_status(storage: &Storage, entry_id: &str, status: &str) -> Result<(), EngineError> {
    let conn = storage.conn.lock().unwrap();
    conn.execute(
        "UPDATE entries SET embed_status=?2 WHERE id=?1",
        params![entry_id, status],
    )
    .map_err(crate::storage::StorageError::from)?;
    Ok(())
}

/// Long-running worker (spawned on unlock): startup scan, then waits on `notify`
/// (pinged after each save / model change). Transient failures back off, capped.
/// Spawned on Tauri's runtime: sync commands run outside a Tokio context, so a
/// bare `tokio::spawn` here panics at runtime ("no reactor running").
pub fn spawn_worker(
    storage: Arc<Storage>,
    notify: Arc<Notify>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        let mut backoff = Duration::from_secs(1);
        loop {
            let embedder = {
                match storage.get_setting("embed_model") {
                    Ok(Some(model)) => Some(crate::providers::ollama::OllamaEmbed {
                        base_url: crate::providers::ollama::BASE_URL.to_string(),
                        model,
                    }),
                    _ => None,
                }
            };
            let Some(embedder) = embedder else {
                notify.notified().await; // idle until models are chosen (AC-16)
                continue;
            };
            // Embed pass, then mood pass (F-7) — both share the transient-backoff path.
            let cycle = async {
                process_pending(storage.as_ref(), &embedder).await?;
                if let Ok(settings) = storage.settings_view()
                    && let Some(active) = crate::providers::AnyChatProvider::active_from(&settings)
                {
                    let local = crate::providers::AnyChatProvider::local_from(&settings);
                    mood::process_pending_moods(storage.as_ref(), &active, local.as_ref()).await?;
                }
                Ok::<(), EngineError>(())
            };
            match cycle.await {
                Ok(()) => {
                    backoff = Duration::from_secs(1);
                    notify.notified().await;
                }
                Err(EngineError::Transient(_)) => {
                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(Duration::from_secs(60));
                }
                Err(e) => {
                    log::error!("worker storage error: {e}");
                    notify.notified().await;
                }
            }
        }
    })
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::providers::fakes::FakeEmbeddingProvider;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Fixture {
        created_at: String,
        tags: Vec<String>,
        no_cloud: bool,
        body: String,
    }

    fn storage() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        (dir, s)
    }

    pub fn load_fixtures(s: &Storage) -> Vec<String> {
        let raw = include_str!("../../tests/fixtures/entries.json");
        let fixtures: Vec<Fixture> = serde_json::from_str(raw).unwrap();
        let mut ids = Vec::new();
        for f in fixtures {
            let id = s.create_entry().unwrap().id;
            s.save_entry(&id, &f.body).unwrap();
            s.set_tags(&id, &f.tags).unwrap();
            s.set_no_cloud(&id, f.no_cloud).unwrap();
            // Keep fixture chronology (create_entry stamped "now").
            let conn = s.conn.lock().unwrap();
            conn.execute(
                "UPDATE entries SET created_at=?2, updated_at=?2 WHERE id=?1",
                rusqlite::params![id, f.created_at],
            )
            .unwrap();
            drop(conn);
            ids.push(id);
        }
        ids
    }

    fn counts(s: &Storage) -> (i64, i64) {
        let conn = s.conn.lock().unwrap();
        let c: i64 = conn
            .query_row("SELECT count(*) FROM chunks", [], |r| r.get(0))
            .unwrap();
        let v: i64 = conn
            .query_row("SELECT count(*) FROM vec_chunks", [], |r| r.get(0))
            .unwrap();
        (c, v)
    }

    /// TC-18 (engine half): Given fresh journal, no models chosen; When entry
    /// saved; Then no embed call occurs; When models chosen; Then pending
    /// entries embed.
    #[tokio::test]
    async fn tc18_no_model_no_calls_then_selection_unblocks() {
        let (_d, s) = storage();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "hello basil plant").unwrap();

        let fake = FakeEmbeddingProvider::new(8);
        assert_eq!(process_pending(&s, &fake).await.unwrap(), 0);
        assert_eq!(s.get_entry(&id).unwrap().embed_status, "pending");

        s.apply_embed_model("fake-model", 8).unwrap();
        assert_eq!(process_pending(&s, &fake).await.unwrap(), 1);
        assert_eq!(s.get_entry(&id).unwrap().embed_status, "ok");
    }

    /// TC-5: Given models selected, fake embedder; When entry saved and worker
    /// runs; Then chunks rows + vec_chunks rows exist linked to entry, status ok.
    #[tokio::test]
    async fn tc5_save_then_embed_populates_index() {
        let (_d, s) = storage();
        s.apply_embed_model("fake-model", 8).unwrap();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "went to the gym, squats felt light").unwrap();
        process_pending(&s, &FakeEmbeddingProvider::new(8)).await.unwrap();
        let conn = s.conn.lock().unwrap();
        let n: i64 = conn
            .query_row("SELECT count(*) FROM chunks WHERE entry_id=?1", [&id], |r| r.get(0))
            .unwrap();
        drop(conn);
        assert!(n >= 1);
        let (c, v) = counts(&s);
        assert_eq!(c, v);
        assert_eq!(s.get_entry(&id).unwrap().embed_status, "ok");
    }

    /// TC-6: Given entry stuck pending (crash: status pending, no vectors);
    /// When app restarts (startup scan); Then worker re-embeds it to ok.
    #[tokio::test]
    async fn tc6_startup_scan_recovers_stuck_pending() {
        let (_d, s) = storage();
        s.apply_embed_model("fake-model", 8).unwrap();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "crash happened mid embed").unwrap();
        // simulate crash: status is pending, no chunks/vectors — exactly current state.
        assert_eq!(counts(&s), (0, 0));
        // "restart": a fresh startup scan processes it.
        process_pending(&s, &FakeEmbeddingProvider::new(8)).await.unwrap();
        assert_eq!(s.get_entry(&id).unwrap().embed_status, "ok");
        assert!(counts(&s).0 >= 1);
    }

    /// TC-10: Given embedded entry; When body edited and worker runs; Then
    /// vec_chunks contains vectors only for new chunk ids; old chunk ids gone.
    #[tokio::test]
    async fn tc10_edit_reembeds_only_current_text() {
        let (_d, s) = storage();
        s.apply_embed_model("fake-model", 8).unwrap();
        let fake = FakeEmbeddingProvider::new(8);
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "original text about basil").unwrap();
        process_pending(&s, &fake).await.unwrap();
        let old_chunk_ids: Vec<String> = {
            let conn = s.conn.lock().unwrap();
            let mut st = conn.prepare("SELECT id FROM chunks WHERE entry_id=?1").unwrap();
            let v = st.query_map([&id], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
            v
        };
        s.save_entry(&id, "completely rewritten text about winter").unwrap();
        assert_eq!(s.get_entry(&id).unwrap().embed_status, "pending"); // edit re-queues
        process_pending(&s, &fake).await.unwrap();
        let conn = s.conn.lock().unwrap();
        for old in &old_chunk_ids {
            let gone: i64 = conn
                .query_row("SELECT count(*) FROM vec_chunks WHERE chunk_id=?1", [old], |r| r.get(0))
                .unwrap();
            assert_eq!(gone, 0, "old chunk {old} still indexed");
        }
        let (c, v) = {
            drop(conn);
            counts(&s)
        };
        assert_eq!(c, v);
        assert!(c >= 1);
    }

    /// TC-11: Given embedded entry with a reflection; When entry deleted; Then
    /// its chunks, vec_chunks rows and ai_responses rows are gone (no orphans).
    #[tokio::test]
    async fn tc11_delete_cleans_chunks_vectors_responses() {
        let (_d, s) = storage();
        s.apply_embed_model("fake-model", 8).unwrap();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "to be deleted").unwrap();
        process_pending(&s, &FakeEmbeddingProvider::new(8)).await.unwrap();
        {
            let conn = s.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO ai_responses (id, entry_id, kind, body, context_entry_ids, provider, created_at)
                 VALUES ('r1', ?1, 'reflection', 'x', '[]', 'ollama', 'now')",
                [&id],
            )
            .unwrap();
        }
        s.delete_entry(&id).unwrap();
        let conn = s.conn.lock().unwrap();
        let orphans: i64 = conn
            .query_row(
                "SELECT (SELECT count(*) FROM chunks) + (SELECT count(*) FROM vec_chunks)
                      + (SELECT count(*) FROM ai_responses)",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(orphans, 0);
    }

    /// TC-4: Given embed worker stalled on a slow fake; When save_entry and
    /// list_entries called; Then both return without waiting on the worker.
    #[tokio::test]
    async fn tc4_saving_never_waits_for_embedding() {
        let (_d, s) = storage();
        s.apply_embed_model("fake-model", 8).unwrap();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "first text to keep the worker busy").unwrap();

        let s = Arc::new(s);
        let worker_s = s.clone();
        let slow = FakeEmbeddingProvider { dim: 8, unreachable: false, delay: Duration::from_secs(5) };
        let worker = tokio::spawn(async move {
            let _ = process_pending(worker_s.as_ref(), &slow).await;
        });
        tokio::time::sleep(Duration::from_millis(50)).await; // let the worker enter embed()

        let t0 = std::time::Instant::now();
        s.save_entry(&id, "typing while embedding").unwrap();
        let _ = s.list_entries().unwrap();
        assert!(
            t0.elapsed() < Duration::from_millis(500),
            "editor-path calls blocked for {:?}",
            t0.elapsed()
        );
        worker.abort();
    }

    /// Transient failure: entries stay pending (retry later), not failed.
    #[tokio::test]
    async fn ollama_down_keeps_entries_pending() {
        let (_d, s) = storage();
        s.apply_embed_model("fake-model", 8).unwrap();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "text").unwrap();
        let down = FakeEmbeddingProvider { dim: 8, unreachable: true, delay: Duration::ZERO };
        assert!(matches!(
            process_pending(&s, &down).await,
            Err(EngineError::Transient(_))
        ));
        assert_eq!(s.get_entry(&id).unwrap().embed_status, "pending");
    }
}
