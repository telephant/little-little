// Painted marks (spec paint-marks, ADR-0006). A mark is numbers-only JSON:
//   {"v":1,"strokes":[[x,y,x,y,...],...],"colors":[c,...]?}  integers 0..480 = a 48x48 box in tenths;
//   optional colors = one swatch index 0..7 per stroke (0 = follow the entry's mood).
// This module owns simplification, encoding and the smooth SVG path; the Rust side re-validates.

/** Provisional limits (spec D-6); the backend enforces the same numbers. */
export const MAX_STROKES = 8;
export const MAX_POINTS = 400;
export const MAX_BYTES = 8192;
export const MAX_COORD = 480;
export const MAX_COLOR = 7;

/** Swatches: index 0 follows the mood; the rest are fixed pigments (CSS variables from App.css). */
export const SWATCHES = [
  { name: "mood colour", css: null },
  { name: "ink", css: "var(--ink)" },
  { name: "coral", css: "var(--coral)" },
  { name: "lavender", css: "var(--lav)" },
  { name: "sky", css: "var(--sky)" },
  { name: "green", css: "var(--green)" },
  { name: "ochre", css: "var(--ochre)" },
  { name: "blue", css: "var(--cobalt)" },
] as const;

export interface DecodedMark {
  strokes: Stroke[];
  colors: number[]; // one per stroke, 0 = follow the mood
}

export type Pt = [number, number];
/** One stroke as flat x,y integers in tenths of a box unit. */
export type Stroke = number[];

/** Ramer–Douglas–Peucker. `epsilon` is in the points' own units (tenths; 8 = 0.8 box units). */
export function simplifyStroke(points: Pt[], epsilon = 8): Pt[] {
  if (points.length <= 2) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(points[i], points[a], points[b]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > epsilon && at !== -1) {
      keep[at] = true;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const clampInt = (n: number) => Math.max(0, Math.min(MAX_COORD, Math.round(n)));

/** Round, clamp to the box and flatten. */
export function toStroke(points: Pt[]): Stroke {
  return points.flatMap(([x, y]) => [clampInt(x), clampInt(y)]);
}

/** `colors` is written only when some stroke has a chosen colour, so plain marks stay byte-identical. */
export function encodeMark(strokes: Stroke[], colors?: number[]): string {
  return colors && colors.some((c) => c !== 0) ? JSON.stringify({ v: 1, strokes, colors }) : JSON.stringify({ v: 1, strokes });
}

/** Same rules as the backend; any problem returns null (never throws, so rendering can't break). */
export function decodeMark(s: string | null | undefined): DecodedMark | null {
  if (typeof s !== "string" || s.length > MAX_BYTES) return null;
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const obj = v as Record<string, unknown>;
  const hasColors = "colors" in obj;
  if (Object.keys(obj).length !== 2 + (hasColors ? 1 : 0) || !("v" in obj) || !("strokes" in obj) || obj.v !== 1) return null;
  const strokes = obj.strokes;
  if (!Array.isArray(strokes) || strokes.length < 1 || strokes.length > MAX_STROKES) return null;
  for (const st of strokes) {
    if (!Array.isArray(st) || st.length < 2 || st.length % 2 !== 0 || st.length / 2 > MAX_POINTS) return null;
    for (const n of st) {
      if (!Number.isInteger(n) || n < 0 || n > MAX_COORD) return null;
    }
  }
  let colors: number[] = strokes.map(() => 0);
  if (hasColors) {
    const c = obj.colors;
    if (!Array.isArray(c) || c.length !== strokes.length) return null;
    if (!c.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_COLOR)) return null;
    colors = c as number[];
  }
  return { strokes: strokes as Stroke[], colors };
}

/** True when the drawing can be saved (the Save button uses this). */
export function fitsLimits(strokes: Stroke[], colors?: number[]): boolean {
  if (strokes.length < 1 || strokes.length > MAX_STROKES) return false;
  if (strokes.some((s) => s.length < 2 || s.length / 2 > MAX_POINTS)) return false;
  return encodeMark(strokes, colors).length <= MAX_BYTES;
}

const f = (n: number) => String(Math.round(n * 10) / 10);

/** A stroke as a smooth SVG path in box units (0..48): midpoint-quadratic curves. */
export function strokesToPath(stroke: Stroke): string {
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < stroke.length; i += 2) pts.push([stroke[i] / 10, stroke[i + 1] / 10]);
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${f(pts[0][0])} ${f(pts[0][1])} l0.1 0`;
  if (pts.length === 2) return `M${f(pts[0][0])} ${f(pts[0][1])} L${f(pts[1][0])} ${f(pts[1][1])}`;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${f(last[0])} ${f(last[1])}`;
}
