import Link from "next/link";
import type { StuffListEntry } from "@/components/stuff-list";
import { SearchableStuffList } from "@/components/searchable-stuff-list";
import { ITEMS } from "@/lib/fixtures/items";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";

// Wireframe screen 02, "Home — everything (default)": search box + the full
// item list, each row showing its full location path. The "All/By place/
// Recent" toggle chips drawn on that screen are a separate flow (Browse) —
// out of scope here, not silently dropped. The "+" add-item control (Stash)
// is wired below to /items/new — no entry point existed anywhere in the app
// before this, so this is a new control, not a repair of an existing link.
export default function Page() {
  const entries: StuffListEntry[] = ITEMS.map((item) => ({
    item,
    segments: getBreadcrumbSegments(item.locationId, LOCATIONS),
  }));

  return (
    <main className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-[16px] font-semibold text-ink">Our stuff</h1>
        <Link
          href="/items/new"
          className="inline-flex items-center justify-center rounded-[8px] bg-ink px-[10px] py-[7px] text-[12px] font-semibold text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          + Add item
        </Link>
      </div>

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
