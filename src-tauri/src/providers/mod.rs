//! Provider layer (C-7, ADR-0003): one interface for all model providers.
//! Impls: OllamaEmbed/OllamaChat (localhost HTTP), ClaudeCli (sandboxed subprocess).


pub mod claude_cli;
pub mod ollama;
pub mod pull;

#[cfg(test)]
pub mod fakes;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[allow(dead_code)] // `id()` is part of the designed trait surface (ADR-0003); UI consumes is_cloud today
pub enum ProviderId {
    Ollama,
    ClaudeCli,
}

#[derive(Debug, Clone, Serialize)]
pub enum Availability {
    Ok,
    Unavailable { reason: String },
}

#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("provider unreachable: {0}")]
    Unreachable(String),
    #[error("provider error: {0}")]
    Api(String),
    #[error("could not parse provider output: {0}")]
    Parse(String),
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub system: String,
    pub user: String,
    /// When set, providers that support structured outputs (Ollama `format`)
    /// enforce this JSON schema; others rely on the prompt (ClaudeCli).
    pub json_schema: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct ChatResponse {
    pub text: String,
}

/// Embeddings are always local (design: flagged entries are still indexed).
pub trait EmbeddingProvider: Send + Sync {
    fn embed(
        &self,
        texts: &[String],
    ) -> impl std::future::Future<Output = Result<Vec<Vec<f32>>, ProviderError>> + Send;
}

pub trait ChatProvider: Send + Sync {
    #[allow(dead_code)]
    fn id(&self) -> ProviderId;
    /// Drives the privacy indicator AND the retrieval-time no-cloud filter.
    fn is_cloud(&self) -> bool;
    fn available(&self) -> impl std::future::Future<Output = Availability> + Send;
    fn complete(
        &self,
        req: ChatRequest,
    ) -> impl std::future::Future<Output = Result<ChatResponse, ProviderError>> + Send;
}

/// Static dispatch over the configured chat provider.
pub enum AnyChatProvider {
    Ollama(ollama::OllamaChat),
    Claude(claude_cli::ClaudeCli),
    #[cfg(test)]
    Fake(fakes::FakeChatProvider),
}

impl AnyChatProvider {
    /// The provider selected in settings; None when it's Ollama without a chat model.
    pub fn active_from(settings: &crate::storage::SettingsView) -> Option<AnyChatProvider> {
        if settings.is_cloud {
            Some(AnyChatProvider::Claude(claude_cli::ClaudeCli::default()))
        } else {
            settings.chat_model.clone().map(|model| {
                AnyChatProvider::Ollama(ollama::OllamaChat {
                    base_url: ollama::BASE_URL.to_string(),
                    model,
                })
            })
        }
    }

    /// The local chat model regardless of the active provider (ADR-0004 fallback).
    pub fn local_from(settings: &crate::storage::SettingsView) -> Option<AnyChatProvider> {
        settings.chat_model.clone().map(|model| {
            AnyChatProvider::Ollama(ollama::OllamaChat {
                base_url: ollama::BASE_URL.to_string(),
                model,
            })
        })
    }

    #[allow(dead_code)]
    pub fn id(&self) -> ProviderId {
        match self {
            AnyChatProvider::Ollama(p) => p.id(),
            AnyChatProvider::Claude(p) => p.id(),
            #[cfg(test)]
            AnyChatProvider::Fake(p) => p.id(),
        }
    }
    pub fn is_cloud(&self) -> bool {
        match self {
            AnyChatProvider::Ollama(p) => p.is_cloud(),
            AnyChatProvider::Claude(p) => p.is_cloud(),
            #[cfg(test)]
            AnyChatProvider::Fake(p) => p.is_cloud(),
        }
    }
    pub async fn available(&self) -> Availability {
        match self {
            AnyChatProvider::Ollama(p) => p.available().await,
            AnyChatProvider::Claude(p) => p.available().await,
            #[cfg(test)]
            AnyChatProvider::Fake(p) => p.available().await,
        }
    }
    pub async fn complete(&self, req: ChatRequest) -> Result<ChatResponse, ProviderError> {
        match self {
            AnyChatProvider::Ollama(p) => p.complete(req).await,
            AnyChatProvider::Claude(p) => p.complete(req).await,
            #[cfg(test)]
            AnyChatProvider::Fake(p) => p.complete(req).await,
        }
    }
}

/// Cheap availability check for the settings screen: is `claude` on PATH?
pub fn claude_on_path() -> bool {
    std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).any(|dir| dir.join("claude").is_file()))
        .unwrap_or(false)
}
