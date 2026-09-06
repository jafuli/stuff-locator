"use client";

import { useState } from "react";
import { StuffList, type StuffListEntry } from "@/components/stuff-list";
import { EmptyState } from "@/components/ui/empty-state";
import { filterItems } from "@/lib/fixtures/search";

export interface SearchableStuffListProps {
  /** Every item's already-resolved entry (item + breadcrumb segments) — the page's full, unfiltered list. */
  entries: readonly StuffListEntry[];
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
export function SearchableStuffList({ entries }: SearchableStuffListProps) {
  const [query, setQuery] = useState("");

  const matchedIds = new Set(filterItems(entries.map((entry) => entry.item), query).map((item) => item.id));
  const visibleEntries = entries.filter((entry) => matchedIds.has(entry.item.id));
  const isSearching = query.trim() !== "";

  return (
    <>
      {/*
        type="text" + explicit role="searchbox" rather than type="search":
        Chromium injects a client-only inline style onto native
        <input type="search"> elements (its own clear-button bookkeeping),
        which caused a real hydration mismatch against the server-rendered
        HTML. This sidesteps that while keeping the same accessible role
        and visual result.
      */}
      <div role="search">
        <label htmlFor="stuff-search" className="sr-only">
          Search your stuff
        </label>
        <input
          id="stuff-search"
          type="text"
          role="searchbox"
          placeholder="Search…"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="w-full rounded-[9px] border-[1.5px] border-line px-[10px] py-[8px] text-[12.5px] text-ink outline-none placeholder:text-mid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
      </div>

      {isSearching && visibleEntries.length === 0 ? (
        <EmptyState title="No matches" description="Nothing matches that search. Try another word." />
      ) : (
        <StuffList entries={visibleEntries} linkLocationSegments />
      )}
    </>
  );
}
