import { useEffect, useRef } from "react";

/** Debounced autosave: calls `save` once per quiet window (default 1s — provisional).
 *
 *  The initial value is a baseline, not a change. Comparing against it (instead of skipping "the
 *  first effect run") means an edit that lands before the mount effect has flushed is still saved. */
export function useAutosave(value: string, save: (v: string) => void, delayMs = 1000) {
  const baseline = useRef<string | null>(value);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (baseline.current !== null) {
      if (value === baseline.current) return; // still the loaded text: nothing to save
      baseline.current = null; // first real edit seen; from now on every change saves
    }
    const t = setTimeout(() => saveRef.current(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
}
