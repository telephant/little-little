// Manual mood picker (AC-19): 5 default brush marks; picking one is permanent (AI never overwrites).
import { ipc } from "../lib/ipc";
import { MoodMark } from "./MoodMark";

const LEVELS = [
  { level: 1, name: "rough" },
  { level: 2, name: "low" },
  { level: 3, name: "okay" },
  { level: 4, name: "good" },
  { level: 5, name: "great" },
];

export function MoodPicker(props: {
  entryId: string;
  level: number | null;
  label: string | null;
  source: "ai" | "manual" | null;
  onChanged: (level: number) => void;
}) {
  return (
    <div className="mood-picker" data-testid="mood-picker">
      {LEVELS.map(({ level, name }) => (
        <button
          key={level}
          aria-label={`mood ${name}`}
          aria-pressed={props.level === level}
          title={name}
          className={`mood-pick ${props.level === level ? "selected" : ""}`}
          onClick={() => {
            void ipc.setMood(props.entryId, level, null).then(() => props.onChanged(level));
          }}
        >
          <MoodMark level={level} size={34} />
        </button>
      ))}
      {props.level && <span className="mood-name">{LEVELS[props.level - 1]?.name}</span>}
      {props.label && <span className="mood-label">{props.label}</span>}
      {props.source === "ai" && <span className="mood-hint">AI guess — pick a mark to set your own</span>}
    </div>
  );
}
