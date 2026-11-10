// Find's no-model list: the lexical ranking from src/lib/search/lexical.ts
// (exact > prefix > word start > substring > detail > typo-tolerant), as
// items. It is what serves while the embedding model is loading or skipped,
// and permanently if the model fails. See
// docs/adr/0012-client-side-embedding-search.md.
import { lexicalRank } from "@/lib/search/lexical";
import type { Item } from "./types";

/**
 * Items matching `query` by their name or free-text detail, best match first.
 * Case-insensitive and lightly typo-tolerant ("pasport" finds Passport). A
 * query that only matches in the detail field must still surface the item,
 * not just name matches. An empty or whitespace-only query returns every
 * item unfiltered, in its original order.
 */
export function filterItems(items: readonly Item[], query: string): Item[] {
  if (query.trim() === "") {
    return [...items];
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  return lexicalRank(items, query).flatMap((match) => byId.get(match.id) ?? []);
}
