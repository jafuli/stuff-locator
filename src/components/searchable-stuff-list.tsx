"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { StuffList, type StuffListEntry } from "@/components/stuff-list";
import { StuffSearchInput } from "@/components/stuff-search-input";
import { StuffViewChips } from "@/components/stuff-view-chips";
import { EmptyState } from "@/components/ui/empty-state";
import { filterItems } from "@/lib/fixtures/search";

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
 * Owns the home page's search input state and narrows `entries` against it
 * client-side — no network call, no URL param, no embeddings model. This is
 * the smaller first increment of "Find" (see src/lib/fixtures/search.ts);
 * the full semantic/embeddings search described in CLAUDE.md is a separate,
 * larger future task.
 *
 * A client component so typing can be interactive, but the item data itself
 * (entries) is still resolved server-side in page.tsx and passed down —
 * this component only filters an already-computed list, it doesn't fetch.
 */
export function SearchableStuffList({
  entries,
  emptyStateAction,
  initialQuery = "",
  searchAction,
}: SearchableStuffListProps) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const matchedIds = new Set(
    filterItems(
      entries.map((entry) => entry.item),
      query,
    ).map((item) => item.id),
  );
  const visibleEntries = entries.filter((entry) => matchedIds.has(entry.item.id));
  const isSearching = query.trim() !== "";
  const resultCount = visibleEntries.length;

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <StuffSearchInput ref={inputRef} value={query} onChange={setQuery} />
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
        </>
      )}
    </>
  );
}
