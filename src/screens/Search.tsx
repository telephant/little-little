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

/** Static prompts for the empty page (A-3): they teach what the journal can be asked, they are not generated from entries. */
const EXAMPLES = [
  "When did I last feel anxious about work?",
  "What has been making me happy lately?",
  "What have I been worrying about this month?",
];

const LONG_DATE = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function Search(props: { onOpenEntry: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [answer, setAnswer] = useState<AnswerState>({ kind: "idle" });
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  async function runQuery(raw: string) {
    const q = raw.trim();
    if (!q) return;
    const mySeq = ++seq.current;
    setAnswer({ kind: "idle" });
    setSearching(true);
    const out = await ipc.search(q).catch(() => null);
    if (mySeq !== seq.current) return;
    setSearching(false);
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
      <form
        className="search-line"
        onSubmit={(e) => {
          e.preventDefault();
          void runQuery(query);
        }}
      >
        <input
          type="search"
          placeholder="Ask your journal… (e.g. when did I last feel anxious about work?)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="search query"
          autoFocus
        />
        <button type="submit" className="text-link search-submit" data-testid="search-submit" disabled={!query.trim()}>
          Ask
        </button>
      </form>

      {results === null && !searching && (
        <div className="search-intro" data-testid="search-intro">
          <p>Ask in your own words — answers come from your own entries, and stay on this device unless Cloud is on.</p>
          <ul className="search-examples">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  className="search-example"
                  data-testid="search-example"
                  onClick={() => {
                    setQuery(ex);
                    void runQuery(ex);
                  }}
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {searching && (
        <p className="placeholder" data-testid="search-loading">
          searching…
        </p>
      )}

      {answer.kind === "asking" && <p className="placeholder">asking…</p>}
      {answer.kind === "ready" && (
        <div className="search-answer answer-wash" data-testid="search-answer">
          <p>{answer.answer.answer}</p>
          <p className="sources">from {answer.answer.cited_dates.join(", ")}</p>
        </div>
      )}
      {answer.kind === "unavailable" && (
        <p className="placeholder">Couldn't ask the model right now — your results are below.</p>
      )}

      {hidden > 0 && (
        <p className="hidden-note search-note-quiet" data-testid="hidden-note">
          {hidden} entr{hidden === 1 ? "y" : "ies"} hidden (never send to cloud)
        </p>
      )}

      {results !== null && !searching && (
        <ul className="search-results" data-testid="search-results">
          {results.length === 0 && (
            <li className="placeholder search-empty">
              No matching entries.
              <span className="search-empty-hint" data-testid="search-empty-hint">
                {" "}Try different words, or describe the moment instead of naming it.
              </span>
            </li>
          )}
          {results.map((r) => (
            <li key={r.entry_id}>
              <button data-testid="search-result" className="search-note" onClick={() => props.onOpenEntry(r.entry_id)}>
                <time className="date" dateTime={r.created_at}>
                  {LONG_DATE.format(new Date(r.created_at))}
                </time>
                <span className="snippet">{r.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
