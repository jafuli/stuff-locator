// The lexical half of Find: a plain case-insensitive substring filter, no
// model, no network. It is what serves results while the embedding model is
// loading or skipped, and permanently if the model fails (see
// src/lib/search/ and docs/adr/0012-client-side-embedding-search.md), and its
// hits are pinned to the top of the ranked list once the model is ready.
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
