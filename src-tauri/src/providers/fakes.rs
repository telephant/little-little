//! Deterministic fakes for downstream tests (T-07/T-08). Test-only.

use super::{Availability, ChatProvider, ChatRequest, ChatResponse, EmbeddingProvider, ProviderError, ProviderId};
use std::sync::Mutex;

/// Deterministic vectors from token hashing: same text → same vector,
/// shared words → nearby vectors. Dimension is configurable.
pub struct FakeEmbeddingProvider {
    pub dim: usize,
    /// When true, every call fails as if Ollama were down.
    pub unreachable: bool,
    /// Artificial latency per call (TC-4's "slow fake").
    pub delay: std::time::Duration,
}

impl FakeEmbeddingProvider {
    pub fn new(dim: usize) -> Self {
        FakeEmbeddingProvider {
            dim,
            unreachable: false,
            delay: std::time::Duration::ZERO,
        }
    }

    pub fn vector_for(&self, text: &str) -> Vec<f32> {
        let mut v = vec![0.0f32; self.dim];
        for word in text.to_lowercase().split(|c: char| !c.is_alphanumeric()) {
            // Skip short/stop words so overlap means shared content, not shared "the".
            if word.len() < 4 {
                continue;
            }
            let mut h: u64 = 1469598103934665603; // FNV-1a
            for b in word.bytes() {
                h ^= b as u64;
                h = h.wrapping_mul(1099511628211);
            }
            v[(h as usize) % self.dim] += 1.0;
        }
        // L2-normalize so distances behave.
        let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-9);
        v.iter_mut().for_each(|x| *x /= norm);
        v
    }
}

impl EmbeddingProvider for FakeEmbeddingProvider {
    async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>, ProviderError> {
        if self.unreachable {
            return Err(ProviderError::Unreachable("fake: down".into()));
        }
        if !self.delay.is_zero() {
            tokio::time::sleep(self.delay).await;
        }
        Ok(texts.iter().map(|t| self.vector_for(t)).collect())
    }
}

/// Canned chat: echoes back what context it was shown, so tests can assert
/// exactly what reached the prompt (AC-10/AC-7). With `canned` set it returns
/// that fixed text instead (mood-classification tests).
#[derive(Default)]
pub struct FakeChatProvider {
    pub cloud: bool,
    pub canned: Option<String>,
    pub requests: Mutex<Vec<ChatRequest>>,
}

impl ChatProvider for FakeChatProvider {
    fn id(&self) -> ProviderId {
        if self.cloud {
            ProviderId::ClaudeCli
        } else {
            ProviderId::Ollama
        }
    }

    fn is_cloud(&self) -> bool {
        self.cloud
    }

    async fn available(&self) -> Availability {
        Availability::Ok
    }

    async fn complete(&self, req: ChatRequest) -> Result<ChatResponse, ProviderError> {
        let text = self
            .canned
            .clone()
            .unwrap_or_else(|| format!("fake reflection | saw: {}", req.user));
        self.requests.lock().unwrap().push(req);
        Ok(ChatResponse { text })
    }
}
