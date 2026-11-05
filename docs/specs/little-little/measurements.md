# Measurements — little-little M1 (observed 2026-11-05)

Provisional targets from tests.md, now with first real numbers. Fake-embedding
distances are directional only; live-model distances should be re-logged during
the manual pass.

| What | Provisional | Observed | Verdict |
|------|-------------|----------|---------|
| Chunk size | ~1000 chars, hard-split >1500 | All 12 fixtures → 1 chunk each (109–827 chars); multi-paragraph fx-11 (827) merges under target; synthetic 3.5k-char paragraph splits into ≥2 chunks ≤1600 | Keep. Real diary entries rarely exceed one chunk — good for retrieval granularity |
| Related memories K | 3 | Top-3 for the "new interview nerves" entry: fx-02 *interview went well* (1.177), fx-01 *interview nerves* (1.276), then a weaker neighbor (1.327) | Keep K=3; the 3rd slot is already marginal |
| Similarity cutoff | none in M1 | Gap between relevant (≤1.28) and generic (≥1.33) is small with fake embeddings; needs live-model distances before choosing a floor | Re-measure with nomic-embed-text at /spec-verify; likely add a cutoff in M2 |
| Autosave debounce | ~1s | Feels right in component tests (1 save per typing burst); subjective check pending | Keep 1000ms |
| Embed latency / entry | — | Live smoke: embed + chat round-trip 2.65s total incl. test harness; embed alone well under 1s for one chunk (nomic-embed-text, M-series) | Background worker is comfortably fast |
| Reflection latency | — | qwen3:4b-instruct one-sentence reply ≈ 1–2s warm; full reflection (2–4 sentences + context) expected 3–8s | "Thinking…" state + 1.2s poll covers it |

## How to re-measure

```bash
cd src-tauri
cargo test --lib -- --nocapture 2>&1 | grep MEASURE   # chunking + retrieval distances
OLLAMA_TEST=1 cargo test --lib -- --ignored           # live embed+chat smoke
```

---

# M2 measurements (observed live 2026-11-05, real models)

| What | Provisional | Observed | Verdict |
|------|-------------|----------|---------|
| Mood latency | — | 12 fixture entries in 5.2s (~0.43s each, qwen3:4b-instruct) | Background worker keeps up easily |
| Mood quality | eyeball (M-1) | All 12 plausible: interview nerves=2 "anxious", success=4 "proud", streak=5 "happy", health scare=2 "anxious" | No misfires on the fixture arc |
| Search K | 8 | Real-embedding top-3 for the interview query = exactly the three interview entries | Keep K=8 |
| Search answer latency | — | 0.62s, correct and dated ("…on 2026-03-02, when you were preparing for the Northwind interview") | "asking…" state barely visible |
| Pull stream | — | Real all-minilm pull: NDJSON {status, digest?, total?, completed?} → "success" | Parser handles arbitrary chunk splits |
| Calendar render @1k entries | <100ms | not yet measured (journal is small) | Measure when real data grows |

Rerun: `OLLAMA_TEST=1 cargo test --lib live_m2 -- --ignored --nocapture`
