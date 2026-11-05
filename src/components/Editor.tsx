// Distraction-free editor (C-1): plain textarea, autosave, tags.
import { useEffect, useState } from "react";
import type { Entry } from "../lib/types";
import { ipc } from "../lib/ipc";
import { useAutosave } from "../hooks/useAutosave";
import { MoodPicker } from "./MoodPicker";
import { TagRow } from "./TagRow";

export function Editor(props: { entry: Entry; onSaved?: () => void }) {
  const [body, setBody] = useState(props.entry.body);
  const [tags, setTags] = useState(props.entry.tags);
  const [mood, setMood] = useState<{ level: number | null; source: "ai" | "manual" | null }>({
    level: props.entry.mood_level,
    source: props.entry.mood_source,
  });

  // Reload local state when a different entry is opened.
  useEffect(() => {
    setBody(props.entry.body);
    setTags(props.entry.tags);
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
      <textarea
        data-testid="editor-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's on your mind?"
        autoFocus
      />
      <div className="editor-meta">
        <MoodPicker
          entryId={props.entry.id}
          level={mood.level}
          label={props.entry.mood_label}
          source={mood.source}
          onChanged={(level) => setMood({ level, source: "manual" })}
        />
        <TagRow tags={tags} onChange={(t) => void changeTags(t)} />
      </div>
    </div>
  );
}
