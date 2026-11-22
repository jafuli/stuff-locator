"use client";

import type { ReactNode } from "react";
import type { StuffListEntry } from "@/components/stuff-list";
import { StuffSearchResults } from "@/components/stuff-search-results";
import { useStuffViews } from "@/components/stuff-views-shell";

export interface BrowseContentProps {
  /** Every item, for searching from Browse. */
  entries: readonly StuffListEntry[];
  /** The places list (and "+ Add a place here"), shown while nothing is typed. */
  places: ReactNode;
}

/**
 * What sits under the shared header on Browse: the places, or, once
 * something is typed in the header's search field, the same results list the
 * Stuff screen shows. The page stays on /browse either way; clearing the
 * field brings the places back. A Browse-specific results display is a
 * possible later step, not this one.
 */
export function BrowseContent({ entries, places }: BrowseContentProps) {
  const { query } = useStuffViews();
  return query.trim() === "" ? places : <StuffSearchResults entries={entries} />;
}
