// AI panel (C-2): renders exactly the typed backend states — never raw errors.
import type { PanelState } from "../lib/types";

export function AiPanel(props: {
  state: PanelState | null;
  onOpenEntry: (id: string) => void;
  onRegenerate: () => void;
  onDismiss: (responseId: string) => void;
  onOpenSettings: () => void;
}) {
  const s = props.state;
  if (!s) {
    return <p className="placeholder">Your memories will appear here.</p>;
  }

  switch (s.state) {
    case "models_not_chosen":
      return (
        <div className="panel-note">
          <p>To get memories and reflections, choose your models first — nothing is selected for you.</p>
          <button onClick={props.onOpenSettings}>Choose models</button>
        </div>
      );
    case "thinking":
      return <p className="placeholder">Thinking about what this connects to…</p>;
    case "nothing_to_relate":
      return (
        <p className="placeholder">
          Nothing to relate yet — as you write more, your past entries will show up here.
        </p>
      );
    case "provider_unavailable":
      return (
        <div className="panel-note">
          <p>Your writing is safe and saved. The AI companion is resting: {s.reason}</p>
        </div>
      );
    case "ready":
      return (
        <div className="panel-ready">
          <h3>From your past</h3>
          <ul className="memory-list">
            {s.related.map((r) => (
              <li key={r.entry_id}>
                <button
                  data-testid="memory-card"
                  className="memory-card"
                  onClick={() => props.onOpenEntry(r.entry_id)}
                >
                  <span className="date">{r.created_at.slice(0, 10)}</span>
                  <span className="snippet">{r.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="reflection">
            <p data-testid="reflection-body">{s.reflection.body}</p>
            <p data-testid="reflection-sources" className="sources">
              based on {s.related.map((r) => r.created_at.slice(0, 10)).join(", ")}
            </p>
            <div className="reflection-actions">
              <button onClick={props.onRegenerate}>Regenerate</button>
              <button onClick={() => props.onDismiss(s.reflection.id)}>Dismiss</button>
            </div>
          </div>
        </div>
      );
  }
}
