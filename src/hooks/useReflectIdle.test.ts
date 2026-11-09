// quiet-reflection: the idle scheduler that decides when a NEW entry may ask for memories.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enoughToReflect, REFLECT_IDLE_MS, useReflectIdle } from "./useReflectIdle";

const LONG = "a day with a lot to say ".repeat(12); // well over the minimum
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useReflectIdle", () => {
  /** QR-1: enough text, then quiet for the whole idle window → ask once, for that entry. */
  it("QR-1: asks once after the idle window with enough text", () => {
    const ask = vi.fn();
    const { result } = renderHook(() => useReflectIdle(ask));
    act(() => result.current.schedule("e1", LONG));
    act(() => void vi.advanceTimersByTime(REFLECT_IDLE_MS - 1));
    expect(ask).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith("e1");
  });

  /** QR-2: typing again (cancel, then a later schedule) restarts the whole window. */
  it("QR-2: more typing restarts the window", () => {
    const ask = vi.fn();
    const { result } = renderHook(() => useReflectIdle(ask));
    act(() => result.current.schedule("e1", LONG));
    act(() => void vi.advanceTimersByTime(REFLECT_IDLE_MS - 1000));
    act(() => result.current.cancel()); // a keystroke
    act(() => void vi.advanceTimersByTime(REFLECT_IDLE_MS * 2));
    expect(ask).not.toHaveBeenCalled(); // cancelled for good until the next save schedules again
    act(() => result.current.schedule("e1", LONG));
    act(() => void vi.advanceTimersByTime(REFLECT_IDLE_MS));
    expect(ask).toHaveBeenCalledTimes(1);
  });

  /** QR-3: a short entry never asks. */
  it("QR-3: too little text never asks", () => {
    const ask = vi.fn();
    const { result } = renderHook(() => useReflectIdle(ask));
    act(() => result.current.schedule("e1", "quick note"));
    act(() => void vi.advanceTimersByTime(REFLECT_IDLE_MS * 3));
    expect(ask).not.toHaveBeenCalled();
    expect(enoughToReflect("quick note")).toBe(false);
    expect(enoughToReflect(LONG)).toBe(true);
    expect(enoughToReflect("今天".repeat(110))).toBe(true); // no spaces in Chinese: count characters, not words
  });

  /** QR-4: leaving the component cancels a pending ask. */
  it("QR-4: unmounting cancels a pending ask", () => {
    const ask = vi.fn();
    const { result, unmount } = renderHook(() => useReflectIdle(ask));
    act(() => result.current.schedule("e1", LONG));
    unmount();
    act(() => void vi.advanceTimersByTime(REFLECT_IDLE_MS * 2));
    expect(ask).not.toHaveBeenCalled();
  });
});
