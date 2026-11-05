//! Prompt/context layer (C-8): assembles the AI panel (F-4).

pub mod persona;

use crate::memory::retrieval::{self, RelatedEntry};
use crate::providers::{AnyChatProvider, Availability, ProviderError};
use crate::storage::{AiResponse, Storage};
use persona::{ContextItem, DEFAULT_PERSONA};
use serde::Serialize;

const RELATED_K: usize = 3; // provisional — tests.md Measurements

/// Everything the AI panel can show. Typed states, never raw error strings (AC-13).
#[derive(Debug, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum PanelState {
    ModelsNotChosen,
    Thinking,
    NothingToRelate,
    ProviderUnavailable { reason: String },
    Ready {
        related: Vec<RelatedEntry>,
        reflection: AiResponse,
    },
}

/// Build the panel for an entry. `force_new` regenerates even when a stored
/// reflection exists (AC-12 regenerate).
pub async fn build_ai_panel(
    storage: &Storage,
    provider: &AnyChatProvider,
    entry_id: &str,
    force_new: bool,
) -> Result<PanelState, String> {
    let settings = storage.settings_view().map_err(|e| e.to_string())?;
    // Embeddings are always needed; an Ollama chat additionally needs a chat model.
    if settings.embed_model.is_none() || (settings.chat_model.is_none() && !provider.is_cloud()) {
        return Ok(PanelState::ModelsNotChosen);
    }

    let entry = storage.get_entry(entry_id).map_err(|e| e.to_string())?;
    match entry.embed_status.as_str() {
        "pending" => return Ok(PanelState::Thinking),
        "failed" => {
            return Ok(PanelState::ProviderUnavailable {
                reason: "This entry couldn't be indexed — check the embedding model in settings."
                    .into(),
            })
        }
        _ => {}
    }

    let Some(query_vec) =
        retrieval::query_vector_for_entry(storage, entry_id).map_err(|e| e.to_string())?
    else {
        return Ok(PanelState::NothingToRelate); // empty body → no chunks
    };

    // No-cloud filter decided by the ACTIVE provider (AC-10).
    let related = retrieval::related_entries(
        storage,
        &query_vec,
        entry_id,
        provider.is_cloud(),
        RELATED_K,
    )
    .map_err(|e| e.to_string())?;
    if related.is_empty() {
        return Ok(PanelState::NothingToRelate);
    }

    // Reuse a stored reflection unless regenerating.
    if !force_new
        && let Some(existing) = storage.latest_reflection(entry_id).map_err(|e| e.to_string())?
    {
        return Ok(PanelState::Ready {
            related,
            reflection: existing,
        });
    }

    if let Availability::Unavailable { reason } = provider.available().await {
        return Ok(PanelState::ProviderUnavailable { reason });
    }

    let context: Vec<ContextItem> = related
        .iter()
        .map(|r| ContextItem {
            date: r.created_at.chars().take(10).collect(),
            snippet: r.snippet.clone(),
        })
        .collect();
    let req = DEFAULT_PERSONA.reflection_request(&entry.body, &context);

    let text = match provider.complete(req).await {
        Ok(resp) => resp.text,
        Err(ProviderError::Unreachable(reason)) => {
            return Ok(PanelState::ProviderUnavailable { reason })
        }
        Err(e) => return Ok(PanelState::ProviderUnavailable { reason: e.to_string() }),
    };

    let context_ids: Vec<String> = related.iter().map(|r| r.entry_id.clone()).collect();
    let provider_name = if provider.is_cloud() { "claude_cli" } else { "ollama" };
    let reflection = storage
        .insert_reflection(entry_id, &text, &context_ids, provider_name)
        .map_err(|e| e.to_string())?;

    Ok(PanelState::Ready {
        related,
        reflection,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::process_pending;
    use crate::memory::tests::load_fixtures;
    use crate::providers::fakes::{FakeChatProvider, FakeEmbeddingProvider};

    async fn fixture_world(cloud: bool) -> (tempfile::TempDir, Storage, Vec<String>, AnyChatProvider) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        s.apply_embed_model("fake-model", 512).unwrap();
        s.set_chat_model("fake-chat").unwrap();
        let ids = load_fixtures(&s);
        process_pending(&s, &FakeEmbeddingProvider::new(512)).await.unwrap();
        let provider = AnyChatProvider::Fake(FakeChatProvider {
            cloud,
            ..Default::default()
        });
        (dir, s, ids, provider)
    }

    fn fake_requests(provider: &AnyChatProvider) -> Vec<crate::providers::ChatRequest> {
        match provider {
            AnyChatProvider::Fake(f) => f.requests.lock().unwrap().clone(),
            _ => unreachable!(),
        }
    }

    /// TC-7: Given fixture journal embedded; When new interview-themed entry is
    /// saved and panel requested; Then top-K related past entries include the
    /// March interview entry, each with source entry id.
    #[tokio::test]
    async fn tc7_related_memories_cite_sources() {
        let (_d, s, ids, provider) = fixture_world(false).await;
        let fx12 = ids.last().unwrap(); // "New interview nerves, old story…"
        let panel = build_ai_panel(&s, &provider, fx12, false).await.unwrap();
        let PanelState::Ready { related, reflection } = panel else {
            panic!("expected Ready, got other state");
        };
        assert_eq!(related.len(), 3);
        // The March interview arc (fx-01 nerves / fx-02 "it went well") must surface.
        let march_arc = [&ids[0], &ids[1]];
        assert!(
            related.iter().any(|r| march_arc.contains(&&r.entry_id)),
            "expected a March interview entry among: {:?}",
            related.iter().map(|r| &r.snippet).collect::<Vec<_>>()
        );
        assert!(related.iter().all(|r| !r.entry_id.is_empty()));
        assert!(!reflection.body.is_empty());
    }

    /// TC-9: reflection stored with non-empty context ids, and those ids'
    /// snippets were in the prompt the provider actually received.
    #[tokio::test]
    async fn tc9_reflection_context_is_honest() {
        let (_d, s, ids, provider) = fixture_world(false).await;
        let fx12 = ids.last().unwrap();
        let panel = build_ai_panel(&s, &provider, fx12, false).await.unwrap();
        let PanelState::Ready { related, reflection } = panel else {
            panic!("expected Ready");
        };
        assert!(!reflection.context_entry_ids.is_empty());
        let stored = s.latest_reflection(fx12).unwrap().unwrap();
        assert_eq!(stored.context_entry_ids, reflection.context_entry_ids);
        // The prompt really contained each related snippet (prefix, dates included).
        let req = &fake_requests(&provider)[0];
        for r in &related {
            let probe: String = r.snippet.chars().take(40).collect();
            assert!(req.user.contains(&probe), "snippet missing from prompt: {probe}");
        }
    }

    /// TC-13: flagged entry text never reaches a cloud provider's prompt; the
    /// same journal with a local provider may use it.
    #[tokio::test]
    async fn tc13_no_cloud_text_never_reaches_cloud_prompt() {
        let flagged_marker = "health scare results"; // unique to fx-05 (no_cloud)
        {
            let (_d, s, ids, cloud) = fixture_world(true).await;
            let fx12 = ids.last().unwrap();
            let _ = build_ai_panel(&s, &cloud, fx12, false).await.unwrap();
            for req in fake_requests(&cloud) {
                assert!(
                    !req.user.contains(flagged_marker) && !req.system.contains(flagged_marker),
                    "no_cloud text leaked into cloud prompt"
                );
            }
        }
        {
            // Sanity: on-device, the flagged entry is allowed to appear for a
            // query that targets it directly.
            let (_d, s, _ids, local) = fixture_world(false).await;
            let probe = s.create_entry().unwrap().id;
            s.save_entry(&probe, "waiting for the specialist about the health scare results")
                .unwrap();
            process_pending(&s, &FakeEmbeddingProvider::new(512)).await.unwrap();
            let _ = build_ai_panel(&s, &local, &probe, false).await.unwrap();
            let reqs = fake_requests(&local);
            assert!(
                reqs.iter().any(|r| r.user.contains(flagged_marker)),
                "on-device mode should be able to use the flagged entry"
            );
        }
    }

    /// TC-8: empty journal → first entry has nothing to relate, no error.
    #[tokio::test]
    async fn tc8_first_entry_has_nothing_to_relate() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        s.apply_embed_model("fake-model", 512).unwrap();
        s.set_chat_model("fake-chat").unwrap();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "my very first entry").unwrap();
        process_pending(&s, &FakeEmbeddingProvider::new(512)).await.unwrap();
        let provider = AnyChatProvider::Fake(FakeChatProvider::default());
        let panel = build_ai_panel(&s, &provider, &id, false).await.unwrap();
        assert!(matches!(panel, PanelState::NothingToRelate));
        assert!(fake_requests(&provider).is_empty(), "no provider call expected");
    }

    /// AC-16 panel half: models not chosen → ModelsNotChosen, zero provider calls.
    #[tokio::test]
    async fn models_not_chosen_blocks_ai() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, "hello").unwrap();
        let provider = AnyChatProvider::Fake(FakeChatProvider::default());
        let panel = build_ai_panel(&s, &provider, &id, false).await.unwrap();
        assert!(matches!(panel, PanelState::ModelsNotChosen));
        assert!(fake_requests(&provider).is_empty());
    }

    /// TC-21 evidence (manual AC-14, live models): generates a real reflection for
    /// a distress-flavored entry and prints it for human review.
    /// Run: OLLAMA_TEST=1 cargo test --lib live_distress -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live_distress_reflection_for_manual_review() {
        if std::env::var("OLLAMA_TEST").as_deref() != Ok("1") {
            return;
        }
        use crate::providers::ollama;
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        let dim = ollama::probe_dim(ollama::BASE_URL, "nomic-embed-text:latest").await.unwrap();
        s.apply_embed_model("nomic-embed-text:latest", dim).unwrap();
        s.set_chat_model("qwen3:4b-instruct").unwrap();
        let ids = load_fixtures(&s);
        let embedder = ollama::OllamaEmbed {
            base_url: ollama::BASE_URL.into(),
            model: "nomic-embed-text:latest".into(),
        };
        process_pending(&s, &embedder).await.unwrap();
        // A new entry in serious distress:
        let id = s.create_entry().unwrap().id;
        s.save_entry(
            &id,
            "I can't stop crying tonight. Everything feels pointless and I'm so tired of \
             pretending I'm fine. I don't see how tomorrow gets better.",
        )
        .unwrap();
        process_pending(&s, &embedder).await.unwrap();
        let provider = AnyChatProvider::Ollama(ollama::OllamaChat {
            base_url: ollama::BASE_URL.into(),
            model: "qwen3:4b-instruct".into(),
        });
        let t0 = std::time::Instant::now();
        let panel = build_ai_panel(&s, &provider, &id, false).await.unwrap();
        println!("MEASURE reflection latency: {:?}", t0.elapsed());
        match panel {
            PanelState::Ready { reflection, related } => {
                println!("--- DISTRESS REFLECTION (live qwen3:4b-instruct) ---");
                println!("{}", reflection.body);
                println!("--- context: {:?}", related.iter().map(|r| &r.created_at).collect::<Vec<_>>());
            }
            other => println!("panel state: {other:?}"),
        }
        let _ = ids;
    }

    /// TC-16 backend half: regenerate stores a new reflection and dismisses nothing
    /// implicitly; dismiss flags the row.
    #[tokio::test]
    async fn regenerate_and_dismiss_roundtrip() {
        let (_d, s, ids, provider) = fixture_world(false).await;
        let fx12 = ids.last().unwrap();
        let PanelState::Ready { reflection: first, .. } =
            build_ai_panel(&s, &provider, fx12, false).await.unwrap()
        else {
            panic!()
        };
        // Reuse without force_new:
        let PanelState::Ready { reflection: same, .. } =
            build_ai_panel(&s, &provider, fx12, false).await.unwrap()
        else {
            panic!()
        };
        assert_eq!(first.id, same.id);
        // Regenerate:
        s.dismiss_response(&first.id).unwrap();
        let PanelState::Ready { reflection: second, .. } =
            build_ai_panel(&s, &provider, fx12, true).await.unwrap()
        else {
            panic!()
        };
        assert_ne!(first.id, second.id);
        // Entry untouched by dismiss.
        assert!(s.get_entry(fx12).unwrap().body.contains("interview"));
    }
}
