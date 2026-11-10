import type { Item } from "@/lib/fixtures/types";

// The pure half of Find: no worker, no DOM, no model. Everything that decides
// *what order* results come in lives here so it can be tested with plain
// vectors. See docs/adr/0012 for why the rules are what they are.

/** The two strings embedded per item. Matching takes the better of the two. */
export interface ItemTexts {
  /** The bare item name, e.g. "Passport". */
  name: string;
  /** name · location path · detail — see enrichedText. */
  enriched: string;
}

export interface ItemVectors {
  id: string;
  name: Float32Array;
  enriched: Float32Array;
}

/**
 * Cosine similarity. The model hands back unit vectors, so this is normally
 * just a dot product, but the norms are divided out anyway: a caller passing
 * an un-normalised vector should get a wrong-scale answer, not a wrong order.
 * A zero vector scores 0 rather than NaN (NaN would poison every comparison).
 */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Score = max(similarity to the bare name, similarity to the enriched string).
 *
 * Text appended to a bare name is high-variance: the location path rescues
 * some queries ("tools for flat pack furniture" -> Allen keys in a Toolbox)
 * and breaks others ("something to sit on at the park" -> picnic blanket in a
 * cupboard). Taking the better of two representations lets each query match
 * whichever suits it without paying either one's dilution penalty.
 */
export function scoreItem(query: ArrayLike<number>, vectors: Pick<ItemVectors, "name" | "enriched">): number {
  return Math.max(cosine(query, vectors.name), cosine(query, vectors.enriched));
}

/**
 * Item ids best-first. Total and deterministic: score descending, ties broken
 * by position in the input (the page passes items most-recently-added first,
 * so on a tie the newer item wins and the order never flickers between
 * renders). Deliberately no score threshold: a correct answer can score lower
 * than a wrong one (0.199 vs 0.467 in the spike), so any cut-off is by rank,
 * via `limit`, never by score.
 */
export function rankItems(query: ArrayLike<number>, corpus: readonly ItemVectors[], limit?: number): string[] {
  const scored = corpus.map((entry, index) => ({ id: entry.id, index, score: scoreItem(query, entry) }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const ids = scored.map((entry) => entry.id);
  return limit === undefined ? ids : ids.slice(0, Math.max(0, limit));
}

/** The string embedded alongside the bare name: name · location path · detail. */
export function enrichedText(item: Pick<Item, "name" | "detail">, pathNames: readonly string[]): string {
  const parts = [item.name, pathNames.join(" "), item.detail ?? ""].map((part) => part.trim());
  return parts.filter((part) => part !== "").join(" · ");
}

/**
 * Lexical hits first, then everything else by semantic rank.
 *
 * Someone who typed "pass" and has a "Passport" should see it first even if
 * the embedding of a four-letter fragment is noise. Among the pinned hits the
 * semantic order is kept where we have one (it is the better tie-break than
 * insertion order); lexical hits the semantic order doesn't know about
 * (corpus changed since it was computed) keep their own order after those.
 * Every id in `allIds` appears exactly once; ids in either list that aren't
 * in `allIds` are dropped, so a stale semantic result can't resurrect a
 * deleted item.
 */
export function mergeLexicalFirst(
  allIds: readonly string[],
  lexicalIds: readonly string[],
  semanticOrder: readonly string[],
): string[] {
  const known = new Set(allIds);
  const lexical = new Set(lexicalIds.filter((id) => known.has(id)));
  const semanticRank = new Map(semanticOrder.map((id, index) => [id, index]));

  const pinned = [...lexical].sort(
    (a, b) =>
      (semanticRank.get(a) ?? Infinity) - (semanticRank.get(b) ?? Infinity) ||
      indexIn(lexicalIds, a) - indexIn(lexicalIds, b),
  );
  const rest = semanticOrder.filter((id) => known.has(id) && !lexical.has(id));
  const seen = new Set([...pinned, ...rest]);
  const unranked = allIds.filter((id) => !seen.has(id));

  return [...pinned, ...rest, ...unranked];
}

function indexIn(ids: readonly string[], id: string): number {
  return ids.indexOf(id);
}
