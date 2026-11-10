import type { Item } from "@/lib/fixtures/types";
import type { LexicalMatch, LexicalTier } from "./lexical";

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

export interface SemanticRanking {
  /** Item ids best-first by max(name, enriched) similarity: rankItems. */
  order: string[];
  /** The item ranked first by the bare-name vectors alone, or null for an empty corpus. */
  nameTop: string | null;
  /** The item ranked first by the enriched vectors alone, or null for an empty corpus. */
  enrichedTop: string | null;
}

function argmax(query: ArrayLike<number>, corpus: readonly ItemVectors[], side: "name" | "enriched"): string | null {
  let best: { id: string; score: number } | null = null;
  for (const entry of corpus) {
    const score = cosine(query, entry[side]);
    // Strictly greater: on a tie the earlier item keeps the lead, as in rankItems.
    if (best === null || score > best.score) {
      best = { id: entry.id, score };
    }
  }
  return best?.id ?? null;
}

/**
 * The semantic ranking, plus each representation's own favourite. When both
 * representations put the same item first, that is two independent views of
 * the item agreeing, which is the signal the CLOSEST marker uses instead of a
 * score threshold (see result-states.ts).
 */
export function semanticRanking(query: ArrayLike<number>, corpus: readonly ItemVectors[]): SemanticRanking {
  return {
    order: rankItems(query, corpus),
    nameTop: argmax(query, corpus, "name"),
    enrichedTop: argmax(query, corpus, "enriched"),
  };
}

/**
 * Reciprocal rank fusion's k. 60 is the value from the original RRF paper
 * (Cormack et al., 2009) and the common default. It flattens the gap between
 * neighbouring ranks, so neither list's top spot alone dominates. With a
 * lexical list that is usually short, it also means a lexical hit
 * (two contributions) nearly always outranks an item only the model found
 * (one), without that being a hard rule.
 */
export const RRF_K = 60;

/** One row of the fused list and why it is there. */
export interface FusedResult {
  id: string;
  /** How the letters matched, or null if they didn't (the row is there by meaning only). */
  lexicalTier: LexicalTier | null;
  /** True if the semantic ranking placed this item (it contributed to the row's rank). */
  semantic: boolean;
}

export interface FuseOptions {
  k?: number;
  /** Keep only this many rows, a rank cut-off, never a score one. Omitted keeps every row. */
  limit?: number;
}

/**
 * Reciprocal rank fusion of the lexical and the semantic rankings:
 * score(id) = sum over the lists that contain it of 1 / (k + rank), with rank
 * starting at 1. Rank-based only: no similarity score and no threshold is
 * involved anywhere.
 *
 * - Lexical rank is by tier, and ties share a rank (competition ranking), so
 *   among, say, eight "Box …" prefix hits it's the model that orders them,
 *   not the insertion order.
 * - Ids not in `allIds` are ignored (a stale semantic answer can't resurrect
 *   a deleted item), and duplicates count once.
 * - Ties on score go to the earlier id in `allIds`, so the order is total and
 *   deterministic.
 * - With `semanticOrder` null (no model), this is the lexical ranking.
 */
export function fuseRankings(
  allIds: readonly string[],
  lexical: readonly LexicalMatch[],
  semanticOrder: readonly string[] | null,
  { k = RRF_K, limit }: FuseOptions = {},
): FusedResult[] {
  const position = new Map(allIds.map((id, index) => [id, index]));
  const rows = new Map<string, FusedResult & { score: number }>();
  const rowFor = (id: string) => {
    let row = rows.get(id);
    if (!row) {
      row = { id, lexicalTier: null, semantic: false, score: 0 };
      rows.set(id, row);
    }
    return row;
  };

  let rank = 0;
  let previousTier: LexicalTier | null = null;
  let seen = 0;
  for (const match of lexical) {
    if (!position.has(match.id)) {
      continue;
    }
    const row = rowFor(match.id);
    if (row.lexicalTier !== null) {
      continue;
    }
    seen += 1;
    if (match.tier !== previousTier) {
      rank = seen;
      previousTier = match.tier;
    }
    row.lexicalTier = match.tier;
    row.score += 1 / (k + rank);
  }

  let semanticRank = 0;
  for (const id of semanticOrder ?? []) {
    if (!position.has(id)) {
      continue;
    }
    const row = rowFor(id);
    if (row.semantic) {
      continue;
    }
    semanticRank += 1;
    row.semantic = true;
    row.score += 1 / (k + semanticRank);
  }

  const fused = [...rows.values()].sort(
    (a, b) => b.score - a.score || (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
  );
  const kept = limit === undefined ? fused : fused.slice(0, Math.max(0, limit));
  return kept.map(({ id, lexicalTier, semantic }) => ({ id, lexicalTier, semantic }));
}
