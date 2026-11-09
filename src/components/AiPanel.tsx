// AI panel (C-2): renders exactly the typed backend states — never raw errors.
import { useState } from "react";
import type { PanelState, RelatedEntry } from "../lib/types";
import type { ReflectionPhase } from "../hooks/useReflectionPhase";

/** "N memories" control: notes appear on hover, focus or click; leave, blur-out or Esc hides them.
 *  Its state is independent of the reflection phase (spec AC-12). */
function Memories(props: { related: RelatedEntry[]; onOpenEntry: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const n = props.related.length;
  if (n === 0) return null;
  return (
    <div
      className="memories"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        className="memories-toggle"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        {n} {n === 1 ? "memory" : "memories"}
      </button>
      {open && (
        <ul className="memory-list">
          {props.related.map((r) => (
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
      )}
    </div>
  );
}

export function AiPanel(props: {
  state: PanelState | null;
  onOpenEntry: (id: string) => void;
  onRegenerate: () => void;
  onDismiss: (responseId: string) => void;
  onOpenSettings: () => void;
  phase?: ReflectionPhase;
  motion?: "drift" | "fade";
  onAnimationEnd?: () => void;
  onRecall?: () => void;
}) {
  const phase = props.phase ?? "none";
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
          <Memories related={s.related} onOpenEntry={props.onOpenEntry} />
          {phase === "tucked" ? (
            <button className="recall" onClick={props.onRecall}>
              bring it back
            </button>
          ) : (
            <div
              className={`reflection phase-${phase === "none" ? "present" : phase} motion-${props.motion ?? "drift"}`}
              data-testid="reflection"
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget) props.onAnimationEnd?.();
              }}
            >
              <p data-testid="reflection-body">{s.reflection.body}</p>
              <p data-testid="reflection-sources" className="sources">
                based on {s.related.map((r) => r.created_at.slice(0, 10)).join(", ")}
              </p>
              <div className="reflection-actions">
                <button onClick={props.onRegenerate}>Regenerate</button>
                <button onClick={() => props.onDismiss(s.reflection.id)}>Dismiss</button>
              </div>
            </div>
          )}
        </div>
      );
  }
}
