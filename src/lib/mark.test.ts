// paint-marks TC-9: the stroke library (simplify, encode/decode, smooth path).
import { describe, expect, it } from "vitest";
import {
  MAX_BYTES,
  MAX_POINTS,
  MAX_STROKES,
  decodeMark,
  encodeMark,
  fitsLimits,
  simplifyStroke,
  strokesToPath,
  toStroke,
  type Pt,
} from "./mark";

const noisyLine = (n: number): Pt[] =>
  Array.from({ length: n }, (_, i) => [20 + (i * 400) / (n - 1), 240 + (i % 2 ? 3 : -3)] as Pt); // ±0.3 box units
const circle = (n: number): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.round(240 + 150 * Math.cos(a)), Math.round(240 + 150 * Math.sin(a))] as Pt;
  });

describe("simplifyStroke", () => {
  it("reduces a noisy straight line to its end points", () => {
    const out = simplifyStroke(noisyLine(120));
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out[0]).toEqual([20, 237]);
    expect(out[out.length - 1][0]).toBeCloseTo(420, 0);
  });
  it("keeps a closed loop recognisable (not collapsed, not bloated)", () => {
    const out = simplifyStroke(circle(80));
    expect(out.length).toBeGreaterThan(8);
    expect(out.length).toBeLessThan(60);
    expect(out[0]).toEqual(out[out.length - 1]); // still closed
  });
  it("keeps a single tap and a two-point line", () => {
    expect(simplifyStroke([[100, 100]])).toEqual([[100, 100]]);
    expect(simplifyStroke([[0, 0], [50, 50]])).toEqual([[0, 0], [50, 50]]);
  });
});

describe("toStroke", () => {
  it("rounds to integers, clamps to 0..480 and flattens", () => {
    expect(toStroke([[10.4, 20.6], [-5, 999]])).toEqual([10, 21, 0, 480]);
  });
});

describe("encodeMark / decodeMark", () => {
  const strokes = [toStroke(noisyLine(10)), toStroke([[240, 240]])];
  it("round-trips exactly (no colors key when every stroke follows the mood)", () => {
    const json = encodeMark(strokes);
    expect(JSON.parse(json)).toEqual({ v: 1, strokes });
    expect(decodeMark(json)).toEqual({ strokes, colors: [0, 0] });
  });
  it("TC-23: encodes colors only when some are non-zero, and decodes them", () => {
    const json = encodeMark(strokes, [0, 3]);
    expect(JSON.parse(json)).toEqual({ v: 1, strokes, colors: [0, 3] });
    expect(decodeMark(json)).toEqual({ strokes, colors: [0, 3] });
    expect(JSON.parse(encodeMark(strokes, [0, 0]))).toEqual({ v: 1, strokes });
  });
  it.each([
    ["length mismatch", '{"v":1,"strokes":[[1,2,3,4],[5,6,7,8]],"colors":[0]}'],
    ["value 8", '{"v":1,"strokes":[[1,2,3,4]],"colors":[8]}'],
    ["negative", '{"v":1,"strokes":[[1,2,3,4]],"colors":[-1]}'],
    ["fractional", '{"v":1,"strokes":[[1,2,3,4]],"colors":[1.5]}'],
    ["not an array", '{"v":1,"strokes":[[1,2,3,4]],"colors":3}'],
    ["extra key", '{"v":1,"strokes":[[1,2,3,4]],"colors":[0],"x":1}'],
  ])("decode rejects bad colors: %s", (_n, s) => {
    expect(decodeMark(s)).toBeNull();
  });
  it.each([
    ["not JSON", "M0 0 L1 1"],
    ["null", null],
    ["wrong version", '{"v":2,"strokes":[[1,2,3,4]]}'],
    ["extra key", '{"v":1,"strokes":[[1,2,3,4]],"x":1}'],
    ["odd count", '{"v":1,"strokes":[[1,2,3]]}'],
    ["out of range", '{"v":1,"strokes":[[1,2,481,4]]}'],
    ["negative", '{"v":1,"strokes":[[-1,2,3,4]]}'],
    ["fractional", '{"v":1,"strokes":[[1.5,2,3,4]]}'],
    ["no strokes", '{"v":1,"strokes":[]}'],
    ["empty stroke", '{"v":1,"strokes":[[]]}'],
    ["strings", '{"v":1,"strokes":[["a","b","c","d"]]}'],
    ["too many strokes", JSON.stringify({ v: 1, strokes: Array(MAX_STROKES + 1).fill([1, 2, 3, 4]) })],
    ["too many points", JSON.stringify({ v: 1, strokes: [Array((MAX_POINTS + 1) * 2).fill(5)] })],
    ["too large", JSON.stringify({ v: 1, strokes: [[1, 2, 3, 4]], pad: "x".repeat(MAX_BYTES) })],
  ])("decode rejects: %s", (_n, s) => {
    expect(decodeMark(s as string | null)).toBeNull();
  });
});

describe("fitsLimits", () => {
  it("accepts a normal drawing and rejects too many strokes or points", () => {
    expect(fitsLimits([toStroke(circle(40))])).toBe(true);
    expect(fitsLimits(Array(MAX_STROKES + 1).fill([1, 2, 3, 4]))).toBe(false);
    expect(fitsLimits([Array((MAX_POINTS + 1) * 2).fill(5)])).toBe(false);
  });
});

describe("strokesToPath", () => {
  it("turns a tap into a dot", () => {
    expect(strokesToPath([240, 240])).toBe("M24 24 l0.1 0");
  });
  it("draws a straight segment for two points", () => {
    expect(strokesToPath([0, 0, 480, 480])).toBe("M0 0 L48 48");
  });
  it("smooths 3+ points with quadratic segments in box units", () => {
    const d = strokesToPath([100, 100, 200, 300, 400, 100]);
    expect(d.startsWith("M10 10")).toBe(true);
    expect(d).toContain("Q");
    expect(d.endsWith("L40 10")).toBe(true);
  });
});
