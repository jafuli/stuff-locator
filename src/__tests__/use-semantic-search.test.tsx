import { describe, expect, test } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { EmbeddingClient } from "@/lib/search/embedding-client";
import { MIN_SEMANTIC_QUERY_LENGTH, useSemanticSearch, type SearchDocument } from "@/lib/search/use-semantic-search";
import { FakeEmbeddingWorker } from "./fake-embedding-worker";

// Two directions in a 2-D "meaning space": [1,0] is documents, [0,1] is outdoors.
const VECTORS: Record<string, number[]> = {
  Passport: [1, 0],
  "Passport · Bedroom": [1, 0],
  "Camping tent": [0, 1],
  "Camping tent · Garage": [0, 1],
  "Spare router": [0.7, 0.7],
  "Spare router · Office": [0.7, 0.7],
  "travel documents": [1, 0],
  "somewhere to sleep outdoors": [0, 1],
};

const passport: SearchDocument = { id: "passport", name: "Passport", enriched: "Passport · Bedroom" };
const tent: SearchDocument = { id: "tent", name: "Camping tent", enriched: "Camping tent · Garage" };
const router: SearchDocument = { id: "router", name: "Spare router", enriched: "Spare router · Office" };

function setup() {
  const worker = new FakeEmbeddingWorker((text) => VECTORS[text] ?? [0, 0]);
  const client = new EmbeddingClient({ createWorker: () => worker, connectionSource: {} });
  return { worker, client };
}

/** Starts the model and answers the corpus batch, leaving the worker idle for query requests. */
async function readyWithCorpus(worker: FakeEmbeddingWorker, result: { current: { onIntent: () => void } }) {
  act(() => {
    result.current.onIntent();
    worker.ready();
  });
  await waitFor(() => {
    expect(worker.embedRequests.length).toBeGreaterThanOrEqual(1);
  });
  act(() => {
    worker.answer(0);
  });
}

describe("falling back", () => {
  test("is null before anything has started, so the substring filter serves", () => {
    const { client } = setup();
    const { result } = renderHook(() => useSemanticSearch([passport, tent], "travel documents", client));
    expect(result.current.semanticOrder).toBeNull();
    expect(result.current.status).toBe("idle");
  });

  test("is still null while the model is loading", () => {
    const { client } = setup();
    const { result } = renderHook(() => useSemanticSearch([passport, tent], "travel documents", client));
    act(() => {
      result.current.onIntent();
    });
    expect(result.current.status).toBe("loading");
    expect(result.current.semanticOrder).toBeNull();
  });

  test("is null for good once the model fails", () => {
    const { worker, client } = setup();
    const { result } = renderHook(() => useSemanticSearch([passport, tent], "travel documents", client));
    act(() => {
      result.current.onIntent();
      worker.emit({ type: "error", message: "blocked" });
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.semanticOrder).toBeNull();
  });

  test("starting the model is the caller's call: rendering alone never starts it", () => {
    const { worker, client } = setup();
    renderHook(() => useSemanticSearch([passport], "", client));
    expect(client.getStatus()).toBe("idle");
    expect(worker.received).toEqual([]);
  });
});

describe("ranking once ready", () => {
  test("orders items by meaning for a query that shares no words with them", async () => {
    const { worker, client } = setup();
    const { result } = renderHook(() => useSemanticSearch([tent, router, passport], "travel documents", client));
    await readyWithCorpus(worker, result);

    await waitFor(() => {
      expect(worker.embedRequests.length).toBe(2);
    });
    act(() => {
      worker.answer(1);
    });

    await waitFor(() => {
      expect(result.current.semanticOrder).toEqual(["passport", "router", "tent"]);
    });
  });

  test("embeds the corpus as names then enriched strings in one batch", async () => {
    const { worker, client } = setup();
    const { result } = renderHook(() => useSemanticSearch([passport, tent], "", client));
    await readyWithCorpus(worker, result);
    expect(worker.embedRequests[0]?.texts).toEqual([
      "Passport",
      "Camping tent",
      "Passport · Bedroom",
      "Camping tent · Garage",
    ]);
  });

  test(`a query shorter than ${MIN_SEMANTIC_QUERY_LENGTH.toString()} characters stays on the substring filter`, async () => {
    const { worker, client } = setup();
    const { result } = renderHook(() => useSemanticSearch([passport, tent], "pa", client));
    await readyWithCorpus(worker, result);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(worker.embedRequests).toHaveLength(1);
    expect(result.current.semanticOrder).toBeNull();
  });

  test("clearing the query drops the semantic order", async () => {
    const { worker, client } = setup();
    const { result, rerender } = renderHook(({ query }) => useSemanticSearch([passport, tent], query, client), {
      initialProps: { query: "travel documents" },
    });
    await readyWithCorpus(worker, result);
    await waitFor(() => {
      expect(worker.embedRequests.length).toBe(2);
    });
    act(() => {
      worker.answer(1);
    });
    await waitFor(() => {
      expect(result.current.semanticOrder).not.toBeNull();
    });

    rerender({ query: "" });
    expect(result.current.semanticOrder).toBeNull();
  });
});

describe("stale answers", () => {
  test("a slow answer for an old query never overwrites the newer one", async () => {
    const { worker, client } = setup();
    const { result, rerender } = renderHook(({ query }) => useSemanticSearch([passport, tent], query, client), {
      initialProps: { query: "travel documents" },
    });
    await readyWithCorpus(worker, result);

    // First query is sent and left unanswered...
    await waitFor(() => {
      expect(worker.embedRequests.length).toBe(2);
    });
    // ...the person keeps typing, so a second query goes out.
    rerender({ query: "somewhere to sleep outdoors" });
    await waitFor(() => {
      expect(worker.embedRequests.length).toBe(3);
    });

    // The newer answer arrives first, then the old one limps in late.
    act(() => {
      worker.answer(2);
    });
    await waitFor(() => {
      expect(result.current.semanticOrder).toEqual(["tent", "passport"]);
    });
    act(() => {
      worker.answer(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.semanticOrder).toEqual(["tent", "passport"]);
  });

  test("keystrokes inside the debounce window cost one embedding, not one each", async () => {
    const { worker, client } = setup();
    const { result, rerender } = renderHook(({ query }) => useSemanticSearch([passport, tent], query, client), {
      initialProps: { query: "" },
    });
    await readyWithCorpus(worker, result);
    rerender({ query: "tra" });
    rerender({ query: "trav" });
    rerender({ query: "trave" });
    rerender({ query: "travel documents" });

    await waitFor(() => {
      expect(worker.embedRequests.length).toBe(2);
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(worker.embedRequests).toHaveLength(2);
    expect(worker.embedRequests[1]?.texts).toEqual(["travel documents"]);
  });
});

describe("corpus changes", () => {
  test("re-embeds the whole corpus when an item is added, and ranks the new one", async () => {
    const { worker, client } = setup();
    const { result, rerender } = renderHook(({ docs }) => useSemanticSearch(docs, "travel documents", client), {
      initialProps: { docs: [passport, tent] },
    });
    await readyWithCorpus(worker, result);
    await waitFor(() => {
      expect(worker.embedRequests.length).toBe(2);
    });
    act(() => {
      worker.answer(1);
    });
    await waitFor(() => {
      expect(result.current.semanticOrder).toEqual(["passport", "tent"]);
    });

    rerender({ docs: [router, passport, tent] });
    // The old ranking is for a different corpus, so it is not used meanwhile.
    expect(result.current.semanticOrder).toBeNull();

    await waitFor(() => {
      expect(worker.embedRequests.length).toBe(3);
    });
    expect(worker.embedRequests[2]?.texts).toHaveLength(6);
    act(() => {
      worker.answer(2);
    });
    await waitFor(() => {
      expect(worker.embedRequests.length).toBe(4);
    });
    act(() => {
      worker.answer(3);
    });
    await waitFor(() => {
      expect(result.current.semanticOrder).toEqual(["passport", "router", "tent"]);
    });
  });

  test("a renamed item is re-embedded even though the list has the same ids", async () => {
    const { worker, client } = setup();
    const { result, rerender } = renderHook(({ docs }) => useSemanticSearch(docs, "", client), {
      initialProps: { docs: [passport] },
    });
    await readyWithCorpus(worker, result);

    rerender({ docs: [{ ...passport, name: "Spare router", enriched: "Spare router · Office" }] });
    await waitFor(() => {
      expect(worker.embedRequests.length).toBe(2);
    });
    expect(worker.embedRequests[1]?.texts).toEqual(["Spare router", "Spare router · Office"]);
  });

  test("an unchanged corpus passed as a new array is not re-embedded", async () => {
    const { worker, client } = setup();
    const { result, rerender } = renderHook(({ docs }) => useSemanticSearch(docs, "", client), {
      initialProps: { docs: [passport, tent] },
    });
    await readyWithCorpus(worker, result);
    rerender({ docs: [{ ...passport }, { ...tent }] });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(worker.embedRequests).toHaveLength(1);
  });
});
