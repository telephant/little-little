//! Ollama model pull with streamed progress (C-13, AC-27).
//! Stream shape verified live 2026-11-05: NDJSON lines
//! {status, digest?, total?, completed?} … {"status":"success"}.

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct PullLine {
    status: String,
    #[serde(default)]
    total: Option<u64>,
    #[serde(default)]
    completed: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PullProgress {
    pub status: String,
    /// 0–100 while a layer downloads; None for status-only lines.
    pub pct: Option<f64>,
    pub done: bool,
}

/// Incremental NDJSON parser — separable from the network for tests (TC-33).
#[derive(Default)]
pub struct PullParser {
    buf: String,
}

impl PullParser {
    /// Feed a chunk; get the progress events it completed.
    pub fn push(&mut self, chunk: &str) -> Result<Vec<PullProgress>, String> {
        self.buf.push_str(chunk);
        let mut out = Vec::new();
        while let Some(nl) = self.buf.find('\n') {
            let line: String = self.buf.drain(..=nl).collect();
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let parsed: PullLine =
                serde_json::from_str(line).map_err(|e| format!("bad pull line: {e}"))?;
            if let Some(err) = parsed.status.strip_prefix("error") {
                return Err(format!("pull failed{err}"));
            }
            let pct = match (parsed.completed, parsed.total) {
                (Some(c), Some(t)) if t > 0 => Some((c as f64 / t as f64) * 100.0),
                (None, Some(_)) => Some(0.0), // layer announced, nothing downloaded yet
                _ => None,
            };
            let done = parsed.status == "success";
            out.push(PullProgress {
                status: parsed.status,
                pct,
                done,
            });
        }
        Ok(out)
    }
}

/// Pull `model`, invoking `on_progress` per event. Blocks until success/failure.
pub async fn pull_model(
    base_url: &str,
    model: &str,
    mut on_progress: impl FnMut(PullProgress),
) -> Result<(), String> {
    let client = reqwest::Client::new(); // no timeout: pulls are long by nature
    let mut resp = client
        .post(format!("{base_url}/api/pull"))
        .json(&serde_json::json!({ "model": model, "stream": true }))
        .send()
        .await
        .map_err(|e| format!("ollama unreachable: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("pull request failed: {}", resp.status()));
    }
    let mut parser = PullParser::default();
    let mut finished = false;
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        for event in parser.push(&String::from_utf8_lossy(&chunk))? {
            finished |= event.done;
            on_progress(event);
        }
    }
    if finished {
        Ok(())
    } else {
        Err("pull stream ended without success".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// TC-33 (rust half): recorded-shape stream → monotonic progress ending in
    /// success; malformed line → clean error.
    #[test]
    fn tc33_parser_progress_and_errors() {
        // Shape as observed live 2026-11-05 (completed added during download).
        let lines = [
            r#"{"status":"pulling manifest"}"#,
            r#"{"status":"pulling 797b70c4edf8","digest":"sha256:797b…","total":45949216}"#,
            r#"{"status":"pulling 797b70c4edf8","digest":"sha256:797b…","total":45949216,"completed":11487304}"#,
            r#"{"status":"pulling 797b70c4edf8","digest":"sha256:797b…","total":45949216,"completed":34461912}"#,
            r#"{"status":"pulling 797b70c4edf8","digest":"sha256:797b…","total":45949216,"completed":45949216}"#,
            r#"{"status":"verifying sha256 digest"}"#,
            r#"{"status":"writing manifest"}"#,
            r#"{"status":"success"}"#,
        ];
        let mut parser = PullParser::default();
        let mut events = Vec::new();
        // Feed in awkward chunk boundaries (split mid-line).
        let joined = lines.join("\n") + "\n";
        for chunk in joined.as_bytes().chunks(37) {
            events.extend(parser.push(&String::from_utf8_lossy(chunk)).unwrap());
        }
        assert_eq!(events.len(), lines.len());
        let pcts: Vec<f64> = events.iter().filter_map(|e| e.pct).collect();
        assert!(pcts.windows(2).all(|w| w[0] <= w[1]), "progress not monotonic: {pcts:?}");
        assert!((pcts.last().unwrap() - 100.0).abs() < 0.01);
        assert!(events.last().unwrap().done);

        // Malformed line → clean error, no panic.
        let mut p2 = PullParser::default();
        assert!(p2.push("this is not json\n").is_err());
        // Ollama error line → surfaced as error.
        let mut p3 = PullParser::default();
        assert!(p3.push("{\"status\":\"error: model not found\"}\n").is_err());
    }
}
