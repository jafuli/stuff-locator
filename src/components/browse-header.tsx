"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StuffSearchInput } from "@/components/stuff-search-input";
import { StuffViewChips } from "@/components/stuff-view-chips";

export interface BrowseHeaderProps {
  /** The household's total item count, for the "All (n)" chip. */
  total: number;
}

/**
 * The top of `/browse`: the same header Home has — title, search, the
 * All / By place chips — so the two read as one toggle. Typing here leaves
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
      <h1 className="text-[16px] font-semibold text-ink">Our stuff</h1>
      <StuffSearchInput
        value={query}
        onChange={(value) => {
          setQuery(value);
          router.push(`/?q=${encodeURIComponent(value)}`);
        }}
      />
      <StuffViewChips total={total} active="place" />
    </>
  );
}
