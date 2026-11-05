// Semantic search (C-11, F-9): results render instantly; the AI answer arrives
// on its own and may fail quietly without touching the results.
import { useRef, useState } from "react";
import { ipc } from "../lib/ipc";
import type { SearchAnswer, SearchResult } from "../lib/types";

type AnswerState =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "ready"; answer: SearchAnswer }
  | { kind: "unavailable" };

export function Search(props: { onOpenEntry: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [answer, setAnswer] = useState<AnswerState>({ kind: "idle" });
  const seq = useRef(0);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const mySeq = ++seq.current;
    setAnswer({ kind: "idle" });
    const out = await ipc.search(q).catch(() => null);
    if (mySeq !== seq.current) return;
    if (!out) {
      setResults([]);
      setHidden(0);
      return;
    }
    setResults(out.results); // instant — before any model call
    setHidden(out.hidden_count);
    if (out.results.length > 0) {
      setAnswer({ kind: "asking" });
      ipc
        .searchAnswer(q, out.results.map((r) => r.entry_id))
        .then((a) => {
          if (mySeq === seq.current) setAnswer({ kind: "ready", answer: a });
        })
        .catch(() => {
          if (mySeq === seq.current) setAnswer({ kind: "unavailable" });
        });
    }
  }

  return (
    <div className="search" data-testid="search">
      <form onSubmit={(e) => void run(e)}>
        <input
          type="search"
          placeholder="Ask your journal… (e.g. when did I last feel anxious about work?)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="search query"
          autoFocus
        />
      </form>

      {answer.kind === "asking" && <p className="placeholder">asking…</p>}
      {answer.kind === "ready" && (
        <div className="search-answer" data-testid="search-answer">
          <p>{answer.answer.answer}</p>
          <p className="sources">from {answer.answer.cited_dates.join(", ")}</p>
        </div>
      )}
      {answer.kind === "unavailable" && (
        <p className="placeholder">Couldn't ask the model right now — your results are below.</p>
      )}

      {hidden > 0 && (
        <p className="hidden-note" data-testid="hidden-note">
          {hidden} entr{hidden === 1 ? "y" : "ies"} hidden (never send to cloud)
        </p>
      )}

      {results !== null && (
        <ul className="search-results" data-testid="search-results">
          {results.length === 0 && <li className="placeholder">No matching entries.</li>}
          {results.map((r) => (
            <li key={r.entry_id}>
              <button data-testid="search-result" onClick={() => props.onOpenEntry(r.entry_id)}>
                <span className="date">{r.created_at.slice(0, 10)}</span>
                <span className="snippet">{r.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
