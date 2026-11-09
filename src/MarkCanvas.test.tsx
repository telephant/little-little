// paint-marks T-07: painting a mark in the editor (TC-7, TC-8, TC-10, TC-20).
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { Editor } from "./components/Editor";
import { fake, resetFake, setFakeModelsChosen } from "./test/fakeIpc";
import { decodeMark, encodeMark, toStroke } from "./lib/mark";
import type { Entry } from "./lib/types";

vi.mock("./lib/ipc", () => import("./test/fakeIpc").then((m) => ({ ipc: m.fake })));

beforeEach(() => {
  resetFake();
  setFakeModelsChosen();
});

/** jsdom has no PointerEvent: a MouseEvent with the pointer event name carries clientX/clientY to React. */
const ptr = (el: Element, type: string, x: number, y: number) =>
  fireEvent(el, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));

function draw(surface: Element, pts: [number, number][]) {
  ptr(surface, "pointerdown", ...pts[0]);
  for (const p of pts.slice(1)) ptr(surface, "pointermove", ...p);
  ptr(surface, "pointerup", ...pts[pts.length - 1]);
}
const surface = () => screen.getByTestId("mark-surface");
const count = () => Number(surface().getAttribute("data-strokes"));
const A: [number, number][] = [[20, 20], [60, 100], [120, 40], [200, 200]];
const B: [number, number][] = [[30, 200], [100, 180], [220, 60]];
const C: [number, number][] = [[10, 120], [230, 130]];

async function editorWithEntry(over: Partial<Entry> = {}) {
  const e = { ...(await fake.createEntry()), ...over };
  const view = render(<Editor entry={e} />);
  return { e, ...view };
}
const openCanvas = () => fireEvent.click(screen.getByRole("button", { name: /paint your own|repaint/i }));

describe("paint a mark (TC-8)", () => {
  it("two strokes + Save stores valid JSON and shows the painted mark in the header", async () => {
    const { e, container } = await editorWithEntry();
    openCanvas();
    draw(surface(), A);
    draw(surface(), B);
    expect(count()).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(fake.setMark).toHaveBeenCalledTimes(1));
    const [id, json] = fake.setMark.mock.calls[0] as [string, string];
    expect(id).toBe(e.id);
    expect(decodeMark(json)?.strokes).toHaveLength(2);
    await waitFor(() => expect(container.querySelector('.editor-mark svg[data-painted="true"]')).not.toBeNull());
    expect(screen.queryByTestId("mark-surface")).toBeNull(); // canvas closed
  });

  it("a failed save keeps the canvas and the drawing and says why", async () => {
    fake.setMark.mockRejectedValueOnce(new Error("invalid mark: too big"));
    await editorWithEntry();
    openCanvas();
    draw(surface(), A);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too big|couldn.t save/i);
    expect(count()).toBe(1);
  });
});

describe("undo and clear (TC-10)", () => {
  it("Undo drops the last stroke, Clear drops all, nothing is stored until Save", async () => {
    await editorWithEntry();
    openCanvas();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    draw(surface(), A);
    draw(surface(), B);
    draw(surface(), C);
    expect(count()).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(count()).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(count()).toBe(0);
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(fake.setMark).not.toHaveBeenCalled();
  });

  it("stops accepting strokes at the limit and says so", async () => {
    await editorWithEntry();
    openCanvas();
    for (let i = 0; i < 9; i++) draw(surface(), i % 2 ? A : B);
    expect(count()).toBe(8);
    expect(screen.getByText(/stroke limit/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
  });
});

describe("cancel asks before discarding (TC-20)", () => {
  it("with strokes: asks, Keep drawing returns, Discard closes with nothing stored", async () => {
    await editorWithEntry();
    openCanvas();
    draw(surface(), A);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByText(/discard this drawing\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /keep drawing/i }));
    expect(screen.queryByText(/discard this drawing\?/i)).toBeNull();
    expect(count()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    fireEvent.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(screen.queryByTestId("mark-surface")).toBeNull();
    expect(fake.setMark).not.toHaveBeenCalled();
  });

  it("empty canvas: Cancel closes at once", async () => {
    await editorWithEntry();
    openCanvas();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByTestId("mark-surface")).toBeNull();
    expect(screen.queryByText(/discard this drawing\?/i)).toBeNull();
  });
});

describe("use default mark (TC-7)", () => {
  async function startJournal() {
    render(<App />);
    const pass = await screen.findByLabelText(/passphrase/i);
    fireEvent.change(pass, { target: { value: "hunter2 hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: /create journal/i }));
    return await screen.findByTestId("editor-body");
  }

  it("clears the mark and the default mood-4 mark returns in header and list", async () => {
    const editor = await startJournal();
    fireEvent.change(editor, { target: { value: "a painted day" } });
    fireEvent.click(await screen.findByRole("button", { name: /mood good/i }));
    await waitFor(() => expect(fake.setMood).toHaveBeenCalled());
    await waitFor(() => expect(fake.saveEntry).toHaveBeenCalled(), { timeout: 6000 });

    openCanvas();
    draw(surface(), A);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    const list = screen.getByTestId("entry-list");
    await waitFor(() => expect(list.querySelector('svg[data-painted="true"]')).not.toBeNull(), { timeout: 6000 });

    openCanvas();
    fireEvent.click(screen.getByRole("button", { name: /use default mark/i }));
    await waitFor(() => expect(fake.clearMark).toHaveBeenCalled());
    await waitFor(() => expect(list.querySelector('svg[data-painted="true"]')).toBeNull());
    expect(within(list).getAllByRole("img")[0]).toHaveAttribute("data-mood", "4");
    expect(document.querySelector('.editor-mark svg')).toHaveAttribute("data-mood", "4");
    expect(document.querySelector('.editor-mark svg[data-painted]')).toBeNull();
  });

  it("offers 'use default mark' only when a mark exists", async () => {
    await editorWithEntry();
    openCanvas();
    expect(screen.queryByRole("button", { name: /use default mark/i })).toBeNull();
  });
});

const swatch = (name: string) => screen.getByRole("button", { name });
const surfacePaths = () => [...surface().querySelectorAll("path")];

describe("colour per stroke (TC-25)", () => {
  it("each stroke is saved with the swatch that was pressed when it was drawn", async () => {
    const { container } = await editorWithEntry();
    openCanvas();
    expect(swatch("mood colour")).toHaveAttribute("aria-pressed", "true");
    draw(surface(), A);
    fireEvent.click(swatch("coral"));
    expect(swatch("coral")).toHaveAttribute("aria-pressed", "true");
    expect(swatch("mood colour")).toHaveAttribute("aria-pressed", "false");
    draw(surface(), B);
    fireEvent.click(swatch("sky"));
    draw(surface(), C);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(fake.setMark).toHaveBeenCalledTimes(1));
    const json = (fake.setMark.mock.calls[0] as [string, string])[1];
    expect(decodeMark(json)?.colors).toEqual([0, 2, 4]);
    await waitFor(() => expect(container.querySelector('.editor-mark svg[data-painted="true"]')).not.toBeNull());
    const styles = [...container.querySelectorAll(".editor-mark svg path")].map((p) => p.getAttribute("style") ?? "");
    expect(styles[0]).not.toMatch(/coral|sky/);
    expect(styles[1]).toContain("var(--coral)");
    expect(styles[2]).toContain("var(--sky)");
  });

  it("undo gives the colour back with the stroke", async () => {
    await editorWithEntry();
    openCanvas();
    fireEvent.click(swatch("green"));
    draw(surface(), A);
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    draw(surface(), B);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(fake.setMark).toHaveBeenCalled());
    expect(decodeMark((fake.setMark.mock.calls[0] as [string, string])[1])?.colors).toEqual([5]);
  });
});

describe("what you draw is what you get (TC-26)", () => {
  it("has no separate preview; the canvas shows the painted paths and they equal the saved mark's", async () => {
    const { container } = await editorWithEntry();
    openCanvas();
    expect(document.querySelector(".mark-preview")).toBeNull();
    expect(screen.queryByLabelText(/^preview$/i)).toBeNull();
    draw(surface(), A);
    draw(surface(), B);
    expect(surface().querySelector('g[filter="url(#paint-s)"]')).not.toBeNull();
    const onCanvas = surfacePaths().map((p) => p.getAttribute("d"));
    expect(onCanvas).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(container.querySelector('.editor-mark svg[data-painted="true"]')).not.toBeNull());
    const saved = [...container.querySelectorAll(".editor-mark svg path")].map((p) => p.getAttribute("d"));
    expect(saved).toEqual(onCanvas);
  });
});

describe("the label says it can be painted (TC-27)", () => {
  it("reads 'paint your own' with no mark and 'repaint' with one, on the control that opens the canvas", async () => {
    const plain = await editorWithEntry();
    const btn = screen.getByRole("button", { name: /paint your own/i });
    expect(btn).toHaveTextContent("paint your own");
    plain.unmount();
    const painted = await editorWithEntry({ mark: encodeMark([toStroke([[60, 60], [240, 400]])]) });
    const btn2 = screen.getByRole("button", { name: /repaint/i });
    expect(btn2).toHaveTextContent("repaint");
    fireEvent.click(btn2);
    expect(screen.getByTestId("mark-surface")).toBeInTheDocument();
    painted.unmount();
  });
});

describe("no shaking while drawing", () => {
  const livePath = () => surfacePaths().map((p) => p.getAttribute("d") ?? "");

  it("the part already drawn never changes when the stroke grows", async () => {
    await editorWithEntry();
    openCanvas();
    const pts: [number, number][] = [];
    for (let i = 0; i < 40; i++) pts.push([10 + i * 5, 120 + Math.round(Math.sin(i / 3) * 40) + (i % 2)]); // wavy + jitter
    ptr(surface(), "pointerdown", ...pts[0]);
    let prev = livePath()[0] ?? "";
    for (const p of pts.slice(1)) {
      ptr(surface(), "pointermove", ...p);
      const now = livePath()[0];
      // everything except the final segment (a dot's "l0.1 0" or a line's "L x y") must be unchanged
      const stable = prev.replace(/\s[Ll][^QLl]*$/, "");
      expect(now.startsWith(stable), `grew from ${prev} to ${now}`).toBe(true);
      prev = now;
    }
  });

  it("what is shown while drawing is exactly what is kept when the pointer is released", async () => {
    await editorWithEntry();
    openCanvas();
    const pts: [number, number][] = Array.from({ length: 60 }, (_, i) => [8 + i * 3.5, 100 + Math.round(Math.cos(i / 4) * 50)]);
    ptr(surface(), "pointerdown", ...pts[0]);
    for (const p of pts.slice(1)) ptr(surface(), "pointermove", ...p);
    const beforeUp = livePath();
    ptr(surface(), "pointerup", ...pts[pts.length - 1]);
    expect(livePath()).toEqual(beforeUp);
  });

  it("thins very dense input but keeps the stroke inside the point limit", async () => {
    await editorWithEntry();
    openCanvas();
    ptr(surface(), "pointerdown", 5, 5);
    for (let i = 0; i < 3000; i++) ptr(surface(), "pointermove", 5 + (i % 230), 5 + Math.floor(i / 230) * 12 + (i % 2));
    ptr(surface(), "pointerup", 100, 100);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(fake.setMark).toHaveBeenCalled());
    const d = decodeMark((fake.setMark.mock.calls[0] as [string, string])[1]);
    expect(d).not.toBeNull();
    expect(d!.strokes[0].length / 2).toBeLessThanOrEqual(400);
  });
});
