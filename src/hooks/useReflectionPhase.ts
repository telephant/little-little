// Reflection lifecycle (spec paper-ui C-5): arriving -> present -> dissolving -> tucked.
// The reflection text itself stays in App's panel state, so recall needs no model call.
import { useCallback, useEffect, useRef, useState } from "react";

/** Provisional (tune in real use): keystrokes a reflection lingers before it dissolves. */
export const LINGER_KEYS = 14;
export const DRIFT_MS = 800;
export const DISSOLVE_MS = 1100;
const FALLBACK_SLACK_MS = 150; // if animationend never fires

export type ReflectionPhase = "none" | "arriving" | "present" | "dissolving" | "tucked";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export function useReflectionPhase() {
  const [phase, setPhaseState] = useState<ReflectionPhase>("none");
  const phaseRef = useRef<ReflectionPhase>("none");
  const keys = useRef(0);
  const lastKeyAt = useRef(0);
  const lastId = useRef<string | null>(null);

  const setPhase = useCallback((p: ReflectionPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  /** Call on every editor keystroke. */
  const noteKey = useCallback(() => {
    lastKeyAt.current = Date.now();
    const p = phaseRef.current;
    if (p === "arriving" || p === "present") {
      keys.current += 1;
      if (keys.current >= LINGER_KEYS) setPhase("dissolving");
    }
  }, [setPhase]);

  /** A ready reflection landed. Same id as before = a refetch: keep the current phase. */
  const onReady = useCallback(
    (reflectionId: string, requestedAt: number) => {
      if (reflectionId === lastId.current) return;
      lastId.current = reflectionId;
      keys.current = 0;
      // The user kept typing since the request went out: don't interrupt them.
      setPhase(lastKeyAt.current > requestedAt ? "tucked" : "arriving");
    },
    [setPhase],
  );

  const reset = useCallback(() => {
    lastId.current = null;
    keys.current = 0;
    setPhase("none");
  }, [setPhase]);

  const recall = useCallback(() => {
    keys.current = 0;
    setPhase("arriving");
  }, [setPhase]);

  const onAnimationEnd = useCallback(() => {
    if (phaseRef.current === "arriving") setPhase("present");
    else if (phaseRef.current === "dissolving") setPhase("tucked");
  }, [setPhase]);

  // Fallback so a missing animationend can never leave the panel stuck.
  useEffect(() => {
    if (phase !== "arriving" && phase !== "dissolving") return;
    const ms = (phase === "arriving" ? DRIFT_MS : DISSOLVE_MS) + FALLBACK_SLACK_MS;
    const t = setTimeout(onAnimationEnd, ms);
    return () => clearTimeout(t);
  }, [phase, onAnimationEnd]);

  return { phase, motion: prefersReducedMotion() ? ("fade" as const) : ("drift" as const), noteKey, onReady, reset, recall, onAnimationEnd };
}
