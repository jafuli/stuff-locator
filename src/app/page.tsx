import type { StuffListEntry } from "@/components/stuff-list";
import { SearchableStuffList } from "@/components/searchable-stuff-list";
import { ITEMS } from "@/lib/fixtures/items";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";

// Wireframe screen 02, "Home — everything (default)": search box + the full
// item list, each row showing its full location path. The "All/By place/
// Recent" toggle chips and the "+" add-item FAB drawn on that screen are
// separate flows (Browse, Stash) — out of scope here, not silently dropped.
export default function Page() {
  const entries: StuffListEntry[] = ITEMS.map((item) => ({
    item,
    segments: getBreadcrumbSegments(item.locationId, LOCATIONS),
  }));

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Our stuff</h1>

      {/*
        SearchableStuffList owns the search input's state and filters
        `entries` client-side (src/lib/fixtures/search.ts) — a real,
        working filter now, not the earlier visual-only placeholder.
        Entries themselves are still resolved server-side here, not
        fetched by the client component.
      */}
      <SearchableStuffList entries={entries} />
    </main>
  );
}
