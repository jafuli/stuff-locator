"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StashLink } from "@/components/stash-link";
import { StuffSearchInput } from "@/components/stuff-search-input";
import { StuffViewChips } from "@/components/stuff-view-chips";
import { STUFF_HEADING } from "@/lib/stuff-heading";
import { stuffSearchHref } from "@/lib/routes";

export interface BrowseHeaderProps {
  /** The household's total item count, for the "All (n)" chip. */
  total: number;
}

/**
 * The top of `/browse`: the same header Home has — title, search with the
 * Stash button beside it, the All / By place chips — so the two read as one
 * toggle. Typing here leaves
 * Browse for Home with the query applied (a search over places makes no
 * sense; search means items), so the query rides along as `?q=`.
 */
export function BrowseHeader({ total }: BrowseHeaderProps) {
  const router = useRouter();
  // Held locally so characters typed before the navigation lands aren't lost
  // to a field that snaps back to empty.
  const [query, setQuery] = useState("");

  return (
    <>
      <h1 className="text-display text-ink">{STUFF_HEADING}</h1>
      {/* The same row as the Stuff screen's: search, with Stash beside it. */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <StuffSearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              router.push(stuffSearchHref(value));
            }}
          />
        </div>
        <StashLink />
      </div>
      <StuffViewChips total={total} active="place" />
    </>
  );
}
