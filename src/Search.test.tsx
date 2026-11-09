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

describe("painted search (paper-ui T-09)", () => {
  /** TC-21 (search part): answer wash, sources, results as notes, hidden note, empty state. */
  it("TC-21: answer, sources, hidden note and results render the painted structure", async () => {
    setFakeSearch({ ...OUT, hidden_count: 2 }, async () => ({ answer: "It went well.", cited_dates: ["2026-03-06"] }));
    const input = await openSearch();
    expect(input.closest("form")).toHaveClass("search-line");
    fireEvent.change(input, { target: { value: "interview" } });
    fireEvent.submit(input.closest("form")!);
    const answer = await screen.findByTestId("search-answer");
    expect(answer).toHaveClass("answer-wash");
    expect(answer.querySelector(".sources")).toHaveTextContent(/2026-03-06/);
    expect(screen.getByTestId("hidden-note")).toHaveClass("search-note-quiet");
    const results = screen.getAllByTestId("search-result");
    expect(results).toHaveLength(3);
    for (const r of results) expect(r).toHaveClass("search-note");
  });

  it("TC-21: no results shows the quiet empty note", async () => {
    setFakeSearch({ results: [], hidden_count: 0 });
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "nothing" } });
    fireEvent.submit(input.closest("form")!);
    const empty = await screen.findByText(/no matching entries/i);
    expect(empty).toHaveClass("search-empty");
  });
});

describe("search page states (settings-search-polish T-05)", () => {
  /** TC-10 */
  it("TC-10: the empty page explains itself and offers example questions that run when clicked", async () => {
    const input = (await openSearch()) as HTMLInputElement;
    expect(screen.getByTestId("search-intro")).toBeInTheDocument();
    const examples = screen.getAllByTestId("search-example");
    expect(examples).toHaveLength(3);
    const text = examples[0].textContent!.trim();
    fireEvent.click(examples[0]);
    expect(input.value).toBe(text);
    await waitFor(() => expect(fake.search).toHaveBeenCalledWith(text));
    // once a search has run, the intro makes way for results
    await waitFor(() => expect(screen.queryByTestId("search-intro")).toBeNull());
  });

  /** TC-11 */
  it("TC-11: the Ask button is disabled until there is a query, and submits it", async () => {
    setFakeSearch(OUT);
    const input = await openSearch();
    const ask = screen.getByTestId("search-submit");
    expect(ask).toBeDisabled();
    fireEvent.change(input, { target: { value: "  " } });
    expect(ask).toBeDisabled();
    fireEvent.change(input, { target: { value: "interview" } });
    expect(ask).toBeEnabled();
    fireEvent.click(ask);
    await waitFor(() => expect(fake.search).toHaveBeenCalledTimes(1));
    expect(fake.search).toHaveBeenCalledWith("interview");
    await screen.findAllByTestId("search-result");
  });

  /** TC-12 */
  it("TC-12: shows 'searching…' while in flight and a hint when nothing matches", async () => {
    let release!: (o: SearchOutput) => void;
    vi.mocked(fake.search).mockImplementationOnce(() => new Promise<SearchOutput>((res) => (release = res)));
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "nothing like this" } });
    fireEvent.click(screen.getByTestId("search-submit"));
    expect(await screen.findByTestId("search-loading")).toHaveTextContent(/searching…/);
    release({ results: [], hidden_count: 0 });
    await waitFor(() => expect(screen.queryByTestId("search-loading")).toBeNull());
    expect(screen.getByText(/No matching entries/i)).toBeInTheDocument();
    expect(screen.getByTestId("search-empty-hint")).toBeInTheDocument();
  });
});

describe("search results (settings-search-polish T-06)", () => {
  /** TC-13 */
  it("TC-13: results show a long date and the snippet; the answer card sits above them", async () => {
    setFakeSearch(
      { results: [{ entry_id: "e-z", snippet: "A quiet Monday.", created_at: "2026-11-09T12:00:00Z", distance: 0.2 }], hidden_count: 0 },
      async () => ({ answer: "A quiet one.", cited_dates: ["2026-11-09"] }),
    );
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "quiet" } });
    fireEvent.click(screen.getByTestId("search-submit"));
    const result = await screen.findByTestId("search-result");
    expect(result).toHaveTextContent("A quiet Monday.");
    const date = result.querySelector(".date")!;
    expect(date).toHaveTextContent(/2026/);
    expect(date).toHaveTextContent(/Nov/);
    expect(date).toHaveTextContent(/Mon/);
    const answer = await screen.findByTestId("search-answer");
    const list = screen.getByTestId("search-results");
    expect(answer.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(result);
    await waitFor(() => expect(fake.getEntry).toHaveBeenCalledWith("e-z"));
  });
});
