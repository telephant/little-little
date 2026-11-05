import { useEffect, useRef } from "react";

/** Debounced autosave: calls `save` once per quiet window (default 1s — provisional). */
export function useAutosave(value: string, save: (v: string) => void, delayMs = 1000) {
  const first = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (first.current) {
      first.current = false; // don't save the initial load
      return;
    }
    const t = setTimeout(() => saveRef.current(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
}
