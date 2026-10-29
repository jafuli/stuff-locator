"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { EmbeddingClient, type EmbeddingStatus } from "./embedding-client";
import { type ItemTexts, type ItemVectors } from "./rank";
import { rankItems } from "./rank";

/** One searchable item: its id plus the two strings that get embedded. */
export interface SearchDocument extends ItemTexts {
  id: string;
}

export interface SemanticSearchResult {
  /**
   * Item ids best-first by meaning, or null while there's nothing to say yet
   * (model not ready, query too short, nothing embedded). null means "use the
   * substring filter" - the UI never waits on this.
   */
  semanticOrder: readonly string[] | null;
  status: EmbeddingStatus;
  /** Call on first real intent (search focus, first keystroke) to start the model. */
  onIntent: () => void;
}

/** Wait this long after the last keystroke before spending an embedding on it. */
export const QUERY_DEBOUNCE_MS = 150;
/**
 * Below this a query is a fragment ("pa", "pas"), and the embedding of a
 * fragment is noise. Those queries stay on the substring filter alone.
 */
export const MIN_SEMANTIC_QUERY_LENGTH = 3;

// One client for the page's lifetime: the model is expensive to start, and
// navigating Home -> Browse -> Home shouldn't throw it away. Created on first
// use, never at import time (constructing it does nothing until start()).
let sharedClient: EmbeddingClient | undefined;
function getSharedClient(): EmbeddingClient {
  sharedClient ??= new EmbeddingClient();
  return sharedClient;
}

const SERVER_STATUS: EmbeddingStatus = "idle";

function corpusKeyOf(documents: readonly SearchDocument[]): string {
  return documents.map((doc) => `${doc.id}\u0000${doc.name}\u0000${doc.enriched}`).join("\u0001");
}

/**
 * Semantic ranking for `documents` against `query`, computed in a worker.
 *
 * - The corpus (20-50 items at ~6 ms each) is fully re-embedded whenever its
 *   text changes; no diffing, nothing persisted.
 * - Queries are debounced, and each answer is tagged with the request that
 *   asked for it, so a slow old answer can never overwrite a newer one.
 * - Every failure path resolves to `semanticOrder: null`.
 */
export function useSemanticSearch(
  documents: readonly SearchDocument[],
  query: string,
  client: EmbeddingClient = getSharedClient(),
): SemanticSearchResult {
  const status = useSyncExternalStore(
    client.subscribe,
    () => client.getStatus(),
    () => SERVER_STATUS,
  );

  const corpusKey = corpusKeyOf(documents);
  // The page re-renders with a fresh `entries` array whenever it likes; only a
  // change in what the items actually say should cost a re-embed. Keep the
  // last documents whose content differed (adjusting state while rendering is
  // the sanctioned way to derive this).
  const [stable, setStable] = useState({ key: corpusKey, documents });
  if (stable.key !== corpusKey) {
    setStable({ key: corpusKey, documents });
  }
  const [corpus, setCorpus] = useState<{ key: string; vectors: ItemVectors[] } | undefined>();

  // Embed the corpus once the model is ready, and again whenever it changes.
  useEffect(() => {
    const { key, documents: docs } = stable;
    if (status !== "ready" || docs.length === 0) {
      return;
    }
    let cancelled = false;
    const texts = [...docs.map((doc) => doc.name), ...docs.map((doc) => doc.enriched)];
    client.embed(texts).then(
      (vectors) => {
        if (cancelled) {
          return;
        }
        setCorpus({
          key,
          vectors: docs.map((doc, index) => ({
            id: doc.id,
            name: vectors[index] ?? new Float32Array(),
            enriched: vectors[docs.length + index] ?? new Float32Array(),
          })),
        });
      },
      () => {
        // The client already moved itself to "failed" if the worker died;
        // a single failed batch just leaves us on the substring filter.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, status, stable]);

  const trimmed = query.trim();
  const [debounced, setDebounced] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(trimmed);
    }, QUERY_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [trimmed]);

  const [ranked, setRanked] = useState<{ corpusKey: string; order: string[] } | undefined>();
  const usableCorpus = corpus?.key === corpusKey ? corpus : undefined;

  useEffect(() => {
    if (status !== "ready" || !usableCorpus || debounced.length < MIN_SEMANTIC_QUERY_LENGTH) {
      return;
    }
    // `cancelled` is the stale-answer guard: the cleanup runs when the query,
    // corpus or status changes, so only the latest effect's answer is applied.
    let cancelled = false;
    client.embed([debounced]).then(
      (vectors) => {
        const queryVector = vectors.at(0);
        if (cancelled || queryVector === undefined) {
          return;
        }
        setRanked({ corpusKey: usableCorpus.key, order: rankItems(queryVector, usableCorpus.vectors) });
      },
      () => {
        // Substring filter keeps serving.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, status, usableCorpus, debounced]);

  const onIntent = useCallback(() => {
    client.start();
  }, [client]);

  // A query that has since become too short, or an order computed for an older
  // corpus, is not used. An order for the *previous* query is kept until the
  // new one lands (less flicker than dropping to substring-only on every key).
  const usable = status === "ready" && trimmed.length >= MIN_SEMANTIC_QUERY_LENGTH && ranked?.corpusKey === corpusKey;
  return { semanticOrder: usable ? ranked.order : null, status, onIntent };
}
