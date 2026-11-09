#!/usr/bin/env python3
"""Time the app's mood task against local Ollama models.

Uses the exact system prompt and JSON schema from src-tauri/src/memory/mood.rs and the
57-entry journal in src-tauri/tests/fixtures/journal60.json. One warm-up call loads the
model; then every entry is classified once, sequentially.

    python3 scripts/bench-mood.py qwen3:4b-instruct llama3.2:3b llama3.2:1b
"""
import json, pathlib, statistics, sys, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SYSTEM = ('You classify the mood of a private journal entry.\n'
          'Reply ONLY with JSON: {"level": <1-5>, "label": "<one lowercase emotion word>"}.\n'
          'level: 1=rough, 2=low, 3=okay, 4=good, 5=great. No other text.')
SCHEMA = {"type": "object", "properties": {"level": {"type": "integer", "minimum": 1, "maximum": 5},
                                          "label": {"type": "string"}}, "required": ["level"]}
bodies = [e["body"] for e in json.load(open(ROOT / "src-tauri/tests/fixtures/journal60.json"))]


def call(model, body):
    req = urllib.request.Request(
        "http://localhost:11434/api/chat",
        data=json.dumps({"model": model, "stream": False, "format": SCHEMA, "keep_alive": "10m",
                         "messages": [{"role": "system", "content": SYSTEM},
                                      {"role": "user", "content": body}]}).encode(),
        headers={"Content-Type": "application/json"})
    t = time.perf_counter()
    r = json.load(urllib.request.urlopen(req, timeout=120))
    return time.perf_counter() - t, r


for model in sys.argv[1:]:
    call(model, bodies[0])  # warm-up
    lat, ok, tps = [], 0, []
    for b in bodies:
        dt, r = call(model, b)
        lat.append(dt)
        try:
            ok += 1 <= json.loads(r["message"]["content"])["level"] <= 5
        except Exception:
            pass
        if r.get("eval_duration"):
            tps.append(r["eval_count"] / (r["eval_duration"] / 1e9))
    lat.sort()
    print(f"{model}: median {statistics.median(lat):.3f}s  p95 {lat[int(len(lat) * .95) - 1]:.3f}s  "
          f"valid {ok}/{len(lat)}  {statistics.median(tps):.0f} tok/s")
print(f"{len(bodies)} entries, avg {statistics.mean(map(len, bodies)):.0f} chars")
