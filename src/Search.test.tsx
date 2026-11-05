// T-15: search UI — instant results, async answer, hidden-count note.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { fake, resetFake, setFakeModelsChosen, setFakeSearch } from "./test/fakeIpc";
import type { SearchOutput } from "./lib/types";

vi.mock("./lib/ipc", () => import("./test/fakeIpc").then((m) => ({ ipc: m.fake })));

beforeEach(() => {
  resetFake();
  setFakeModelsChosen();
});

const OUT: SearchOutput = {
  results: [
    { entry_id: "e-a", snippet: "Big interview at Northwind on Thursday.", created_at: "2026-03-02T19:00:00Z", distance: 0.3 },
    { entry_id: "e-b", snippet: "The interview went so much better than I feared.", created_at: "2026-03-06T21:30:00Z", distance: 0.4 },
    { entry_id: "e-c", snippet: "First month at Northwind done.", created_at: "2026-08-19T18:25:00Z", distance: 0.6 },
  ],
  hidden_count: 0,
};

async function openSearch() {
  render(<App />);
  const pass = await screen.findByLabelText(/passphrase/i);
  fireEvent.change(pass, { target: { value: "hunter2 hunter2" } });
  fireEvent.click(screen.getByRole("button", { name: /create journal/i }));
  await screen.findByTestId("editor-body");
  fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
  return await screen.findByLabelText(/search query/i);
}

describe("search UI (T-15)", () => {
  it("renders results immediately, then the answer with cited dates", async () => {
    let releaseAnswer!: () => void;
    const gate = new Promise<void>((res) => (releaseAnswer = res));
    setFakeSearch(OUT, async () => {
      await gate;
      return { answer: "Early March — and it went well.", cited_dates: ["2026-03-02", "2026-03-06"] };
    });
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "anxious about work" } });
    fireEvent.submit(input.closest("form")!);

    // Results are visible while the answer is still pending.
    const results = await screen.findAllByTestId("search-result");
    expect(results).toHaveLength(3);
    expect(screen.queryByTestId("search-answer")).not.toBeInTheDocument();
    expect(screen.getByText(/asking…/)).toBeInTheDocument();

    releaseAnswer();
    const answer = await screen.findByTestId("search-answer");
    expect(answer).toHaveTextContent(/went well/);
    expect(answer).toHaveTextContent(/2026-03-02, 2026-03-06/);
  });

  it("failed answer keeps results and shows a calm note", async () => {
    setFakeSearch(OUT, async () => {
      throw new Error("provider down");
    });
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "anything" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findAllByTestId("search-result");
    await screen.findByText(/couldn't ask the model/i);
    expect(screen.getAllByTestId("search-result")).toHaveLength(3);
  });

  it("shows the hidden-entries note when cloud filtering removed matches", async () => {
    setFakeSearch({ ...OUT, hidden_count: 1 });
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "health" } });
    fireEvent.submit(input.closest("form")!);
    const note = await screen.findByTestId("hidden-note");
    expect(note).toHaveTextContent(/1 entry hidden \(never send to cloud\)/);
  });

  it("clicking a result opens its entry", async () => {
    setFakeSearch(OUT);
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "northwind" } });
    fireEvent.submit(input.closest("form")!);
    const results = await screen.findAllByTestId("search-result");
    fireEvent.click(results[0]);
    await waitFor(() => expect(fake.getEntry).toHaveBeenCalledWith("e-a"));
  });
});
