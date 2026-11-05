//! Semantic search (C-11, F-9). `search_entries` is instant (no chat call);
//! the AI answer is a separate, independent call (NFR: results never wait).

use crate::memory::retrieval;
use crate::providers::{AnyChatProvider, ChatRequest, EmbeddingProvider, ProviderError};
use crate::storage::Storage;
use serde::Serialize;

pub const SEARCH_K: usize = 8; // provisional — tests.md Measurements

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub entry_id: String,
    pub snippet: String,
    pub created_at: String,
    pub distance: f64,
}

#[derive(Debug, Serialize)]
pub struct SearchOutput {
    pub results: Vec<SearchResult>,
    /// Matches hidden because the active provider is cloud and they are flagged
    /// never-send-to-cloud (AC-23); the UI explains this count.
    pub hidden_count: usize,
}

#[derive(Debug, Serialize)]
pub struct SearchAnswer {
    pub answer: String,
    /// Dates of the entries the model was shown — the audit trail (AC-22).
    pub cited_dates: Vec<String>,
}

pub async fn search_entries<E: EmbeddingProvider>(
    storage: &Storage,
    embedder: &E,
    query: &str,
    cloud: bool,
) -> Result<SearchOutput, String> {
    let qvec = embedder
        .embed(&[query.to_string()])
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or("empty query embedding")?;

    let filtered = retrieval::related_entries(storage, &qvec, "", cloud, SEARCH_K)
        .map_err(|e| e.to_string())?;
    let hidden_count = if cloud {
        let unfiltered = retrieval::related_entries(storage, &qvec, "", false, SEARCH_K)
            .map_err(|e| e.to_string())?;
        unfiltered
            .iter()
            .filter(|u| !filtered.iter().any(|f| f.entry_id == u.entry_id))
            .count()
    } else {
        0
    };

    Ok(SearchOutput {
        results: filtered
            .into_iter()
            .map(|r| SearchResult {
                entry_id: r.entry_id,
                snippet: r.snippet,
                created_at: r.created_at,
                distance: r.distance,
            })
            .collect(),
        hidden_count,
    })
}

const ANSWER_SYSTEM: &str = "\
You answer a question someone asks about their own private journal.
Use ONLY the dated excerpts provided — they are your entire memory.
Answer in 1–2 warm, plain sentences and mention the relevant date(s).
If the excerpts don't answer the question, say so briefly.";

pub async fn search_answer(
    storage: &Storage,
    provider: &AnyChatProvider,
    query: &str,
    entry_ids: &[String],
) -> Result<SearchAnswer, ProviderError> {
    let mut excerpts = Vec::new();
    let mut cited_dates = Vec::new();
    for id in entry_ids.iter().take(SEARCH_K) {
        if let Ok(entry) = storage.get_entry(id) {
            let date: String = entry.created_at.chars().take(10).collect();
            let text: String = entry.body.chars().take(300).collect();
            excerpts.push(format!("- [{date}] {text}"));
            cited_dates.push(date);
        }
    }
    let user = format!(
        "Question: {query}\n\nDated excerpts:\n{}\n\nAnswer now.",
        excerpts.join("\n")
    );
    let resp = provider
        .complete(ChatRequest {
            system: ANSWER_SYSTEM.to_string(),
            user,
            json_schema: None,
        })
        .await?;
    Ok(SearchAnswer {
        answer: resp.text.trim().to_string(),
        cited_dates,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::process_pending;
    use crate::memory::tests::load_fixtures;
    use crate::providers::fakes::{FakeChatProvider, FakeEmbeddingProvider};

    async fn fixture_storage() -> (tempfile::TempDir, Storage, Vec<String>) {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        s.apply_embed_model("fake-model", 512).unwrap();
        let ids = load_fixtures(&s);
        process_pending(&s, &FakeEmbeddingProvider::new(512)).await.unwrap();
        (dir, s, ids)
    }

    /// TC-27: Given fixture journal embedded; When search("anxious about work");
    /// Then interview/work entries rank above gym/family; results carry date + snippet.
    #[tokio::test]
    async fn tc27_work_query_ranks_work_entries_first() {
        let (_d, s, _ids) = fixture_storage().await;
        let out = search_entries(
            &s,
            &FakeEmbeddingProvider::new(512),
            "anxious nerves interview panel at work",
            false,
        )
        .await
        .unwrap();
        assert!(out.results.len() >= 3);
        let top: String = out.results[..3].iter().map(|r| r.snippet.to_lowercase()).collect();
        assert!(
            top.contains("interview") || top.contains("northwind"),
            "top-3 should be work/interview themed: {top}"
        );
        assert!(out.results.iter().all(|r| !r.created_at.is_empty() && !r.snippet.is_empty()));
        assert_eq!(out.hidden_count, 0);
    }

    /// TC-28: Given top search results and a fake chat provider; When
    /// search_answer runs; Then a short answer with cited dates returns, and the
    /// prompt contained only those excerpts.
    #[tokio::test]
    async fn tc28_answer_cites_only_provided_entries() {
        let (_d, s, ids) = fixture_storage().await;
        let fake = AnyChatProvider::Fake(FakeChatProvider::default());
        let picked = vec![ids[0].clone(), ids[1].clone()]; // the interview arc
        let ans = search_answer(&s, &fake, "when did I last worry about an interview?", &picked)
            .await
            .unwrap();
        assert!(!ans.answer.is_empty());
        assert_eq!(ans.cited_dates, vec!["2026-03-02", "2026-03-06"]);
        let req = match &fake {
            AnyChatProvider::Fake(f) => f.requests.lock().unwrap()[0].user.clone(),
            _ => unreachable!(),
        };
        assert!(req.contains("2026-03-02") && req.contains("2026-03-06"));
        // Only the two picked entries' text may appear — probe a third entry's text.
        assert!(!req.contains("gym session"), "unpicked entry leaked into the prompt");
    }

    /// M2 live smoke (verify-stage evidence): real embeddings, real mood pass,
    /// real search answer. Run: OLLAMA_TEST=1 cargo test --lib live_m2 -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live_m2_mood_and_search_answer() {
        if std::env::var("OLLAMA_TEST").as_deref() != Ok("1") {
            return;
        }
        use crate::memory::mood::process_pending_moods;
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

        // Live mood over the whole fixture arc (manual M-1 evidence).
        let chat = AnyChatProvider::Ollama(ollama::OllamaChat {
            base_url: ollama::BASE_URL.into(),
            model: "qwen3:4b-instruct".into(),
        });
        let t0 = std::time::Instant::now();
        let n = process_pending_moods(&s, &chat, None).await.unwrap();
        println!("MEASURE live moods: {n} entries in {:?}", t0.elapsed());
        for sum in s.list_entries().unwrap() {
            println!(
                "MOOD {} level={:?} label={:?} :: {:.60}",
                sum.created_at.chars().take(10).collect::<String>(),
                sum.mood_level,
                sum.mood_label,
                sum.preview
            );
        }

        // Live search + answer (AC-21/22 with real models).
        let out = search_entries(&s, &embedder, "when did I last feel anxious about an interview?", false)
            .await
            .unwrap();
        println!("SEARCH top: {:?}", out.results.iter().map(|r| &r.snippet).take(3).collect::<Vec<_>>());
        let ids_top: Vec<String> = out.results.iter().take(3).map(|r| r.entry_id.clone()).collect();
        let t1 = std::time::Instant::now();
        let ans = search_answer(&s, &chat, "when did I last feel anxious about an interview?", &ids_top)
            .await
            .unwrap();
        println!("MEASURE answer latency: {:?}", t1.elapsed());
        println!("ANSWER: {} (from {:?})", ans.answer, ans.cited_dates);
        assert!(!ans.answer.is_empty());
        let _ = ids;
    }

    /// TC-29: Given a no-cloud entry matching the query; When provider=cloud and
    /// search runs; Then the flagged entry is absent and hidden_count=1; on-device
    /// search includes it. Also: search makes no chat calls at all.
    #[tokio::test]
    async fn tc29_cloud_search_hides_flagged_and_counts_them() {
        let (_d, s, ids) = fixture_storage().await;
        let flagged = &ids[4]; // fx-05, no_cloud, "health scare … specialist"
        let embedder = FakeEmbeddingProvider::new(512);
        let query = "waiting for the health scare specialist results";

        let local = search_entries(&s, &embedder, query, false).await.unwrap();
        assert!(local.results.iter().any(|r| &r.entry_id == flagged));
        assert_eq!(local.hidden_count, 0);

        let cloud = search_entries(&s, &embedder, query, true).await.unwrap();
        assert!(cloud.results.iter().all(|r| &r.entry_id != flagged));
        assert_eq!(cloud.hidden_count, 1);
    }
}
