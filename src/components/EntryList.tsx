import type { EntrySummary } from "../lib/types";
import { MoodMark } from "./MoodMark";

export function EntryList(props: {
  entries: EntrySummary[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <nav className="entry-list" data-testid="entry-list">
      <button className="new-entry" onClick={props.onNew}>
        + New page
      </button>
      <ul>
        {props.entries.map((e) => (
          <li key={e.id}>
            <button
              className={e.id === props.activeId ? "active" : ""}
              onClick={() => props.onOpen(e.id)}
            >
              <MoodMark level={e.mood_level} mark={e.mark} size={44} />
              <span className="entry-text">
                <span className="date">{new Date(e.created_at).toLocaleDateString()}</span>
                <span className="preview">{e.preview || "(empty)"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
