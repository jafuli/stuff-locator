"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { EmbeddingClient, EmbeddingStatus } from "./embedding-client";
import { MIN_SEMANTIC_QUERY_LENGTH, QUERY_DEBOUNCE_MS } from "./query";
import { getSharedEmbeddingClient } from "./shared-client";
import { semanticRanking, type ItemTexts, type ItemVectors } from "./rank";

/** One searchable item: its id plus the two strings that get embedded. */
export interface SearchDocument extends ItemTexts {
  id: string;
}

/** What the model says about the current query. */
export interface SemanticAnswer {
  /** Item ids best-first by meaning. */
  order: readonly string[];
  /**
   * The item both representations (bare name and enriched string) rank
   * first, or null when they disagree. An agreement signal, not a score.
   */
  agreedTop: string | null;
}

export interface SemanticSearchResult {
  /**
   * The model's answer, or null while there's nothing to say yet (model not
   * ready, query too short, nothing embedded). null means "rank lexically
   * only"; the UI never waits on this.
   */
  semantic: SemanticAnswer | null;
  status: EmbeddingStatus;
  /**
   * Call on real search intent (focus, a keystroke). Starts the model if the
   * idle prefetch didn't, and is the only path to the one retry after a failure.
   */
  onIntent: () => void;
}

export { MIN_SEMANTIC_QUERY_LENGTH, QUERY_DEBOUNCE_MS };

const SERVER_STATUS: EmbeddingStatus = "idle";

function corpusKeyOf(documents: readonly SearchDocument[]): string {
  return documents.map((doc) => `${doc.id}\u0000${doc.name}\u0000${doc.enriched}`).join("\u0001");
}

/**
 * Semantic ranking for `documents` against `query`, computed in a worker.
 *
 * - The corpus is embedded whenever its text changes, but the client memoises
 *   vectors by text, so only strings it has never seen reach the worker (an
 *   edit costs the changed strings, a remount costs nothing). In memory only;
 *   nothing is persisted.
 * - Queries are debounced, and each answer is tagged with the request that
 *   asked for it, so a slow old answer can never overwrite a newer one.
 * - Every failure path resolves to `semanticOrder: null`.
 */
export function useSemanticSearch(
  documents: readonly SearchDocument[],
  query: string,
  client: EmbeddingClient = getSharedEmbeddingClient(),
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

  // Embed the corpus once the model is ready, and again whenever it changes
  // (the client's memo turns unchanged strings into instant hits).
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
        // a single failed batch just leaves us on the lexical ranking.
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

  const [ranked, setRanked] = useState<{ corpusKey: string; answer: SemanticAnswer } | undefined>();
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
        const ranking = semanticRanking(queryVector, usableCorpus.vectors);
        setRanked({
          corpusKey: usableCorpus.key,
          answer: {
            order: ranking.order,
            agreedTop: ranking.nameTop !== null && ranking.nameTop === ranking.enrichedTop ? ranking.nameTop : null,
          },
        });
      },
      () => {
        // The lexical ranking keeps serving.
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
  // corpus, is not used. An answer for the *previous* query is kept until the
  // new one lands (less flicker than dropping to lexical-only on every key).
  const usable = status === "ready" && trimmed.length >= MIN_SEMANTIC_QUERY_LENGTH && ranked?.corpusKey === corpusKey;
  return { semantic: usable ? ranked.answer : null, status, onIntent };
}
