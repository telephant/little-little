//! ClaudeCli (cloud provider): shells out to `claude -p` under the sandbox
//! contract (AC-11, design-detail.md):
//!   - prompt text via stdin ONLY — argv and env never carry user content
//!   - --output-format json, parsed for `.result`
//!   - all built-in tools disallowed + --max-turns 1 (pure text generation)
//!   - cwd = fresh empty temp dir, removed afterwards

use super::{Availability, ChatProvider, ChatRequest, ChatResponse, ProviderError, ProviderId};
use serde::Deserialize;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::AsyncWriteExt;

/// Tools disallowed explicitly; combined with --max-turns 1 and an empty cwd.
const DISALLOWED_TOOLS: &str =
    "Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,TodoWrite";

pub struct ClaudeCli {
    /// Binary to execute. Production: "claude" (resolved via PATH); tests: the stub.
    pub binary: PathBuf,
}

impl Default for ClaudeCli {
    fn default() -> Self {
        ClaudeCli {
            binary: PathBuf::from("claude"),
        }
    }
}

#[derive(Deserialize)]
struct CliResult {
    #[serde(default)]
    is_error: bool,
    result: Option<String>,
}

impl ChatProvider for ClaudeCli {
    fn id(&self) -> ProviderId {
        ProviderId::ClaudeCli
    }

    fn is_cloud(&self) -> bool {
        true
    }

    async fn available(&self) -> Availability {
        // Fast check: binary runs at all. (Auth problems surface on first use,
        // as a ProviderError with guidance — cheaper than a billed ping.)
        match tokio::process::Command::new(&self.binary)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await
        {
            Ok(s) if s.success() => Availability::Ok,
            Ok(_) => Availability::Unavailable {
                reason: "claude exists but failed to run; try `claude` in a terminal".into(),
            },
            Err(_) => Availability::Unavailable {
                reason: "Claude Code not found — install it and sign in".into(),
            },
        }
    }

    async fn complete(&self, req: ChatRequest) -> Result<ChatResponse, ProviderError> {
        // Fresh, empty working directory per call; removed on drop.
        let workdir = tempfile::tempdir()
            .map_err(|e| ProviderError::Api(format!("temp dir: {e}")))?;

        let mut child = tokio::process::Command::new(&self.binary)
            .current_dir(workdir.path())
            .args([
                "-p",
                "--output-format",
                "json",
                "--max-turns",
                "1",
                "--disallowedTools",
                DISALLOWED_TOOLS,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| ProviderError::Unreachable(format!("could not run claude: {e}")))?;

        // User content goes through stdin, never argv/env.
        let prompt = format!("{}\n\n{}", req.system, req.user);
        child
            .stdin
            .take()
            .expect("stdin piped")
            .write_all(prompt.as_bytes())
            .await
            .map_err(|e| ProviderError::Api(format!("stdin write: {e}")))?;
        // Closing stdin (drop) signals EOF.

        let out = child
            .wait_with_output()
            .await
            .map_err(|e| ProviderError::Api(format!("claude wait: {e}")))?;
        if !out.status.success() {
            return Err(ProviderError::Api(format!(
                "claude exited with {}: {}",
                out.status,
                String::from_utf8_lossy(&out.stderr).trim()
            )));
        }
        let parsed: CliResult = serde_json::from_slice(&out.stdout)
            .map_err(|e| ProviderError::Parse(e.to_string()))?;
        if parsed.is_error {
            return Err(ProviderError::Api("claude reported an error result".into()));
        }
        let text = parsed
            .result
            .ok_or_else(|| ProviderError::Parse("missing .result field".into()))?;
        Ok(ChatResponse { text })
        // workdir dropped here → temp dir removed.
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Both tests mutate process-wide CLAUDE_STUB_* env vars — serialize them.
    static STUB_ENV: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn stub() -> (tempfile::TempDir, ClaudeCli) {
        let out = tempfile::tempdir().unwrap();
        let bin = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/bin/claude-stub");
        (out, ClaudeCli { binary: bin })
    }

    fn req() -> ChatRequest {
        ChatRequest {
            system: "You are a warm journaling companion.".into(),
            user: "SECRET-ENTRY-TEXT about a hard day".into(),
            json_schema: None,
        }
    }

    /// TC-14: Given ClaudeCli provider with entry text; When command built and
    /// run against the CLI stub; Then stdin carries the text, argv/env carry
    /// none of it, argv has -p --output-format json and disallows all tools,
    /// cwd is an empty fresh temp dir, removed after.
    #[tokio::test]
    async fn tc14_invocation_contract() {
        let _guard = STUB_ENV.lock().unwrap();
        let (out, cli) = stub();
        // SAFETY: test-only env var, no concurrent env readers in this test binary
        // beyond the spawned child which inherits it.
        unsafe { std::env::set_var("CLAUDE_STUB_OUT", out.path()) };
        let resp = cli.complete(req()).await.unwrap();
        assert_eq!(resp.text, "stub reflection");

        let read = |f: &str| std::fs::read_to_string(out.path().join(f)).unwrap();
        // stdin carries the entry text
        assert!(read("stdin.txt").contains("SECRET-ENTRY-TEXT"));
        // argv: contract flags present, no user content
        let argv = read("argv.txt");
        assert!(argv.contains("-p"));
        assert!(argv.contains("--output-format") && argv.contains("json"));
        assert!(argv.contains("--disallowedTools") && argv.contains("Bash,Edit,Write"));
        assert!(argv.contains("--max-turns"));
        assert!(!argv.contains("SECRET-ENTRY-TEXT"));
        // env: no user content
        assert!(!read("env.txt").contains("SECRET-ENTRY-TEXT"));
        // cwd: a fresh empty temp dir (stub saw no files), outside the repo…
        assert_eq!(read("cwd-listing.txt").trim(), "");
        let cwd = read("cwd.txt").trim().to_string();
        assert!(!cwd.contains("little-little/src-tauri"));
        // …and removed after the call returns.
        assert!(!std::path::Path::new(&cwd).exists());
    }

    /// TC-15: Given CLI stub printing malformed JSON / exiting nonzero;
    /// When complete() called; Then ProviderError (no panic), caller can retry.
    #[tokio::test]
    async fn tc15_malformed_output_and_failure_are_errors() {
        let _guard = STUB_ENV.lock().unwrap();
        let (out, cli) = stub();
        unsafe {
            std::env::set_var("CLAUDE_STUB_OUT", out.path());
            std::env::set_var("CLAUDE_STUB_MODE", "bad-json");
        }
        assert!(matches!(cli.complete(req()).await, Err(ProviderError::Parse(_))));
        unsafe { std::env::set_var("CLAUDE_STUB_MODE", "fail") };
        assert!(matches!(cli.complete(req()).await, Err(ProviderError::Api(_))));
        unsafe { std::env::remove_var("CLAUDE_STUB_MODE") };
        // Retry works after errors.
        assert!(cli.complete(req()).await.is_ok());
    }

    #[tokio::test]
    async fn availability_false_when_binary_missing() {
        let cli = ClaudeCli {
            binary: PathBuf::from("/nonexistent/claude-nope"),
        };
        assert!(matches!(
            cli.available().await,
            Availability::Unavailable { .. }
        ));
        assert!(cli.is_cloud());
    }
}
