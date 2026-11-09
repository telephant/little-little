// Quiet reflection: a NEW entry only asks for memories and a reflection after a long pause, and
// only once there is something to reflect on. Typing again cancels; the next save re-schedules.
import { useCallback, useEffect, useRef } from "react";

/** Provisional (tune in real use): quiet time after the last save before a new entry may ask. */
export const REFLECT_IDLE_MS = 30_000;
/** Provisional: non-space characters needed (~40 English words; counts characters so Chinese text,
 *  which has no spaces, works too). */
export const REFLECT_MIN_CHARS = 200;

/** Live values; tests that exercise the old "panel right after saving" flows set both to 0. */
export const reflectTiming = { idleMs: REFLECT_IDLE_MS, minChars: REFLECT_MIN_CHARS };

export function enoughToReflect(body: string): boolean {
  return Array.from(body.replace(/\s/g, "")).length >= reflectTiming.minChars;
}

export function useReflectIdle(ask: (entryId: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const askRef = useRef(ask);
  askRef.current = ask;

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const schedule = useCallback(
    (entryId: string, body: string) => {
      cancel();
      if (!enoughToReflect(body)) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        askRef.current(entryId);
      }, reflectTiming.idleMs);
    },
    [cancel],
  );

  useEffect(() => cancel, [cancel]);
  return { schedule, cancel };
}
