// Distraction-free editor (C-1): plain textarea, autosave, tags.
import { useEffect, useRef, useState } from "react";
import type { Entry } from "../lib/types";
import { ipc } from "../lib/ipc";
import { useAutosave } from "../hooks/useAutosave";
import { MoodPicker } from "./MoodPicker";
import { TagRow } from "./TagRow";
import { MoodMark } from "./MoodMark";
import { MarkCanvas } from "./MarkCanvas";

export function Editor(props: { entry: Entry; onSaved?: () => void; onMoodChanged?: () => void; onMarkChanged?: () => void; onTyped?: () => void }) {
  const [body, setBody] = useState(props.entry.body);
  const [tags, setTags] = useState(props.entry.tags);
  const [mark, setMark] = useState<string | null>(props.entry.mark);
  const [painting, setPainting] = useState(false);
  const [mood, setMood] = useState<{ level: number | null; source: "ai" | "manual" | null }>({
    level: props.entry.mood_level,
    source: props.entry.mood_source,
  });

  // Reload local state when a different entry is opened. Not on mount: the initial state already
  // holds this entry, and resetting there could wipe an edit made before the effect first runs.
  const shownId = useRef(props.entry.id);
  useEffect(() => {
    if (shownId.current === props.entry.id) return;
    shownId.current = props.entry.id;
    setBody(props.entry.body);
    setTags(props.entry.tags);
    setMark(props.entry.mark);
    setPainting(false);
    setMood({ level: props.entry.mood_level, source: props.entry.mood_source });
  }, [props.entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useAutosave(body, (v) => {
    void ipc.saveEntry(props.entry.id, v).then(props.onSaved);
  });

  async function changeTags(next: string[]) {
    setTags(next);
    await ipc.setTags(props.entry.id, next);
  }

  return (
    <div className="editor">
      <header className="editor-head">
        <h2 className="editor-date">
          {new Date(props.entry.created_at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </h2>
        <span className="editor-mark">
          <button
            className="editor-mark-btn"
            aria-label={mark ? "repaint your mark" : "paint your own mark"}
            title={mark ? "Click to repaint this mark" : "Click to paint your own mark for this entry"}
            onClick={() => setPainting(true)}
          >
            <MoodMark level={mood.level} mark={mark} size={84} />
            <span className="mark-label">{mark ? "repaint" : "paint your own"}</span>
          </button>
        </span>
      </header>
      {painting && (
        <MarkCanvas
          level={mood.level}
          hasMark={mark !== null}
          onCancel={() => setPainting(false)}
          onSave={async (m) => {
            await ipc.setMark(props.entry.id, m);
            setMark(m);
            setPainting(false);
            props.onMarkChanged?.();
          }}
          onUseDefault={async () => {
            await ipc.clearMark(props.entry.id);
            setMark(null);
            setPainting(false);
            props.onMarkChanged?.();
          }}
        />
      )}
      <textarea
        data-testid="editor-body"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          props.onTyped?.();
        }}
        placeholder="What's on your mind?"
        autoFocus
      />
      <div className="editor-meta">
        <MoodPicker
          entryId={props.entry.id}
          level={mood.level}
          label={props.entry.mood_label}
          source={mood.source}
          onChanged={(level) => {
            setMood({ level, source: "manual" });
            props.onMoodChanged?.();
          }}
        />
        <TagRow tags={tags} onChange={(t) => void changeTags(t)} />
      </div>
    </div>
  );
}
