// Drawing surface for a painted mark (spec paint-marks C-8). Pointer-only drawing; every action is also a
// real button. The surface renders the real painted result while you draw (no separate preview, D-10), so
// what you see is exactly what is saved. Each stroke keeps the swatch that was selected when it was drawn (D-9).
import { useRef, useState } from "react";
import { MAX_POINTS, MAX_STROKES, SWATCHES, encodeMark, fitsLimits, simplifyStroke, toStroke, type Pt, type Stroke } from "../lib/mark";
import { PaintedStrokes } from "./MoodMark";

const SIZE = 240; // px, only used when the element reports no size (tests)

/** A new point is kept only once the pointer has moved this far from the last kept one (tenths of a box
 *  unit, ~0.6). Thinning on arrival means the line already drawn NEVER changes as the stroke grows, so
 *  nothing shakes under the pointer; and what is shown while drawing is exactly what is kept. Provisional. */
const MIN_STEP = 6;

/** The stroke as shown and as kept: kept points plus the pointer's current position. */
function currentStroke(kept: Pt[], cursor: Pt | null): Stroke {
  const last = kept[kept.length - 1];
  const pts = cursor && last && (cursor[0] !== last[0] || cursor[1] !== last[1]) ? [...kept, cursor] : kept;
  const stroke = toStroke(pts);
  // Rare: a very long, dense stroke over the point limit. Fall back to simplifying (only at the limit).
  if (stroke.length / 2 <= MAX_POINTS) return stroke;
  let eps = 8;
  let simpler = simplifyStroke(pts, eps);
  while (simpler.length > MAX_POINTS && eps < 400) {
    eps *= 1.5;
    simpler = simplifyStroke(pts, eps);
  }
  return toStroke(simpler);
}

export function MarkCanvas(props: {
  level: number | null;
  hasMark: boolean;
  onSave: (mark: string) => Promise<void>;
  onCancel: () => void;
  onUseDefault: () => Promise<void>;
}) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [colors, setColors] = useState<number[]>([]);
  const [swatchIx, setSwatchIx] = useState(0); // 0 = mood colour
  const live = useRef<Pt[] | null>(null);
  const cursor = useRef<Pt | null>(null);
  const [, tick] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const surface = useRef<HTMLDivElement>(null);

  const toPt = (e: React.PointerEvent): Pt => {
    const r = surface.current!.getBoundingClientRect();
    const w = r.width || SIZE;
    const h = r.height || SIZE;
    return [((e.clientX - r.left) / w) * 480, ((e.clientY - r.top) / h) * 480];
  };

  function down(e: React.PointerEvent) {
    if (strokes.length >= MAX_STROKES) {
      setLimitHit(true);
      return;
    }
    try {
      surface.current?.setPointerCapture?.(e.pointerId);
    } catch {
      /* not capturable (tests, odd devices): moves still arrive while over the surface */
    }
    const p = toPt(e);
    live.current = [p];
    cursor.current = p;
    tick((n) => n + 1);
  }
  function move(e: React.PointerEvent) {
    if (!live.current) return;
    const p = toPt(e);
    const last = live.current[live.current.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= MIN_STEP) live.current.push(p);
    cursor.current = p;
    tick((n) => n + 1);
  }
  function up() {
    if (!live.current) return;
    const done = currentStroke(live.current, cursor.current);
    live.current = null;
    cursor.current = null;
    setStrokes((s) => [...s, done]);
    setColors((c) => [...c, swatchIx]);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await props.onSave(encodeMark(strokes, colors));
    } catch (e) {
      setError(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const canSave = strokes.length > 0 && fitsLimits(strokes, colors) && !busy;
  // the stroke being drawn, simplified on the fly, shown with the same painted look
  const liveStroke = live.current && live.current.length ? currentStroke(live.current, cursor.current) : null;
  const shownStrokes = liveStroke ? [...strokes, liveStroke] : strokes;
  const shownColors = liveStroke ? [...colors, swatchIx] : colors;

  return (
    <section className="mark-canvas" aria-label="paint a mark">
      <div className="mark-canvas-row">
        <div
          ref={surface}
          className="mark-surface"
          data-testid="mark-surface"
          data-strokes={strokes.length}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <svg viewBox="0 0 48 48" className="mark-art" aria-hidden="true">
            <PaintedStrokes strokes={shownStrokes} colors={shownColors} level={props.level} />
          </svg>
          {shownStrokes.length === 0 && <span className="mark-hint-draw">draw here</span>}
        </div>
      </div>

      <div className="mark-swatches" role="group" aria-label="colour">
        {SWATCHES.map((sw, i) => (
          <button
            key={sw.name}
            className="swatch"
            aria-label={sw.name}
            title={sw.name}
            aria-pressed={swatchIx === i}
            onClick={() => setSwatchIx(i)}
            style={{ background: sw.css ?? (props.level ? `var(--m${props.level})` : "var(--ink)") }}
          />
        ))}
      </div>

      {limitHit && <p className="hint">Stroke limit reached ({MAX_STROKES}). Undo one to draw more.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {confirming ? (
        <div className="mark-actions">
          <span>Discard this drawing?</span>
          <button className="text-link" onClick={props.onCancel}>
            Discard
          </button>
          <button className="text-link" onClick={() => setConfirming(false)}>
            Keep drawing
          </button>
        </div>
      ) : (
        <div className="mark-actions">
          <button className="text-link" disabled={!canSave} onClick={() => void save()}>
            Save
          </button>
          <button
            className="text-link"
            disabled={strokes.length === 0}
            onClick={() => {
              setStrokes((s) => s.slice(0, -1));
              setColors((c) => c.slice(0, -1));
              setLimitHit(false);
            }}
          >
            Undo
          </button>
          <button
            className="text-link"
            disabled={strokes.length === 0}
            onClick={() => {
              setStrokes([]);
              setColors([]);
              setLimitHit(false);
            }}
          >
            Clear
          </button>
          <button className="text-link" onClick={() => (strokes.length > 0 ? setConfirming(true) : props.onCancel())}>
            Cancel
          </button>
          {props.hasMark && (
            <button className="text-link" onClick={() => void props.onUseDefault()}>
              Use default mark
            </button>
          )}
        </div>
      )}
    </section>
  );
}
