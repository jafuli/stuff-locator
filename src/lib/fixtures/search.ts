// MOCK DATA helper — see types.ts. This is the smaller, first increment of
// "Find" split out of the full client-side semantic/embeddings search
// described in CLAUDE.md: a plain case-insensitive substring filter over
// the existing fixtures, no model load, no network call. The embeddings
// version is a future swap of this function behind the same (items, query)
// -> items signature, not a rewrite of the caller.
import type { Item } from "./types";

/**
 * Filters items by a case-insensitive substring match against the item's
 * name or its free-text detail — a query that only matches in the detail
 * field must still surface the item, not just name matches. An empty or
 * whitespace-only query returns every item unfiltered.
 */
export function filterItems(items: readonly Item[], query: string): Item[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") {
    return [...items];
  }

  return items.filter((item) => {
    const nameMatch = item.name.toLowerCase().includes(trimmed);
    const detailMatch = item.detail?.toLowerCase().includes(trimmed) ?? false;
    return nameMatch || detailMatch;
  });
}
