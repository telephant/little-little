import { useState } from "react";

export function TagRow(props: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add() {
    const tag = draft.trim().toLowerCase();
    if (!tag || props.tags.includes(tag)) return setDraft("");
    props.onChange([...props.tags, tag]);
    setDraft("");
  }

  return (
    <div className="tag-row">
      {props.tags.map((t) => (
        <span key={t} className="tag">
          #{t}
          <button
            aria-label={`remove tag ${t}`}
            onClick={() => props.onChange(props.tags.filter((x) => x !== t))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        placeholder="+ tag"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
    </div>
  );
}
