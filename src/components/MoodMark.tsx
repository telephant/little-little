// The default brush mark for a mood level (1–5), or the open ink ring for "no mood" (null).
// Single source for list, calendar, picker, legend, header and onboarding (spec paper-ui §6).
// With a valid `mark` (paint-marks) it draws the user's painted strokes instead, each in its chosen colour.
// Drawn in a 48x48 box; `size` only changes width/height, never the markup.
import { SWATCHES, decodeMark, strokesToPath, type Stroke as MarkStroke } from "../lib/mark";

type Level = 1 | 2 | 3 | 4 | 5;
type Stroke = { d: string; w: number; o: number };
type Fleck = { dot?: [number, number]; line?: string };

const NAMES: Record<Level, string> = { 1: "rough", 2: "low", 3: "okay", 4: "good", 5: "great" };

const MARKS: Record<Level, { strokes: Stroke[]; fleck: Fleck }> = {
  1: {
    strokes: [
      { d: "M9 11 Q22 26 39 38", w: 11, o: 0.95 },
      { d: "M11 38 Q26 24 37 10", w: 9, o: 0.62 },
    ],
    fleck: { dot: [14, 14] },
  },
  2: {
    strokes: [
      { d: "M8 17 Q24 44 40 19", w: 11, o: 0.95 },
      { d: "M14 11 Q24 16 34 11", w: 7, o: 0.6 },
    ],
    fleck: { line: "M16 37 q8 3 16 0" },
  },
  3: {
    strokes: [
      { d: "M8 20 Q24 15 40 20", w: 10, o: 0.95 },
      { d: "M8 31 Q24 36 40 31", w: 10, o: 0.62 },
    ],
    fleck: { dot: [37, 25.5] },
  },
  4: {
    strokes: [
      { d: "M9 38 Q20 37 38 12", w: 11, o: 0.95 },
      { d: "M10 28 Q16 26 25 16", w: 7, o: 0.6 },
    ],
    fleck: { dot: [36, 31] },
  },
  5: {
    strokes: [
      { d: "M24 40 Q23 24 25 8", w: 11, o: 0.95 },
      { d: "M13 38 Q10 26 8 14", w: 8, o: 0.72 },
      { d: "M35 38 Q38 26 40 14", w: 8, o: 0.72 },
    ],
    fleck: { dot: [24, 5] },
  },
};

/** The painted strokes as an svg group, shared by the finished mark and the drawing canvas so they match exactly.
 *  Swatch 0 follows the mood (its --mN colour, or ink with no mood); the others are fixed pigments. */
export function PaintedStrokes(props: { strokes: MarkStroke[]; colors: number[]; level: number | null }) {
  const known = !!props.level && props.level >= 1 && props.level <= 5;
  const mood = known ? `var(--m${props.level})` : "var(--ink)";
  return (
    <g filter="url(#paint-s)" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {props.strokes.map((st, i) => (
        <path key={i} d={strokesToPath(st)} style={{ stroke: SWATCHES[props.colors[i] ?? 0]?.css ?? mood, strokeWidth: 5 }} />
      ))}
    </g>
  );
}

export function moodName(level: number | null): string {
  return level && level >= 1 && level <= 5 ? NAMES[level as Level] : "no mood";
}

export function MoodMark(props: { level: number | null; size?: number; mark?: string | null }) {
  const size = props.size ?? 48;
  const common = {
    className: "mood-mark",
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    role: "img" as const,
    "aria-label": moodName(props.level),
  };
  const level = props.level;
  const decoded = props.mark ? decodeMark(props.mark) : null;
  const painted = decoded; // damaged data → null → default mark, never a crash
  if (painted) {
    const known = !!level && level >= 1 && level <= 5;
    return (
      <svg
        {...common}
        data-mood={known ? String(level) : "none"}
        data-painted="true"
        aria-label={`painted mark (${moodName(props.level)})`}
      >
        <PaintedStrokes strokes={painted.strokes} colors={painted.colors} level={props.level} />
      </svg>
    );
  }
  if (!level || level < 1 || level > 5) {
    return (
      <svg {...common} data-mood="none">
        <g filter="url(#ink)">
          <path d="M24 9 A15 15 0 1 1 19.5 9.7" fill="none" strokeLinecap="round" style={{ stroke: "var(--ink)", strokeWidth: 3.2 }} />
        </g>
      </svg>
    );
  }
  const { strokes, fleck } = MARKS[level as Level];
  const colour = `var(--m${level})`;
  return (
    <svg {...common} data-mood={String(level)}>
      <g filter="url(#paint-s)" fill="none" strokeLinecap="round">
        {strokes.map((s) => (
          <path key={s.d} d={s.d} style={{ stroke: colour, strokeWidth: s.w, strokeOpacity: s.o }} />
        ))}
        {fleck.dot && <circle cx={fleck.dot[0]} cy={fleck.dot[1]} r={2.1} style={{ fill: "var(--ink)", stroke: "none" }} />}
        {fleck.line && <path d={fleck.line} style={{ stroke: "var(--ink)", strokeWidth: 2.2 }} />}
      </g>
    </svg>
  );
}
