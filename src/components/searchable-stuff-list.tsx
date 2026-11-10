"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { StuffList, type StuffListEntry } from "@/components/stuff-list";
import { StuffSearchInput } from "@/components/stuff-search-input";
import { StuffViewChips } from "@/components/stuff-view-chips";
import { EmptyState } from "@/components/ui/empty-state";
import { lexicalRank } from "@/lib/search/lexical";
import { enrichedText, fuseRankings } from "@/lib/search/rank";
import { useIdlePrefetch } from "@/lib/search/use-idle-prefetch";
import { useSemanticSearch, type SearchDocument } from "@/lib/search/use-semantic-search";

/**
 * How many results the fused list shows once the model is ready. A rank
 * cut-off, never a score one: the household is ~20-50 items, so the best
 * handful is what the person can recognise at a glance. It applies to the
 * fused list as a whole; lexical hits get no exemption. Without the model the
 * lexical list is shown whole, since every row in it has a visible reason.
 */
export const SHORTLIST_SIZE = 5;

export interface SearchableStuffListProps {
  /** Every item's already-resolved entry (item + breadcrumb segments) — the page's full, unfiltered list. */
  entries: readonly StuffListEntry[];
  /** Forwarded to StuffList's zero-entries empty state — see its own doc comment. Never shown for the "no search matches" case, which is a different, unrelated empty state below. */
  emptyStateAction?: ReactNode;
  /**
   * A query to start with, e.g. one carried over from the search box on
   * Browse. When set, the field is focused with the caret at the end so the
   * person can keep typing where they left off.
   */
  initialQuery?: string;
  /** Sits beside the search field — the Stuff screen puts its Stash button here. */
  searchAction?: ReactNode;
}

/**
 * Owns the home page's search input state and ranks `entries` against it
 * client-side — no network call for the query, no URL param.
 *
 * Find degrades, it never blocks. The embedding model is warmed in the
 * background once this screen is idle, if it is already cached or the
 * connection reports 4g (useIdlePrefetch). Otherwise it starts on first focus
 * or keystroke, and never on Save-Data / 2g. Until it is ready, or if it
 * fails, the list is the plain case-insensitive substring filter. Once it is
 * ready the list is a ranked shortlist: substring hits first, then the
 * closest by meaning. See docs/adr/0012-client-side-embedding-search.md.
 *
 * A client component so typing can be interactive, but the item data itself
 * (entries) is still resolved server-side in page.tsx and passed down —
 * this component only ranks an already-computed list, it doesn't fetch.
 */
export function SearchableStuffList({
  entries,
  emptyStateAction,
  initialQuery = "",
  searchAction,
}: SearchableStuffListProps) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  const documents = useMemo<SearchDocument[]>(
    () =>
      entries.map(({ item, segments }) => ({
        id: item.id,
        name: item.name,
        enriched: enrichedText(
          item,
          segments.map((segment) => segment.name),
        ),
      })),
    [entries],
  );
  const { semantic, status, onIntent } = useSemanticSearch(documents, query);
  // Warm the model only when there is something to search: an empty household
  // (onboarding, or one that finished onboarding and deleted everything) has
  // nothing to rank, so a background download there would be pure cost.
  const hasItems = entries.length > 0;
  useIdlePrefetch(undefined, { enabled: hasItems });

  // Arriving with a query means the person was typing: put them back in the
  // field, caret at the end, instead of leaving them on a page they must
  // click into. Only on arrival, never on later edits.
  useEffect(() => {
    if (initialQuery !== "") {
      const input = inputRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
  }, [initialQuery]);

  const isSearching = query.trim() !== "";
  const items = entries.map((entry) => entry.item);
  const allIds = items.map((item) => item.id);

  // Fused: reciprocal rank fusion of the lexical and semantic rankings, and
  // just the lexical ranking (typo-tolerant) until the model answers.
  const results = isSearching
    ? fuseRankings(allIds, lexicalRank(items, query), semantic?.order ?? null, {
        limit: semantic === null ? undefined : SHORTLIST_SIZE,
      })
    : [];
  const visibleIds: readonly string[] = isSearching ? results.map((result) => result.id) : allIds;

  const byId = new Map(entries.map((entry) => [entry.item.id, entry]));
  const visibleEntries = visibleIds.flatMap((id) => byId.get(id) ?? []);
  const resultCount = visibleEntries.length;
  const isRanked = isSearching && semantic !== null;

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <StuffSearchInput
            ref={inputRef}
            value={query}
            onChange={(value) => {
              setQuery(value);
              onIntent();
            }}
            onFocus={onIntent}
          />
        </div>
        {searchAction}
      </div>

      {/* The household's total, not the filtered count: the chip names the
          whole view, the live region below reports the search. */}
      <StuffViewChips total={entries.length} active="all" />

      {/*
        Narrowing the list (or swapping to the "No matches" empty state) is
        otherwise a silent DOM change — a screen reader user typing a query
        gets no signal that anything happened. This sr-only status announces
        the result count instead of the whole list, so it doesn't read out
        every item's text on each keystroke; role="status" + aria-live are
        both set (some assistive tech only picks up one or the other).
      */}
      <p aria-live="polite" role="status" className="sr-only">
        {isSearching ? `${resultCount.toString()} ${resultCount === 1 ? "result" : "results"} found` : ""}
      </p>
      {/* The model takes a moment to arrive on first use; say so once, quietly
          and only to assistive tech, so the list getting smarter isn't a
          silent surprise. No role: it must not read as a second status. A
          skipped or failed model is deliberately not announced — falling back
          is the design, not an error. */}
      <p aria-live="polite" className="sr-only">
        {isSearching && status === "loading" ? "Loading smarter search. Showing basic matches for now." : ""}
      </p>

      {isSearching && visibleEntries.length === 0 ? (
        <EmptyState title="No matches" description="Nothing matches that search. Try another word." />
      ) : (
        <>
          {/* Results are a ranked list, never a single answer: the section
              label says so and the first row carries the CLOSEST marker. No
              score is ever shown. */}
          {isSearching ? <h2 className="text-section-label text-muted">Best matches</h2> : null}
          <StuffList
            entries={visibleEntries}
            linkLocationSegments
            emptyStateAction={emptyStateAction}
            markClosest={isSearching}
          />
          {/* With the model ready the list never comes up empty, so this is
              what "that's all there is" looks like: the wireframe's closing
              line, not a "No matches" screen. */}
          {isRanked ? (
            <p className="text-center text-meta text-muted">
              Nothing else close. Try another word, or{" "}
              <Link
                href="/browse"
                className="rounded-tape underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                browse by place
              </Link>
              .
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
