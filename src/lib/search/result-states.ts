import type { EmbeddingStatus } from "./embedding-client";
import type { FusedResult } from "./rank";
import { MIN_SEMANTIC_QUERY_LENGTH } from "./query";

/**
 * Whether the first row has earned the CLOSEST marker. Find never shows or
 * thresholds a similarity score, so "is this really close?" is answered by
 * agreement instead:
 *
 * - the row matched by its letters (any lexical tier: the person can see why), or
 * - the model ranked it first twice over: by the bare name *and* by the
 *   enriched string (name · place · detail). Those are two different views of
 *   the item; when both pick the same one, it isn't a fluke of either.
 *
 * Otherwise, e.g. for a nonsense query where the model still has to rank
 * something first, there is no marker. The list is still ordered best-first,
 * but it doesn't claim a winner it doesn't have.
 */
export function showClosest(first: FusedResult | undefined, agreedTop: string | null): boolean {
  if (!first) {
    return false;
  }
  return first.lexicalTier !== null || (first.semantic && first.id === agreedTop);
}

/** The ids of rows that are there by meaning alone, which get the "≈ matched on meaning" label. */
export function meaningOnlyIds(results: readonly FusedResult[]): Set<string> {
  return new Set(results.filter((result) => result.lexicalTier === null && result.semantic).map((result) => result.id));
}

export type ResultsEmptyState = "none" | "still-looking" | "no-matches";

export interface EmptyStateInput {
  resultCount: number;
  status: EmbeddingStatus;
  /** The query as typed (it's trimmed here). */
  query: string;
  /** True once the model has answered for this query. */
  hasSemanticAnswer: boolean;
}

/**
 * Which empty state a search with zero rows shows.
 *
 * - "still-looking": nothing matched by letters, but the model may still find
 *   something by meaning. That covers a model that's loading, and a ready model
 *   whose answer for a long-enough query hasn't landed yet (the debounce plus a
 *   few ms). Saying "No matches" there would be untrue a moment later.
 * - "no-matches": no model will help (idle, skipped, failed), or the query is
 *   too short to send to it.
 * - "none": there are rows (or no search), so no empty state.
 */
export function emptyStateFor({ resultCount, status, query, hasSemanticAnswer }: EmptyStateInput): ResultsEmptyState {
  const trimmed = query.trim();
  if (trimmed === "" || resultCount > 0) {
    return "none";
  }
  const longEnough = trimmed.length >= MIN_SEMANTIC_QUERY_LENGTH;
  if (longEnough && (status === "loading" || (status === "ready" && !hasSemanticAnswer))) {
    return "still-looking";
  }
  return "no-matches";
}
