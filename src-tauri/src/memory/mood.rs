//! Mood engine (C-9, ADR-0004): classifies entries via the ACTIVE chat provider;
//! `no_cloud` entries never reach a cloud provider (local fallback or unset).

use crate::providers::{AnyChatProvider, ChatRequest, ProviderError};
use crate::storage::Storage;
use serde::Deserialize;

use super::EngineError;

#[derive(Debug, Deserialize)]
pub struct Mood {
    pub level: i64,
    #[serde(default)]
    pub label: Option<String>,
}

const SYSTEM: &str = "\
You classify the mood of a private journal entry.
Reply ONLY with JSON: {\"level\": <1-5>, \"label\": \"<one lowercase emotion word>\"}.
level: 1=rough, 2=low, 3=okay, 4=good, 5=great. No other text.";

fn schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "level": {"type": "integer", "minimum": 1, "maximum": 5},
            "label": {"type": "string"}
        },
        "required": ["level"]
    })
}

/// Tolerant parse: accept raw JSON, or JSON embedded in fences/prose.
fn parse_mood(text: &str) -> Option<Mood> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    let mood: Mood = serde_json::from_str(&text[start..=end]).ok()?;
    (1..=5).contains(&mood.level).then_some(mood)
}

async fn classify(provider: &AnyChatProvider, body: &str) -> Result<Option<Mood>, ProviderError> {
    let resp = provider
        .complete(ChatRequest {
            system: SYSTEM.to_string(),
            user: body.to_string(),
            json_schema: Some(schema()),
        })
        .await?;
    Ok(parse_mood(&resp.text))
}

/// One pass over mood-pending entries. Provider rule (ADR-0004):
/// unflagged → `active`; flagged + cloud active → `local` if present, else skip
/// (mood stays unset, status 'ok' so the queue drains until the next edit).
pub async fn process_pending_moods(
    storage: &Storage,
    active: &AnyChatProvider,
    local: Option<&AnyChatProvider>,
) -> Result<usize, EngineError> {
    let mut processed = 0;
    loop {
        let next: Option<(String, String, bool)> = {
            let conn = storage.conn.lock().unwrap();
            conn.query_row(
                "SELECT id, body, no_cloud FROM entries
                 WHERE mood_status='pending' AND (mood_source IS NULL OR mood_source='ai')
                 ORDER BY updated_at ASC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? != 0)),
            )
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(crate::storage::StorageError::from(other)),
            })?
        };
        let Some((id, body, no_cloud)) = next else {
            return Ok(processed);
        };

        if body.trim().is_empty() {
            mark(storage, &id, "ok")?; // nothing to classify
            continue;
        }

        // ADR-0004: flagged text must never reach a cloud provider.
        let provider = if no_cloud && active.is_cloud() {
            match local {
                Some(l) if !l.is_cloud() => l,
                _ => {
                    log::info!("mood skipped for no-cloud entry {id}: no local chat model");
                    mark(storage, &id, "ok")?;
                    continue;
                }
            }
        } else {
            active
        };

        match classify(provider, &body).await {
            Ok(Some(mood)) => {
                storage.set_mood_ai(&id, mood.level, mood.label.as_deref())?;
                mark(storage, &id, "ok")?;
                processed += 1;
            }
            Ok(None) => {
                log::warn!("mood parse failed for entry {id}");
                mark(storage, &id, "failed")?;
            }
            Err(ProviderError::Unreachable(m)) => return Err(EngineError::Transient(m)),
            Err(e) => {
                log::warn!("mood classification failed for entry {id}: {e}");
                mark(storage, &id, "failed")?;
            }
        }
    }
}

fn mark(storage: &Storage, id: &str, status: &str) -> Result<(), EngineError> {
    let conn = storage.conn.lock().unwrap();
    conn.execute(
        "UPDATE entries SET mood_status=?2 WHERE id=?1 AND mood_source IS NOT 'manual'",
        rusqlite::params![id, status],
    )
    .map_err(crate::storage::StorageError::from)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::fakes::FakeChatProvider;

    fn storage() -> (tempfile::TempDir, Storage) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        (dir, s)
    }

    fn fake(cloud: bool, canned: &str) -> AnyChatProvider {
        AnyChatProvider::Fake(FakeChatProvider {
            cloud,
            canned: Some(canned.into()),
            ..Default::default()
        })
    }

    fn requests(p: &AnyChatProvider) -> Vec<String> {
        match p {
            AnyChatProvider::Fake(f) => f.requests.lock().unwrap().iter().map(|r| r.user.clone()).collect(),
            _ => unreachable!(),
        }
    }

    /// TC-23: Given models selected and a clearly positive saved entry, fake chat
    /// returning {"level":5,"label":"proud"}; When the worker runs; Then the entry
    /// has mood_level 5, label "proud", mood_source 'ai', mood_status ok.
    #[tokio::test]
    async fn tc23_positive_entry_gets_ai_mood() {
        let (_d, s) = storage();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "The demo went great, I'm proud.").unwrap();
        let active = fake(false, r#"{"level": 5, "label": "proud"}"#);
        let n = process_pending_moods(&s, &active, None).await.unwrap();
        assert_eq!(n, 1);
        let e = s.get_entry(&id).unwrap();
        assert_eq!(e.mood_level, Some(5));
        assert_eq!(e.mood_label.as_deref(), Some("proud"));
        assert_eq!(e.mood_source.as_deref(), Some("ai"));
    }

    /// TC-24 (full): manual mood survives edit + reprocess.
    #[tokio::test]
    async fn tc24_manual_wins_through_reprocessing() {
        let (_d, s) = storage();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "mixed day").unwrap();
        let active = fake(false, r#"{"level": 4}"#);
        process_pending_moods(&s, &active, None).await.unwrap();
        s.set_mood(&id, 2, None).unwrap();
        s.save_entry(&id, "mixed day, edited").unwrap();
        process_pending_moods(&s, &active, None).await.unwrap();
        let e = s.get_entry(&id).unwrap();
        assert_eq!(e.mood_level, Some(2));
        assert_eq!(e.mood_source.as_deref(), Some("manual"));
    }

    /// TC-37: Given provider=cloud (fake) and one flagged + one unflagged pending
    /// entry; When the mood pass runs; Then unflagged classified via cloud fake,
    /// flagged via local fake — flagged text never reaches the cloud fake.
    #[tokio::test]
    async fn tc37_no_cloud_entries_never_reach_cloud_provider() {
        let (_d, s) = storage();
        let flagged = s.create_entry().unwrap().id;
        s.save_entry(&flagged, "SECRET-FLAGGED health worry").unwrap();
        s.set_no_cloud(&flagged, true).unwrap();
        let open = s.create_entry().unwrap().id;
        s.save_entry(&open, "ordinary open entry").unwrap();

        let cloud = fake(true, r#"{"level": 4}"#);
        let local = fake(false, r#"{"level": 3, "label": "calm"}"#);
        process_pending_moods(&s, &cloud, Some(&local)).await.unwrap();

        assert_eq!(s.get_entry(&open).unwrap().mood_level, Some(4));
        let f = s.get_entry(&flagged).unwrap();
        assert_eq!(f.mood_level, Some(3));
        assert_eq!(f.mood_label.as_deref(), Some("calm"));
        let cloud_saw = requests(&cloud).join("\n");
        assert!(!cloud_saw.contains("SECRET-FLAGGED"), "flagged text leaked to cloud");

        // Variant: no local model → flagged mood stays unset, queue drains.
        let flagged2 = s.create_entry().unwrap().id;
        s.save_entry(&flagged2, "SECRET-FLAGGED again").unwrap();
        s.set_no_cloud(&flagged2, true).unwrap();
        process_pending_moods(&s, &cloud, None).await.unwrap();
        let f2 = s.get_entry(&flagged2).unwrap();
        assert_eq!(f2.mood_level, None);
        assert!(!requests(&cloud).join("\n").contains("again"));
    }

    /// Malformed JSON → mood_status failed, fields untouched, pass continues.
    #[tokio::test]
    async fn malformed_mood_json_fails_cleanly() {
        let (_d, s) = storage();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "whatever").unwrap();
        let active = fake(false, "this is not json at all");
        process_pending_moods(&s, &active, None).await.unwrap();
        let e = s.get_entry(&id).unwrap();
        assert_eq!(e.mood_level, None);
        let conn = s.conn.lock().unwrap();
        let st: String = conn
            .query_row("SELECT mood_status FROM entries WHERE id=?1", [&id], |r| r.get(0))
            .unwrap();
        assert_eq!(st, "failed");
    }
}
