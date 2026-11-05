//! Ollama localhost HTTP API (design-detail.md: /api/tags, /api/embed, /api/chat).

use serde::Deserialize;
use std::time::Duration;

pub const BASE_URL: &str = "http://localhost:11434";
pub const EMBED_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, thiserror::Error)]
pub enum OllamaError {
    #[error("ollama is not reachable at {BASE_URL}")]
    Unreachable,
    #[error("ollama error: {0}")]
    Api(String),
}

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<TagModel>,
}
#[derive(Deserialize)]
struct TagModel {
    name: String,
}

#[derive(Deserialize)]
struct EmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

fn client(timeout: Duration) -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .expect("reqwest client")
}

/// Installed model names, for the settings dropdowns (never auto-selected, D-6).
pub async fn list_models(base_url: &str) -> Result<Vec<String>, OllamaError> {
    let resp = client(Duration::from_secs(5))
        .get(format!("{base_url}/api/tags"))
        .send()
        .await
        .map_err(|_| OllamaError::Unreachable)?;
    let tags: TagsResponse = resp.json().await.map_err(|e| OllamaError::Api(e.to_string()))?;
    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

/// Embed `texts` with `model`. Also used to probe a model's dimension.
pub async fn embed(
    base_url: &str,
    model: &str,
    texts: &[String],
) -> Result<Vec<Vec<f32>>, OllamaError> {
    let resp = client(EMBED_TIMEOUT)
        .post(format!("{base_url}/api/embed"))
        .json(&serde_json::json!({ "model": model, "input": texts }))
        .send()
        .await
        .map_err(|_| OllamaError::Unreachable)?;
    if !resp.status().is_success() {
        return Err(OllamaError::Api(format!(
            "embed failed ({}): is the model pulled? try `ollama pull {model}`",
            resp.status()
        )));
    }
    let body: EmbedResponse = resp.json().await.map_err(|e| OllamaError::Api(e.to_string()))?;
    Ok(body.embeddings)
}

/// Probe a model's embedding dimension with one tiny call (D-6 model selection).
pub async fn probe_dim(base_url: &str, model: &str) -> Result<i64, OllamaError> {
    let out = embed(base_url, model, &["ping".to_string()]).await?;
    out.first()
        .map(|v| v.len() as i64)
        .ok_or_else(|| OllamaError::Api("empty embedding response".into()))
}

// --- trait impls (T-06) ---

use super::{Availability, ChatProvider, ChatRequest, ChatResponse, EmbeddingProvider, ProviderError, ProviderId};

pub const CHAT_TIMEOUT: Duration = Duration::from_secs(120);

impl From<OllamaError> for ProviderError {
    fn from(e: OllamaError) -> Self {
        match e {
            OllamaError::Unreachable => ProviderError::Unreachable(e.to_string()),
            OllamaError::Api(m) => ProviderError::Api(m),
        }
    }
}

pub struct OllamaEmbed {
    pub base_url: String,
    pub model: String,
}

impl EmbeddingProvider for OllamaEmbed {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, ProviderError> {
        Ok(embed(&self.base_url, &self.model, texts).await?)
    }
}

pub struct OllamaChat {
    pub base_url: String,
    pub model: String,
}

#[derive(Deserialize)]
struct ChatApiResponse {
    message: ChatApiMessage,
}
#[derive(Deserialize)]
struct ChatApiMessage {
    content: String,
}

impl ChatProvider for OllamaChat {
    fn id(&self) -> ProviderId {
        ProviderId::Ollama
    }

    fn is_cloud(&self) -> bool {
        false
    }

    async fn available(&self) -> Availability {
        match list_models(&self.base_url).await {
            Ok(models) if models.iter().any(|m| m == &self.model) => Availability::Ok,
            Ok(_) => Availability::Unavailable {
                reason: format!("model not installed; try `ollama pull {}`", self.model),
            },
            Err(e) => Availability::Unavailable { reason: e.to_string() },
        }
    }

    async fn complete(&self, req: ChatRequest) -> Result<ChatResponse, ProviderError> {
        let mut body = serde_json::json!({
            "model": self.model,
            "stream": false,
            "messages": [
                {"role": "system", "content": req.system},
                {"role": "user", "content": req.user},
            ],
        });
        if let Some(schema) = &req.json_schema {
            body["format"] = schema.clone(); // structured outputs [verified live 2026-11-05]
        }
        let resp = client(CHAT_TIMEOUT)
            .post(format!("{}/api/chat", self.base_url))
            .json(&body)
            .send()
            .await
            .map_err(|_| OllamaError::Unreachable)?;
        if !resp.status().is_success() {
            return Err(ProviderError::Api(format!(
                "chat failed ({}): is the model pulled? try `ollama pull {}`",
                resp.status(),
                self.model
            )));
        }
        let body: ChatApiResponse = resp
            .json()
            .await
            .map_err(|e| ProviderError::Parse(e.to_string()))?;
        Ok(ChatResponse {
            text: body.message.content,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn availability_false_when_port_closed() {
        let chat = OllamaChat {
            base_url: "http://localhost:59999".into(),
            model: "whatever".into(),
        };
        assert!(matches!(chat.available().await, Availability::Unavailable { .. }));
        assert!(!chat.is_cloud());
    }

    /// Live smoke test — run with: OLLAMA_TEST=1 cargo test -- --ignored
    #[tokio::test]
    #[ignore]
    async fn live_ollama_embed_and_chat_roundtrip() {
        if std::env::var("OLLAMA_TEST").as_deref() != Ok("1") {
            return;
        }
        let e = OllamaEmbed {
            base_url: BASE_URL.into(),
            model: "nomic-embed-text:latest".into(),
        };
        let vecs = e.embed(&["hello world".into()]).await.unwrap();
        assert!(!vecs.is_empty() && vecs[0].len() > 100);

        let c = OllamaChat {
            base_url: BASE_URL.into(),
            model: "qwen3:4b-instruct".into(),
        };
        let resp = c
            .complete(ChatRequest {
                system: "Reply with exactly one short sentence.".into(),
                user: "Say hi.".into(),
                json_schema: None,
            })
            .await
            .unwrap();
        assert!(!resp.text.trim().is_empty());
    }
}
