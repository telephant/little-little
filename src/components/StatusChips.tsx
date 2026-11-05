// Status chips (C-14, AC-29): the model/AI state, never vague.
import type { Activity, SettingsView } from "../lib/types";

function Chip(props: { kind: string; text: string }) {
  return <span className={`chip chip-${props.kind}`}>{props.text}</span>;
}

export function StatusChips(props: { settings: SettingsView; activity: Activity | null }) {
  const { settings, activity } = props;
  const chips: { kind: string; text: string }[] = [];

  if (!settings.embed_model) {
    chips.push({ kind: "missing", text: "no embedding model chosen" });
  } else if (activity && activity.embed_pending > 0) {
    const done = activity.embed_total - activity.embed_pending;
    chips.push({ kind: "busy", text: `indexing ${done} of ${activity.embed_total}` });
  } else {
    chips.push({
      kind: "ready",
      text: `embeddings ready (${settings.embed_model}${settings.embed_dim ? `, ${settings.embed_dim}d` : ""})`,
    });
  }

  if (!settings.chat_model) {
    chips.push({ kind: "missing", text: "no chat model chosen" });
  } else if (activity && activity.mood_pending > 0) {
    chips.push({ kind: "busy", text: `reading moods (${activity.mood_pending} left)` });
  } else {
    chips.push({ kind: "ready", text: `chat ready (${settings.chat_model})` });
  }

  if (activity?.pulling) {
    chips.push({
      kind: "busy",
      text: `downloading ${activity.pulling.model} ${Math.round(activity.pulling.pct)}%`,
    });
  }

  return (
    <div className="status-chips" data-testid="status-chips">
      {chips.map((c) => (
        <Chip key={c.text} kind={c.kind} text={c.text} />
      ))}
    </div>
  );
}
