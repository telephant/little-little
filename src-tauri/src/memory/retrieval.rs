//! Retrieval (C-6): KNN over vec_chunks, deduped to the best chunk per entry.
//! The no-cloud filter lives HERE, not in the prompt layer, so flagged text can
//! never reach context assembly when the active chat provider is cloud (AC-10).

use crate::storage::{Result, Storage};
use serde::Serialize;

/// Oversample factor: KNN returns chunks, we dedupe to entries and filter.
const OVERSAMPLE: usize = 8;

#[derive(Debug, Clone, Serialize)]
pub struct RelatedEntry {
    pub entry_id: String,
    pub snippet: String,
    pub distance: f64,
    pub created_at: String,
}

/// Mean of an entry's chunk vectors — the query vector for "related to this entry".
pub fn query_vector_for_entry(storage: &Storage, entry_id: &str) -> Result<Option<Vec<f32>>> {
    let conn = storage.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT v.embedding FROM vec_chunks v
         JOIN chunks c ON c.id = v.chunk_id WHERE c.entry_id = ?1",
    )?;
    let blobs: Vec<Vec<u8>> = stmt
        .query_map([entry_id], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    if blobs.is_empty() {
        return Ok(None);
    }
    let dim = blobs[0].len() / 4;
    let mut mean = vec![0.0f32; dim];
    for blob in &blobs {
        let (words, _rest) = blob.as_chunks::<4>();
        for (i, bytes) in words.iter().enumerate() {
            mean[i] += f32::from_le_bytes(*bytes);
        }
    }
    let n = blobs.len() as f32;
    mean.iter_mut().for_each(|x| *x /= n);
    Ok(Some(mean))
}

/// Top-K related entries for a query vector.
/// `exclude_entry`: the entry being written (never relate to itself).
/// `cloud`: when true, `no_cloud` entries are filtered out in SQL (AC-10).
pub fn related_entries(
    storage: &Storage,
    query_vec: &[f32],
    exclude_entry: &str,
    cloud: bool,
    k: usize,
) -> Result<Vec<RelatedEntry>> {
    let conn = storage.conn.lock().unwrap();
    let query_json = serde_json::to_string(query_vec).unwrap();
    // KNN first (virtual table), then join + filter, dedupe to best chunk per entry.
    let mut stmt = conn.prepare(
        "SELECT c.entry_id, c.text, m.distance, e.created_at
         FROM (SELECT chunk_id, distance FROM vec_chunks
               WHERE embedding MATCH ?1 AND k = ?2) m
         JOIN chunks c ON c.id = m.chunk_id
         JOIN entries e ON e.id = c.entry_id
         WHERE e.id != ?3 AND (?4 = 0 OR e.no_cloud = 0)
         ORDER BY m.distance ASC",
    )?;
    let rows: Vec<(String, String, f64, String)> = stmt
        .query_map(
            rusqlite::params![query_json, (k * OVERSAMPLE) as i64, exclude_entry, cloud as i64],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?
        .collect::<rusqlite::Result<_>>()?;

    let mut out: Vec<RelatedEntry> = Vec::new();
    for (entry_id, text, distance, created_at) in rows {
        if out.iter().any(|r| r.entry_id == entry_id) {
            continue; // keep only the best (closest) chunk per entry
        }
        out.push(RelatedEntry {
            entry_id,
            snippet: text.chars().take(240).collect(),
            distance,
            created_at,
        });
        if out.len() == k {
            break;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::process_pending;
    use crate::memory::tests::load_fixtures;
    use crate::providers::fakes::FakeEmbeddingProvider;
    use crate::storage::Storage;

    async fn fixture_storage() -> (tempfile::TempDir, Storage, Vec<String>) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        s.apply_embed_model("fake-model", 512).unwrap();
        let ids = load_fixtures(&s);
        process_pending(&s, &FakeEmbeddingProvider::new(512)).await.unwrap();
        (dir, s, ids)
    }

    /// Retrieval sanity for T-07's done-condition: an interview-themed entry
    /// relates to the other interview entries, not the gym ones; distances logged
    /// for the Measurements table.
    #[tokio::test]
    async fn interview_entry_relates_to_interview_entries() {
        let (_d, s, ids) = fixture_storage().await;
        // fx-12 is the last fixture: "New interview nerves, old story…"
        let fx12 = ids.last().unwrap();
        let qv = query_vector_for_entry(&s, fx12).unwrap().unwrap();
        let related = related_entries(&s, &qv, fx12, false, 3).unwrap();
        assert_eq!(related.len(), 3);
        for r in &related {
            println!("MEASURE related: dist={:.4} created={} snippet={:.60}", r.distance, r.created_at, r.snippet);
        }
        let texts: String = related.iter().map(|r| r.snippet.to_lowercase()).collect();
        assert!(texts.contains("interview"), "top results should mention interviews: {texts}");
        // Never relates to itself.
        assert!(related.iter().all(|r| &r.entry_id != fx12));
    }

    /// TC-13 (retrieval half): the no-cloud entry disappears when cloud=true.
    /// fx-05 is no_cloud and mentions an "interview with the specialist".
    #[tokio::test]
    async fn no_cloud_entries_filtered_when_cloud() {
        let (_d, s, ids) = fixture_storage().await;
        let fx12 = ids.last().unwrap();
        let no_cloud_id = &ids[4]; // fx-05
        let qv = query_vector_for_entry(&s, fx12).unwrap().unwrap();

        let local = related_entries(&s, &qv, fx12, false, 10).unwrap();
        assert!(
            local.iter().any(|r| &r.entry_id == no_cloud_id),
            "sanity: flagged entry should be retrievable on-device"
        );
        let cloud = related_entries(&s, &qv, fx12, true, 10).unwrap();
        assert!(
            cloud.iter().all(|r| &r.entry_id != no_cloud_id),
            "flagged entry leaked into cloud context"
        );
    }

    #[tokio::test]
    async fn entry_without_vectors_has_no_query_vector() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        s.apply_embed_model("fake-model", 8).unwrap();
        let id = s.create_entry().unwrap().id;
        assert!(query_vector_for_entry(&s, &id).unwrap().is_none());
    }
}
