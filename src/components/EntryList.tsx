import type { EntrySummary } from "../lib/types";

export function EntryList(props: {
  entries: EntrySummary[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <nav className="entry-list" data-testid="entry-list">
      <button className="new-entry" onClick={props.onNew}>
        + New entry
      </button>
      <ul>
        {props.entries.map((e) => (
          <li key={e.id}>
            <button
              className={e.id === props.activeId ? "active" : ""}
              onClick={() => props.onOpen(e.id)}
            >
              <span className="date">{new Date(e.created_at).toLocaleDateString()}</span>
              <span className="preview">{e.preview || "(empty)"}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
