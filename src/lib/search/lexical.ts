// The lexical half of Find: no model, no network. Ranks items by how their
// letters match the query, best match first, with a little typo tolerance.
// It is both a voice in the fused ranking (rank.ts, fuseRankings) and the
// whole of Find while the embedding model is loading, skipped or failed, so
// "pasport" still finds Passport without the model.

/**
 * Why an item matched, best first. Tiers are compared by position in this list.
 *
 * - exact:          the whole name is the query ("passport" -> Passport)
 * - prefix:         the name starts with the query ("pass" -> Passport)
 * - word-start:     a later word in the name starts with it ("tent" -> Camping tent)
 * - name-substring: anywhere in the name ("port" -> Passport)
 * - detail:         anywhere in the free-text detail ("birth" -> "with the birth certificates")
 * - fuzzy-name:     every query word is within a typo or two of a name word ("pasport")
 * - fuzzy-detail:   the same, allowing the detail's words too
 */
export const LEXICAL_TIERS = [
  "exact",
  "prefix",
  "word-start",
  "name-substring",
  "detail",
  "fuzzy-name",
  "fuzzy-detail",
] as const;
export type LexicalTier = (typeof LEXICAL_TIERS)[number];

export interface LexicalDocument {
  id: string;
  name: string;
  detail?: string;
}

export interface LexicalMatch {
  id: string;
  tier: LexicalTier;
}

/** Lower-case, with runs of whitespace collapsed to one space and the ends trimmed. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Words for typo matching: runs of letters and digits, in any script. */
function wordsOf(normalised: string): string[] {
  return normalised.match(/[\p{L}\p{N}]+/gu) ?? [];
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** True if `query` occurs in `text` at the start of a word. */
function occursAtWordStart(text: string, query: string): boolean {
  let index = text.indexOf(query);
  while (index !== -1) {
    const before = index === 0 ? "" : text.charAt(index - 1);
    if (before === "" || !WORD_CHAR.test(before)) {
      return true;
    }
    index = text.indexOf(query, index + 1);
  }
  return false;
}

/**
 * How many typos a query word of this length may carry: none below 4
 * characters (short words have too many near neighbours: "box" vs "fox"),
 * one from 4, two from 8.
 */
export function typoBudget(length: number): number {
  if (length >= 8) {
    return 2;
  }
  return length >= 4 ? 1 : 0;
}

/**
 * Optimal-string-alignment Damerau-Levenshtein distance: insertions,
 * deletions, substitutions and adjacent transpositions each cost 1. Stops
 * early and returns `max + 1` as soon as the distance must exceed `max`.
 */
export function damerauLevenshtein(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) {
    return max + 1;
  }
  let previousPrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (previousPrevious[j - 2] ?? 0) + 1);
      }
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) {
      return max + 1;
    }
    previousPrevious = previous;
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/**
 * A query word matches a text word if the text word starts with it, or if it
 * is within its typo budget of the whole word or of the word's first
 * query-length letters (so a typo while still typing, "pasp", reaches
 * "passport").
 */
function wordMatches(queryWord: string, word: string): boolean {
  if (word.startsWith(queryWord)) {
    return true;
  }
  const budget = typoBudget(queryWord.length);
  if (budget === 0) {
    return false;
  }
  return (
    damerauLevenshtein(queryWord, word, budget) <= budget ||
    (word.length > queryWord.length && damerauLevenshtein(queryWord, word.slice(0, queryWord.length), budget) <= budget)
  );
}

function allWordsMatch(queryWords: readonly string[], words: readonly string[]): boolean {
  return queryWords.length > 0 && queryWords.every((q) => words.some((word) => wordMatches(q, word)));
}

/** The best tier `doc` reaches for an already-normalised, non-empty query, or null. */
export function lexicalTier(doc: Omit<LexicalDocument, "id">, query: string): LexicalTier | null {
  const name = normalise(doc.name);
  const detail = normalise(doc.detail ?? "");

  if (name === query) {
    return "exact";
  }
  if (name.startsWith(query)) {
    return "prefix";
  }
  if (occursAtWordStart(name, query)) {
    return "word-start";
  }
  if (name.includes(query)) {
    return "name-substring";
  }
  if (detail.includes(query)) {
    return "detail";
  }

  const queryWords = wordsOf(query);
  const nameWords = wordsOf(name);
  if (allWordsMatch(queryWords, nameWords)) {
    return "fuzzy-name";
  }
  if (allWordsMatch(queryWords, [...nameWords, ...wordsOf(detail)])) {
    return "fuzzy-detail";
  }
  return null;
}

/**
 * Matching documents, best tier first; within a tier, input order (the page
 * passes items newest first, so a tie goes to the newer item and the order
 * never flickers between renders). Documents that don't match are left out.
 * An empty or whitespace-only query matches nothing: "no query" is the
 * caller's case to handle (it shows everything, unranked).
 */
export function lexicalRank(docs: readonly LexicalDocument[], query: string): LexicalMatch[] {
  const normalised = normalise(query);
  if (normalised === "") {
    return [];
  }
  const matches: (LexicalMatch & { index: number })[] = [];
  docs.forEach((doc, index) => {
    const tier = lexicalTier(doc, normalised);
    if (tier !== null) {
      matches.push({ id: doc.id, tier, index });
    }
  });
  matches.sort((a, b) => LEXICAL_TIERS.indexOf(a.tier) - LEXICAL_TIERS.indexOf(b.tier) || a.index - b.index);
  return matches.map(({ id, tier }) => ({ id, tier }));
}
